-- =============================================================================
-- MbareteFans · 005 · Monetization: Pro plans, subscriptions (multi-channel
-- entitlements), KYC, bank accounts, wallet ledger and payouts.
--
--  * Clients can READ their own financial state but never WRITE it.
--  * Subscriptions are written only by Edge Functions (service role) after
--    verifying the purchase with Google Play / App Store / the web provider.
--  * The wallet is an append-only ledger: balances are derived, never stored.
--  * Withdrawals require Pro + KYC VERIFIED + verified bank account + balance
--    AVAILABLE, validated here under a per-wallet lock.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Plans (prices configurable per currency, in minor units)
-- -----------------------------------------------------------------------------
create table public.plans (
  id text primary key check (id ~ '^[a-z_]{3,32}$'),
  name text not null,
  tier smallint not null,
  description text not null,
  benefits text[] not null default '{}',
  prices jsonb not null,
  google_product_id text unique,
  apple_product_id text unique,
  active boolean not null default true
);
alter table public.plans enable row level security;
grant select on public.plans to authenticated;
create policy "active plans are visible" on public.plans for select to authenticated using (active);

insert into public.plans (id, name, tier, description, benefits, prices, google_product_id, apple_product_id) values
  ('pro_basico', 'Pro Básico', 1, 'Retirá tus ganancias y accedé a analytics ampliados',
   array['Retiro de ganancias', 'Monetización completa', 'Analytics ampliados', 'Protección de identidad'],
   '{"PYG": 100000, "ARS": 1500000, "BRL": 6990}', 'mbarete_pro_basico', 'mbarete.pro.basico'),
  ('pro_intermedio', 'Pro Intermedio', 2, 'Todo Básico + analytics avanzados y estadísticas por país',
   array['Todo lo de Pro Básico', 'Analytics avanzados', 'Estadísticas por país', 'Mejor promoción'],
   '{"PYG": 150000, "ARS": 2200000, "BRL": 9990}', 'mbarete_pro_intermedio', 'mbarete.pro.intermedio'),
  ('pro_absoluto', 'Pro Absoluto', 3, 'Máxima prioridad controlada, soporte prioritario y herramientas comerciales',
   array['Todo lo de Pro Intermedio', 'Máxima prioridad controlada', 'Soporte prioritario', 'Herramientas comerciales'],
   '{"PYG": 200000, "ARS": 3000000, "BRL": 12990}', 'mbarete_pro_absoluto', 'mbarete.pro.absoluto')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Subscriptions (one entitlement system, several billing channels)
-- -----------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id text not null references public.plans (id),
  status text not null check (status in ('active', 'grace', 'on_hold', 'canceled', 'expired', 'revoked')),
  channel text not null check (channel in ('google_play', 'app_store', 'web', 'sandbox')),
  external_id text not null check (char_length(external_id) between 1 and 300),
  current_period_end timestamptz not null,
  auto_renew boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel, external_id)
);
create index subscriptions_user_idx on public.subscriptions (user_id, current_period_end desc);
alter table public.subscriptions enable row level security;
grant select on public.subscriptions to authenticated;
create policy "users see their subscriptions" on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

create table private.subscription_events (
  id bigint generated always as identity primary key,
  channel text not null,
  event_id text not null,
  event_type text not null,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  unique (channel, event_id)
);
alter table private.subscription_events enable row level security;

-- Pro = an entitlement whose paid period has not ended. A canceled plan stays
-- active until the end of the paid period (spec).
create function private.is_pro(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = p_user
      and status in ('active', 'grace', 'canceled')
      and current_period_end > now()
  )
$$;

create or replace function private.is_pro_public(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_pro(p_user)
$$;

-- Service-role guard (defence in depth on top of GRANTs).
create function private.assert_service_role()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', 'service_role') <> 'service_role' then
    raise exception 'Solo el servidor puede ejecutar esta operación' using errcode = 'PT403';
  end if;
end;
$$;

-- Applies a verified billing event. Idempotent on (channel, event_id).
create function public.svc_apply_subscription(
  p_user uuid,
  p_plan text,
  p_channel text,
  p_external_id text,
  p_status text,
  p_period_end timestamptz,
  p_auto_renew boolean,
  p_event_id text,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub uuid;
  v_event bigint;
  v_was_pro boolean;
  v_plan_name text;
begin
  perform private.assert_service_role();

  insert into private.subscription_events (channel, event_id, event_type, payload)
  values (p_channel, p_event_id, p_event_type, coalesce(p_payload, '{}'::jsonb))
  on conflict (channel, event_id) do nothing
  returning id into v_event;

  if v_event is null then
    -- already processed: return the subscription it touched
    select subscription_id into v_sub from private.subscription_events where channel = p_channel and event_id = p_event_id;
    return v_sub;
  end if;

  select name into v_plan_name from public.plans where id = p_plan;
  if v_plan_name is null then
    raise exception 'Plan desconocido: %', p_plan using errcode = '22023';
  end if;

  v_was_pro := private.is_pro(p_user);

  insert into public.subscriptions (user_id, plan_id, status, channel, external_id, current_period_end, auto_renew)
  values (p_user, p_plan, p_status, p_channel, p_external_id, p_period_end, coalesce(p_auto_renew, true))
  on conflict (channel, external_id) do update
    set plan_id = excluded.plan_id,
        status = excluded.status,
        current_period_end = excluded.current_period_end,
        auto_renew = excluded.auto_renew,
        updated_at = now()
    where public.subscriptions.user_id = excluded.user_id
  returning id into v_sub;

  if v_sub is null then
    raise exception 'La compra pertenece a otra cuenta' using errcode = 'PT409';
  end if;

  update private.subscription_events set subscription_id = v_sub where id = v_event;

  if not v_was_pro and private.is_pro(p_user) then
    perform private.notify(p_user, 'payment', 'Pago confirmado: ' || v_plan_name || ' activo', null, null,
                           jsonb_build_object('plan', p_plan, 'channel', p_channel));
  elsif v_was_pro and not private.is_pro(p_user) then
    perform private.notify(p_user, 'payment', 'Tu plan Pro terminó. Tus ganancias siguen registradas.', null, null,
                           jsonb_build_object('plan', p_plan));
  end if;

  perform private.audit('subscription.' || p_event_type, 'subscriptions', v_sub::text, null,
    jsonb_build_object('plan', p_plan, 'status', p_status, 'channel', p_channel, 'period_end', p_period_end));
  return v_sub;
end;
$$;

-- -----------------------------------------------------------------------------
-- KYC
-- -----------------------------------------------------------------------------
create type public.kyc_status as enum ('PENDING', 'REVIEW', 'VERIFIED', 'REJECTED', 'SUSPENDED');

create table public.kyc_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status public.kyc_status not null default 'PENDING',
  legal_name text check (char_length(legal_name) between 3 and 120),
  document_type text check (document_type in ('ci', 'dni', 'cpf', 'passport')),
  document_country char(2) references public.countries (code),
  document_last4 text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  rejection_reason text,
  updated_at timestamptz not null default now()
);
alter table public.kyc_profiles enable row level security;
grant select on public.kyc_profiles to authenticated;
create policy "users see their KYC state" on public.kyc_profiles
  for select to authenticated using (user_id = (select auth.uid()));

-- Documents and identity hash: never readable through the API.
create table private.kyc_documents (
  user_id uuid primary key references auth.users (id) on delete cascade,
  document_hash text not null,
  front_path text not null,
  back_path text,
  selfie_path text not null,
  submitted_at timestamptz not null default now(),
  reviewer_id uuid
);
create index kyc_documents_hash_idx on private.kyc_documents (document_hash);
alter table private.kyc_documents enable row level security;

-- Survives account deletion: one verified identity = one monetized account,
-- and suspended identities cannot come back with a new account.
create table private.kyc_identity_registry (
  document_hash text primary key,
  user_id uuid,
  status public.kyc_status not null,
  updated_at timestamptz not null default now()
);
alter table private.kyc_identity_registry enable row level security;

create function private.normalize_name(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(p, '')), 'áéíóúüñàèìòùâêîôûãõçä', 'aeiouunaeiouaeiouaoca'),
    '[^a-z ]+|\s+', ' ', 'g'))
$$;

create function public.submit_kyc(
  p_legal_name text,
  p_document_type text,
  p_document_country text,
  p_document_number text,
  p_front_path text,
  p_back_path text,
  p_selfie_path text
)
returns public.kyc_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_current public.kyc_status;
  v_number text := upper(regexp_replace(coalesce(p_document_number, ''), '[^A-Za-z0-9]', '', 'g'));
  v_country text := upper(btrim(coalesce(p_document_country, '')));
  v_hash text;
  v_name text := private.clean_text(p_legal_name);
  v_registry record;
begin
  if v_uid is null then
    raise exception 'Iniciá sesión' using errcode = 'PT401';
  end if;
  perform private.check_rate_limit('kyc', 'limits.kyc_per_day', 5, interval '1 day');

  select status into v_current from public.kyc_profiles where user_id = v_uid;
  if v_current in ('REVIEW', 'VERIFIED', 'SUSPENDED') then
    raise exception 'Tu verificación ya está %', lower(v_current::text) using errcode = 'PT409';
  end if;

  if char_length(v_name) < 3 or char_length(v_name) > 120 then
    raise exception 'Ingresá tu nombre completo tal como figura en el documento' using errcode = '22023';
  end if;
  if p_document_type not in ('ci', 'dni', 'cpf', 'passport') then
    raise exception 'Tipo de documento inválido' using errcode = '22023';
  end if;
  if not exists (select 1 from public.countries where code = v_country) then
    raise exception 'País de documento no soportado' using errcode = '22023';
  end if;
  if char_length(v_number) < 5 or char_length(v_number) > 20 then
    raise exception 'Número de documento inválido' using errcode = '22023';
  end if;

  -- documents must be files this user uploaded to the private kyc bucket
  if not exists (select 1 from storage.objects where bucket_id = 'kyc' and name = p_front_path
                   and (storage.foldername(name))[1] = v_uid::text)
     or not exists (select 1 from storage.objects where bucket_id = 'kyc' and name = p_selfie_path
                   and (storage.foldername(name))[1] = v_uid::text)
     or (p_back_path is not null and not exists (select 1 from storage.objects where bucket_id = 'kyc'
                   and name = p_back_path and (storage.foldername(name))[1] = v_uid::text)) then
    raise exception 'Subí las fotos del documento y la selfie antes de enviar' using errcode = '22023';
  end if;

  v_hash := encode(extensions.hmac(v_country || ':' || p_document_type || ':' || v_number,
                                   private.secret('kyc_pepper'), 'sha256'), 'hex');

  select * into v_registry from private.kyc_identity_registry where document_hash = v_hash;
  if found and v_registry.status = 'SUSPENDED' then
    raise exception 'Esta identidad no puede verificarse. Contactá a soporte.' using errcode = 'PT403';
  end if;
  if found and v_registry.user_id is distinct from v_uid and v_registry.status = 'VERIFIED'
     and exists (select 1 from auth.users where id = v_registry.user_id) then
    raise exception 'Esta identidad ya está asociada a otra cuenta monetizada' using errcode = 'PT409';
  end if;
  if exists (select 1 from private.kyc_documents d join public.kyc_profiles k on k.user_id = d.user_id
             where d.document_hash = v_hash and d.user_id <> v_uid and k.status in ('REVIEW', 'VERIFIED')) then
    raise exception 'Esta identidad ya está asociada a otra cuenta monetizada' using errcode = 'PT409';
  end if;

  insert into private.kyc_documents (user_id, document_hash, front_path, back_path, selfie_path, submitted_at)
  values (v_uid, v_hash, p_front_path, p_back_path, p_selfie_path, now())
  on conflict (user_id) do update
    set document_hash = excluded.document_hash, front_path = excluded.front_path,
        back_path = excluded.back_path, selfie_path = excluded.selfie_path,
        submitted_at = now(), reviewer_id = null;

  insert into public.kyc_profiles (user_id, status, legal_name, document_type, document_country, document_last4,
                                   submitted_at, reviewed_at, rejection_reason, updated_at)
  values (v_uid, 'REVIEW', v_name, p_document_type, v_country, right(v_number, 4), now(), null, null, now())
  on conflict (user_id) do update
    set status = 'REVIEW', legal_name = excluded.legal_name, document_type = excluded.document_type,
        document_country = excluded.document_country, document_last4 = excluded.document_last4,
        submitted_at = now(), reviewed_at = null, rejection_reason = null, updated_at = now();

  perform private.audit('kyc.submit', 'kyc_profiles', v_uid::text, null,
    jsonb_build_object('document_type', p_document_type, 'country', v_country, 'last4', right(v_number, 4)));
  perform private.notify(v_uid, 'kyc', 'Recibimos tu verificación de identidad. Está en revisión.');
  return 'REVIEW';
end;
$$;

-- -----------------------------------------------------------------------------
-- Bank accounts (account number encrypted at rest, only last 4 visible)
-- -----------------------------------------------------------------------------
create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  bank_name text not null check (char_length(bank_name) between 2 and 80),
  account_type text not null check (account_type in ('savings', 'checking')),
  holder_name text not null check (char_length(holder_name) between 3 and 120),
  currency char(3) not null,
  account_last4 text not null,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.bank_accounts enable row level security;
grant select on public.bank_accounts to authenticated;
create policy "users see their bank account" on public.bank_accounts
  for select to authenticated using (user_id = (select auth.uid()));

create table private.bank_account_secrets (
  bank_account_id uuid primary key references public.bank_accounts (id) on delete cascade,
  account_number_enc bytea not null
);
alter table private.bank_account_secrets enable row level security;

create function public.upsert_bank_account(
  p_bank_name text,
  p_account_type text,
  p_holder_name text,
  p_account_number text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_number text := upper(regexp_replace(coalesce(p_account_number, ''), '[\s-]', '', 'g'));
  v_holder text := private.clean_text(p_holder_name);
  v_currency text;
  v_kyc record;
  v_status text := 'pending';
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Iniciá sesión' using errcode = 'PT401';
  end if;
  perform private.check_rate_limit('bank', 'limits.kyc_per_day', 5, interval '1 day');

  if exists (select 1 from public.payouts where user_id = v_uid and status = 'PROCESSING') then
    raise exception 'No podés cambiar la cuenta mientras hay un retiro en proceso' using errcode = 'PT409';
  end if;
  if v_number !~ '^[A-Z0-9]{6,34}$' then
    raise exception 'Número de cuenta inválido' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_bank_name, ''))) < 2 then
    raise exception 'Indicá el banco' using errcode = '22023';
  end if;
  if char_length(v_holder) < 3 then
    raise exception 'Indicá el titular de la cuenta' using errcode = '22023';
  end if;
  if p_account_type not in ('savings', 'checking') then
    raise exception 'Tipo de cuenta inválido' using errcode = '22023';
  end if;

  select c.currency into v_currency
  from public.profiles p join public.countries c on c.code = p.country where p.id = v_uid;

  select * into v_kyc from public.kyc_profiles where user_id = v_uid;
  if v_kyc.status = 'VERIFIED' and private.normalize_name(v_kyc.legal_name) = private.normalize_name(v_holder) then
    v_status := 'verified';
  end if;

  insert into public.bank_accounts (user_id, bank_name, account_type, holder_name, currency, account_last4, status)
  values (v_uid, btrim(p_bank_name), p_account_type, v_holder, v_currency, right(v_number, 4), v_status)
  on conflict (user_id) do update
    set bank_name = excluded.bank_name, account_type = excluded.account_type, holder_name = excluded.holder_name,
        currency = excluded.currency, account_last4 = excluded.account_last4, status = excluded.status,
        updated_at = now()
  returning id into v_id;

  insert into private.bank_account_secrets (bank_account_id, account_number_enc)
  values (v_id, extensions.pgp_sym_encrypt(v_number, private.secret('bank_key')))
  on conflict (bank_account_id) do update set account_number_enc = excluded.account_number_enc;

  perform private.audit('bank_account.upsert', 'bank_accounts', v_id::text, null,
    jsonb_build_object('bank', btrim(p_bank_name), 'last4', right(v_number, 4), 'status', v_status));
  perform private.notify(v_uid, 'security',
    'Se registró una cuenta bancaria terminada en ' || right(v_number, 4) || '. Si no fuiste vos, contactá a soporte.');
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Wallet ledger (append-only). Amounts are signed, in minor units.
-- A bucket balance = sum of its entries. Moves are two entries in one tx.
-- -----------------------------------------------------------------------------
create type public.balance_bucket as enum ('ESTIMATED', 'PENDING', 'CONFIRMED', 'AVAILABLE', 'PROCESSING', 'PAID');

create table public.wallet_ledger (
  id bigint generated always as identity primary key,
  tx_id uuid not null,
  user_id uuid not null,               -- no FK: financial records are retained
  currency char(3) not null,
  bucket public.balance_bucket,        -- null only for informational fee rows
  amount bigint not null check (amount <> 0),
  entry_type text not null check (entry_type in
    ('credit', 'debit', 'hold', 'release', 'payout', 'refund', 'adjustment', 'fee')),
  source text not null check (source in ('ads', 'membership', 'promotion', 'payout', 'adjustment', 'platform')),
  description text not null default '',
  reference text,
  created_at timestamptz not null default now(),
  created_by uuid,
  check ((entry_type = 'fee') = (bucket is null))
);
create index wallet_ledger_user_idx on public.wallet_ledger (user_id, currency, created_at desc);
create unique index wallet_ledger_reference_idx on public.wallet_ledger (reference, entry_type, bucket) where reference is not null;
alter table public.wallet_ledger enable row level security;
grant select on public.wallet_ledger to authenticated;
create policy "users see their ledger" on public.wallet_ledger
  for select to authenticated using (user_id = (select auth.uid()));

create trigger wallet_ledger_immutable
  before update or delete on public.wallet_ledger
  for each row execute function private.prevent_mutation();

create view public.wallet_balances with (security_invoker = true) as
  select user_id, currency, bucket, sum(amount)::bigint as amount
  from public.wallet_ledger
  where bucket is not null
  group by user_id, currency, bucket;
grant select on public.wallet_balances to authenticated;

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  amount bigint not null check (amount > 0),
  currency char(3) not null,
  status text not null default 'PROCESSING' check (status in ('PROCESSING', 'PAID', 'FAILED', 'REVERSED')),
  bank_account_id uuid references public.bank_accounts (id) on delete set null,
  bank_last4 text,
  provider text,
  provider_ref text,
  failure_reason text,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payouts_user_idx on public.payouts (user_id, requested_at desc);
create unique index payouts_one_processing_idx on public.payouts (user_id) where status = 'PROCESSING';
alter table public.payouts enable row level security;
grant select on public.payouts to authenticated;
create policy "users see their payouts" on public.payouts
  for select to authenticated using (user_id = (select auth.uid()));

create function private.lock_wallet(p_user uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('wallet:' || p_user::text, 0))
$$;

create function private.bucket_balance(p_user uuid, p_currency text, p_bucket public.balance_bucket)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(amount), 0)::bigint from public.wallet_ledger
  where user_id = p_user and currency = p_currency and bucket = p_bucket
$$;

-- Moves p_amount between buckets (or credits when p_from is null).
create function private.ledger_move(
  p_user uuid, p_currency text, p_from public.balance_bucket, p_to public.balance_bucket, p_amount bigint,
  p_type text, p_source text, p_description text, p_reference text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx uuid := gen_random_uuid();
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Monto inválido' using errcode = '22023';
  end if;
  perform private.lock_wallet(p_user);
  if p_from is not null then
    if private.bucket_balance(p_user, p_currency, p_from) < p_amount then
      raise exception 'Saldo insuficiente en %', p_from using errcode = 'PT409';
    end if;
    insert into public.wallet_ledger (tx_id, user_id, currency, bucket, amount, entry_type, source, description, reference, created_by)
    values (v_tx, p_user, p_currency, p_from, -p_amount, p_type, p_source, p_description, p_reference, (select auth.uid()));
  end if;
  if p_to is not null then
    insert into public.wallet_ledger (tx_id, user_id, currency, bucket, amount, entry_type, source, description, reference, created_by)
    values (v_tx, p_user, p_currency, p_to, p_amount, p_type, p_source, p_description, p_reference, (select auth.uid()));
  end if;
  return v_tx;
end;
$$;

-- Records creator earnings from a gross amount (ads 70/30, memberships 80/20
-- by default, configurable). Idempotent on p_reference.
create function private.credit_earnings(p_user uuid, p_source text, p_gross bigint, p_currency text,
                                        p_reference text, p_description text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_share numeric;
  v_net bigint;
  v_tx uuid;
begin
  if p_source not in ('ads', 'membership', 'promotion') then
    raise exception 'Fuente inválida' using errcode = '22023';
  end if;
  if p_reference is null or char_length(p_reference) < 3 then
    raise exception 'Se requiere una referencia única' using errcode = '22023';
  end if;
  select tx_id into v_tx from public.wallet_ledger where reference = p_reference and entry_type = 'credit' limit 1;
  if v_tx is not null then
    return v_tx; -- idempotent
  end if;
  if not exists (select 1 from public.countries where currency = p_currency) then
    raise exception 'Moneda no soportada' using errcode = '22023';
  end if;

  v_share := case p_source
    when 'membership' then private.config_num('revenue.membership_creator_share', 0.80)
    else private.config_num('revenue.ads_creator_share', 0.70) end;
  v_net := floor(p_gross * v_share)::bigint;
  if v_net <= 0 then
    raise exception 'Monto inválido' using errcode = '22023';
  end if;

  v_tx := private.ledger_move(p_user, p_currency, null, 'ESTIMATED', v_net, 'credit', p_source,
    coalesce(p_description, case p_source when 'membership' then 'Membresías' when 'ads' then 'Publicidad válida' else 'Promoción' end)
      || ' · ' || round(v_share * 100) || '% para vos', p_reference);
  if p_gross - v_net > 0 then
    insert into public.wallet_ledger (tx_id, user_id, currency, bucket, amount, entry_type, source, description, reference, created_by)
    values (v_tx, p_user, p_currency, null, -(p_gross - v_net), 'fee', 'platform',
            'Comisión de plataforma (' || round((1 - v_share) * 100) || '%)', p_reference, (select auth.uid()));
  end if;
  perform private.notify(p_user, 'earning', 'Registramos nuevas ganancias en tu panel de creador', null, null,
                         jsonb_build_object('amount', v_net, 'currency', p_currency, 'source', p_source));
  return v_tx;
end;
$$;

create function public.svc_credit_earnings(p_user uuid, p_source text, p_gross bigint, p_currency text, p_reference text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_service_role();
  return private.credit_earnings(p_user, p_source, p_gross, p_currency, p_reference, null);
end;
$$;

-- Forward-only balance transitions ESTIMATED -> PENDING -> CONFIRMED -> AVAILABLE.
create function private.advance_balance(p_user uuid, p_currency text, p_from public.balance_bucket,
                                        p_to public.balance_bucket, p_amount bigint, p_reference text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not ((p_from = 'ESTIMATED' and p_to = 'PENDING') or (p_from = 'PENDING' and p_to = 'CONFIRMED')
          or (p_from = 'CONFIRMED' and p_to = 'AVAILABLE') or (p_from = 'ESTIMATED' and p_to = 'AVAILABLE')) then
    raise exception 'Transición de saldo no permitida: % -> %', p_from, p_to using errcode = '22023';
  end if;
  return private.ledger_move(p_user, p_currency, p_from, p_to, p_amount, 'release', 'adjustment',
                             'Saldo ' || lower(p_from::text) || ' pasa a ' || lower(p_to::text), p_reference);
end;
$$;

create function public.svc_advance_balance(p_user uuid, p_currency text, p_from public.balance_bucket,
                                           p_to public.balance_bucket, p_amount bigint, p_reference text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_service_role();
  return private.advance_balance(p_user, p_currency, p_from, p_to, p_amount, p_reference);
end;
$$;

-- -----------------------------------------------------------------------------
-- Payouts
-- -----------------------------------------------------------------------------
create function private.user_currency(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.currency from public.profiles p join public.countries c on c.code = p.country where p.id = p_user
$$;

-- Reasons why the caller cannot withdraw right now (empty = allowed).
create function private.withdraw_blockers(p_user uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_blockers text[] := '{}';
  v_currency text := private.user_currency(p_user);
  v_bank record;
  v_cooldown integer := private.config_num('payout.bank_change_cooldown_hours', 24)::integer;
  v_min bigint := coalesce((private.config('payout.min_amount') ->> v_currency)::bigint, 0);
begin
  if not exists (select 1 from public.profiles where id = p_user and status = 'active') then
    v_blockers := array_append(v_blockers, 'account_restricted');
  end if;
  if not private.is_pro(p_user) then
    v_blockers := array_append(v_blockers, 'pro_required');
  end if;
  if not exists (select 1 from public.kyc_profiles where user_id = p_user and status = 'VERIFIED') then
    v_blockers := array_append(v_blockers, 'kyc_required');
  end if;
  select * into v_bank from public.bank_accounts where user_id = p_user;
  if not found then
    v_blockers := array_append(v_blockers, 'bank_required');
  elsif v_bank.status <> 'verified' then
    v_blockers := array_append(v_blockers, 'bank_unverified');
  elsif v_bank.updated_at > now() - make_interval(hours => v_cooldown) then
    v_blockers := array_append(v_blockers, 'bank_cooldown');
  end if;
  if exists (select 1 from public.payouts where user_id = p_user and status = 'PROCESSING') then
    v_blockers := array_append(v_blockers, 'payout_in_progress');
  end if;
  if private.bucket_balance(p_user, v_currency, 'AVAILABLE') < greatest(v_min, 1) then
    v_blockers := array_append(v_blockers, 'insufficient_available');
  end if;
  return v_blockers;
end;
$$;

create function public.request_payout(p_amount bigint default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_currency text;
  v_available bigint;
  v_amount bigint;
  v_min bigint;
  v_max_day bigint;
  v_today bigint;
  v_blockers text[];
  v_bank record;
  v_payout uuid;
begin
  if v_uid is null then
    raise exception 'Iniciá sesión' using errcode = 'PT401';
  end if;
  perform private.lock_wallet(v_uid);

  v_blockers := private.withdraw_blockers(v_uid);
  if 'pro_required' = any (v_blockers) then
    raise exception 'Necesitás un plan Pro activo para retirar' using errcode = 'PT403';
  elsif 'kyc_required' = any (v_blockers) then
    raise exception 'Verificá tu identidad para poder retirar' using errcode = 'PT403';
  elsif 'bank_required' = any (v_blockers) or 'bank_unverified' = any (v_blockers) then
    raise exception 'Registrá una cuenta bancaria verificada a tu nombre' using errcode = 'PT403';
  elsif 'bank_cooldown' = any (v_blockers) then
    raise exception 'Por seguridad, esperá 24 h después de cambiar tu cuenta bancaria' using errcode = 'PT403';
  elsif 'payout_in_progress' = any (v_blockers) then
    raise exception 'Ya tenés un retiro en proceso' using errcode = 'PT409';
  elsif 'account_restricted' = any (v_blockers) then
    raise exception 'Tu cuenta no puede retirar en este momento' using errcode = 'PT403';
  end if;

  v_currency := private.user_currency(v_uid);
  v_available := private.bucket_balance(v_uid, v_currency, 'AVAILABLE');
  v_amount := coalesce(p_amount, v_available);
  v_min := coalesce((private.config('payout.min_amount') ->> v_currency)::bigint, 1);
  v_max_day := coalesce((private.config('payout.max_per_day') ->> v_currency)::bigint, v_available);

  if v_amount < v_min then
    raise exception 'El retiro mínimo no se alcanza' using errcode = 'PT409';
  end if;
  if v_amount > v_available then
    raise exception 'Saldo disponible insuficiente' using errcode = 'PT409';
  end if;
  select coalesce(sum(amount), 0) into v_today from public.payouts
  where user_id = v_uid and status in ('PROCESSING', 'PAID') and requested_at > now() - interval '24 hours';
  if v_today + v_amount > v_max_day then
    raise exception 'Superás el límite diario de retiro' using errcode = 'PT409';
  end if;

  select * into v_bank from public.bank_accounts where user_id = v_uid;
  insert into public.payouts (user_id, amount, currency, bank_account_id, bank_last4)
  values (v_uid, v_amount, v_currency, v_bank.id, v_bank.account_last4)
  returning id into v_payout;

  perform private.ledger_move(v_uid, v_currency, 'AVAILABLE', 'PROCESSING', v_amount, 'hold', 'payout',
                              'Retiro solicitado', 'payout:' || v_payout::text);
  perform private.audit('payout.request', 'payouts', v_payout::text, null,
    jsonb_build_object('amount', v_amount, 'currency', v_currency, 'bank_last4', v_bank.account_last4));
  perform private.notify(v_uid, 'payout', 'Retiro solicitado. Te avisamos cuando se acredite.', null, null,
                         jsonb_build_object('payout_id', v_payout, 'amount', v_amount, 'currency', v_currency));
  return v_payout;
end;
$$;

-- Payout provider result (called by the payout webhook). Idempotent.
create function public.svc_complete_payout(p_payout uuid, p_status text, p_provider text, p_provider_ref text,
                                           p_failure_reason text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payout record;
begin
  perform private.assert_service_role();
  if p_status not in ('PAID', 'FAILED') then
    raise exception 'Estado inválido' using errcode = '22023';
  end if;
  select * into v_payout from public.payouts where id = p_payout for update;
  if not found then
    raise exception 'Retiro inexistente' using errcode = 'PT404';
  end if;
  if v_payout.status <> 'PROCESSING' then
    return v_payout.status; -- already settled
  end if;

  if p_status = 'PAID' then
    perform private.ledger_move(v_payout.user_id, v_payout.currency, 'PROCESSING', 'PAID', v_payout.amount,
                                'payout', 'payout', 'Retiro acreditado', 'payout:' || p_payout::text);
    perform private.notify(v_payout.user_id, 'payout', 'Tu retiro fue acreditado en tu cuenta bancaria.');
  else
    perform private.ledger_move(v_payout.user_id, v_payout.currency, 'PROCESSING', 'AVAILABLE', v_payout.amount,
                                'refund', 'payout', 'Retiro fallido: saldo devuelto', 'payout:' || p_payout::text);
    perform private.notify(v_payout.user_id, 'payout', 'Tu retiro no pudo acreditarse. El saldo volvió a disponible.');
  end if;

  update public.payouts set status = p_status, provider = p_provider, provider_ref = p_provider_ref,
                            failure_reason = p_failure_reason, updated_at = now()
  where id = p_payout;
  perform private.audit('payout.' || lower(p_status), 'payouts', p_payout::text,
    jsonb_build_object('status', 'PROCESSING'), jsonb_build_object('status', p_status, 'provider_ref', p_provider_ref));
  return p_status;
end;
$$;

-- -----------------------------------------------------------------------------
-- Creator panel summary (read-only)
-- -----------------------------------------------------------------------------
create function public.get_my_monetization()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_currency text;
  v_decimals smallint;
  v_sub record;
  v_kyc record;
  v_bank record;
  v_payout record;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Iniciá sesión' using errcode = 'PT401';
  end if;
  select c.currency, c.currency_decimals into v_currency, v_decimals
  from public.profiles p join public.countries c on c.code = p.country where p.id = v_uid;

  select s.*, pl.name as plan_name into v_sub
  from public.subscriptions s join public.plans pl on pl.id = s.plan_id
  where s.user_id = v_uid and s.status in ('active', 'grace', 'canceled') and s.current_period_end > now()
  order by pl.tier desc, s.current_period_end desc limit 1;

  select status, legal_name, rejection_reason, submitted_at into v_kyc from public.kyc_profiles where user_id = v_uid;
  select bank_name, holder_name, account_last4, account_type, status, updated_at into v_bank
  from public.bank_accounts where user_id = v_uid;
  select id, amount, status, requested_at into v_payout
  from public.payouts where user_id = v_uid order by requested_at desc limit 1;

  v_result := jsonb_build_object(
    'currency', v_currency,
    'currency_decimals', v_decimals,
    'is_pro', v_sub.id is not null,
    'subscription', case when v_sub.id is null then null else jsonb_build_object(
        'plan_id', v_sub.plan_id, 'plan_name', v_sub.plan_name, 'status', v_sub.status,
        'channel', v_sub.channel, 'current_period_end', v_sub.current_period_end, 'auto_renew', v_sub.auto_renew) end,
    'kyc', jsonb_build_object(
        'status', coalesce(v_kyc.status::text, 'PENDING'),
        'rejection_reason', v_kyc.rejection_reason,
        'submitted_at', v_kyc.submitted_at),
    'bank', case when v_bank.bank_name is null then null else jsonb_build_object(
        'bank_name', v_bank.bank_name, 'holder_name', v_bank.holder_name, 'last4', v_bank.account_last4,
        'account_type', v_bank.account_type, 'status', v_bank.status, 'updated_at', v_bank.updated_at) end,
    'balances', (
      select jsonb_object_agg(b.bucket, coalesce(t.amount, 0))
      from unnest(enum_range(null::public.balance_bucket)) as b(bucket)
      left join (
        select bucket, sum(amount)::bigint as amount from public.wallet_ledger
        where user_id = v_uid and currency = v_currency and bucket is not null group by bucket
      ) t on t.bucket = b.bucket),
    'earnings', (
      select jsonb_object_agg(e.name, jsonb_build_object('ads', e.ads, 'membership', e.membership, 'other', e.other))
      from (
        select r.name,
               coalesce(sum(l.amount) filter (where l.source = 'ads'), 0) as ads,
               coalesce(sum(l.amount) filter (where l.source = 'membership'), 0) as membership,
               coalesce(sum(l.amount) filter (where l.source not in ('ads', 'membership')), 0) as other
        from (values ('today', date_trunc('day', now())), ('week', now() - interval '7 days'),
                     ('month', now() - interval '30 days')) as r(name, since)
        left join public.wallet_ledger l
          on l.user_id = v_uid and l.currency = v_currency and l.entry_type = 'credit' and l.created_at >= r.since
        group by r.name
      ) e),
    'last_payout', case when v_payout.id is null then null else jsonb_build_object(
        'id', v_payout.id, 'amount', v_payout.amount, 'status', v_payout.status, 'requested_at', v_payout.requested_at) end,
    'payout_min', coalesce((private.config('payout.min_amount') ->> v_currency)::bigint, 0),
    'withdraw_blockers', to_jsonb(private.withdraw_blockers(v_uid))
  );
  return v_result;
end;
$$;

-- Basic creator analytics for the app (advanced analytics live on the web).
create function public.get_creator_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'views', coalesce(sum(p.view_count), 0),
    'likes', coalesce(sum(p.like_count), 0),
    'comments', coalesce(sum(p.comment_count), 0),
    'saves', coalesce(sum(p.save_count), 0),
    'posts', count(p.id),
    'followers', (select followers_count from public.profiles where id = (select auth.uid())),
    'new_followers_7d', (select count(*) from public.follows f
                          where f.followee_id = (select auth.uid()) and f.created_at > now() - interval '7 days'),
    'avg_retention', (
      select round(avg(least(v.watched_ms::numeric / nullif(pp.duration_ms, 0), 1)) * 100)
      from private.post_views v join public.posts pp on pp.id = v.post_id
      where pp.author_id = (select auth.uid()) and pp.kind = 'video' and pp.duration_ms > 0),
    'top_posts', coalesce((
      select jsonb_agg(t) from (
        select id, kind, thumb_path, media_path, view_count, like_count, comment_count
        from public.posts where author_id = (select auth.uid()) and status = 'published'
        order by view_count desc, like_count desc limit 5) t), '[]'::jsonb)
  )
  from public.posts p
  where p.author_id = (select auth.uid())
$$;

