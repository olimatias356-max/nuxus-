-- =============================================================================
-- MbareteFans · 001 · Base: schemas, secure defaults, config, reference data,
-- admin roles, audit log and rate limiting.
--
-- Security model (applies to every migration):
--   * Every table has RLS enabled. Nothing is readable or writable unless a
--     policy AND an explicit GRANT allow it (fail closed).
--   * Business-critical state (Pro, KYC, balances, counters, moderation status)
--     is never writable by clients. It changes only through SECURITY DEFINER
--     functions that validate the caller server-side.
--   * SECURITY DEFINER functions always pin `search_path = ''` and use fully
--     qualified names.
--   * Internal tables/functions live in the `private` schema, which is not
--     exposed through the Data API.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- Fail-closed defaults: objects created from now on are NOT accessible to the
-- API roles unless explicitly granted.
-- -----------------------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

create schema if not exists private;
revoke all on schema private from public;
-- USAGE lets RLS policies call helper functions; tables inside stay ungranted.
grant usage on schema private to anon, authenticated, service_role;
alter default privileges in schema private revoke all on tables from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Secrets used inside the database (KYC hashing pepper, bank data key).
-- Generated at migration time, never exposed through the API.
-- -----------------------------------------------------------------------------
create table private.secrets (
  name text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
alter table private.secrets enable row level security;

insert into private.secrets (name, value) values
  ('kyc_pepper', encode(extensions.gen_random_bytes(32), 'hex')),
  ('bank_key', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

create function private.secret(p_name text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select value from private.secrets where name = p_name
$$;

-- -----------------------------------------------------------------------------
-- Business configuration (no hard-coded business rules in the app).
-- -----------------------------------------------------------------------------
create table public.app_config (
  key text primary key check (key ~ '^[a-z0-9_.]{2,64}$'),
  value jsonb not null,
  is_public boolean not null default true,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.app_config enable row level security;
grant select on public.app_config to anon, authenticated;
create policy "public config is readable"
  on public.app_config for select
  to anon, authenticated
  using (is_public);

insert into public.app_config (key, value, is_public, description) values
  ('auth.min_age', '18', true, 'Edad mínima para crear una cuenta'),
  ('revenue.ads_creator_share', '0.70', true, 'Parte del creador sobre publicidad válida'),
  ('revenue.membership_creator_share', '0.80', true, 'Parte del creador sobre membresías'),
  ('payout.min_amount', '{"PYG": 50000, "ARS": 500000, "BRL": 5000}', true, 'Retiro mínimo en unidades menores'),
  ('payout.max_per_day', '{"PYG": 20000000, "ARS": 200000000, "BRL": 2000000}', true, 'Límite diario de retiro (AML)'),
  ('payout.bank_change_cooldown_hours', '24', true, 'Horas de espera tras cambiar la cuenta bancaria'),
  ('moderation.report_threshold', '3', false, 'Reportes distintos que ocultan un contenido hasta revisión humana'),
  ('feed.pro_bonus', '0.05', false, 'Bonificación controlada de distribución para Pro'),
  ('feed.same_creator_decay', '0.55', false, 'Penalización por contenido consecutivo del mismo creador'),
  ('limits.posts_per_hour', '20', false, null),
  ('limits.stories_per_day', '40', false, null),
  ('limits.comments_per_minute', '8', false, null),
  ('limits.comments_per_hour', '120', false, null),
  ('limits.messages_per_minute', '30', false, null),
  ('limits.follows_per_hour', '200', false, null),
  ('limits.reports_per_day', '50', false, null),
  ('limits.conversations_per_hour', '30', false, null),
  ('limits.kyc_per_day', '5', false, null),
  ('limits.views_per_minute', '240', false, null),
  ('app.support_email', '"soporte@mbaretefans.com"', true, 'Contacto de soporte visible en la app'),
  ('app.terms_version', '"2026-09"', true, 'Versión vigente de términos y privacidad')
on conflict (key) do nothing;

create function private.config(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select value from public.app_config where key = p_key
$$;

create function private.config_num(p_key text, p_default numeric)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::numeric from public.app_config where key = p_key), p_default)
$$;

-- -----------------------------------------------------------------------------
-- Reference data
-- -----------------------------------------------------------------------------
create table public.countries (
  code char(2) primary key check (code ~ '^[A-Z]{2}$'),
  name text not null,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  currency_decimals smallint not null check (currency_decimals between 0 and 3),
  enabled boolean not null default true
);
alter table public.countries enable row level security;
grant select on public.countries to anon, authenticated;
create policy "countries are readable" on public.countries for select to anon, authenticated using (true);

insert into public.countries (code, name, currency, currency_decimals) values
  ('PY', 'Paraguay', 'PYG', 0),
  ('AR', 'Argentina', 'ARS', 2),
  ('BR', 'Brasil', 'BRL', 2)
on conflict (code) do nothing;

create table public.categories (
  slug text primary key check (slug ~ '^[a-z]{2,24}$'),
  name text not null,
  sort smallint not null default 0
);
alter table public.categories enable row level security;
grant select on public.categories to anon, authenticated;
create policy "categories are readable" on public.categories for select to anon, authenticated using (true);

insert into public.categories (slug, name, sort) values
  ('cultura', 'Cultura', 1), ('humor', 'Humor', 2), ('musica', 'Música', 3),
  ('deportes', 'Deportes', 4), ('cocina', 'Cocina', 5), ('tecnologia', 'Tecnología', 6),
  ('arte', 'Arte', 7), ('educacion', 'Educación', 8), ('moda', 'Moda', 9),
  ('viajes', 'Viajes', 10), ('gaming', 'Gaming', 11), ('fitness', 'Fitness', 12),
  ('negocios', 'Negocios', 13), ('otros', 'Otros', 99)
on conflict (slug) do nothing;

-- -----------------------------------------------------------------------------
-- Admin roles (granted only from SQL / service role, never from the app)
-- -----------------------------------------------------------------------------
create type public.admin_role as enum
  ('SUPER_ADMIN', 'FINANCE', 'MODERATION', 'KYC', 'SUPPORT', 'ANALYTICS', 'SECURITY');

create table private.admin_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.admin_role not null,
  granted_at timestamptz not null default now(),
  granted_by uuid,
  primary key (user_id, role)
);
alter table private.admin_roles enable row level security;

create function private.has_role(p_role public.admin_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.admin_roles
    where user_id = (select auth.uid()) and role in (p_role, 'SUPER_ADMIN')
  )
$$;

create function public.my_admin_roles()
returns public.admin_role[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(role order by role), '{}')
  from private.admin_roles where user_id = (select auth.uid())
$$;

-- -----------------------------------------------------------------------------
-- Audit log: append-only record of sensitive actions.
-- -----------------------------------------------------------------------------
create table private.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_role text,
  action text not null,
  target_table text,
  target_id text,
  old_value jsonb,
  new_value jsonb,
  reason text,
  ip text,
  created_at timestamptz not null default now()
);
alter table private.audit_logs enable row level security;
create index audit_logs_target_idx on private.audit_logs (target_table, target_id);
create index audit_logs_actor_idx on private.audit_logs (actor_id, created_at desc);

create function private.prevent_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Registro inmutable: % no admite %', tg_table_name, tg_op
    using errcode = 'PT403';
end;
$$;

create trigger audit_logs_immutable
  before update or delete on private.audit_logs
  for each row execute function private.prevent_mutation();

create function private.request_ip()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(split_part(coalesce(
    (nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for'),
    (nullif(current_setting('request.headers', true), '')::json ->> 'x-real-ip'),
    ''), ',', 1), '')
$$;

create function private.audit(
  p_action text,
  p_target_table text,
  p_target_id text,
  p_old jsonb default null,
  p_new jsonb default null,
  p_reason text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.audit_logs (actor_id, actor_role, action, target_table, target_id, old_value, new_value, reason, ip)
  values (
    (select auth.uid()),
    coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', current_user),
    p_action, p_target_table, p_target_id, p_old, p_new, p_reason, private.request_ip()
  )
$$;

-- -----------------------------------------------------------------------------
-- Rate limiting (fixed window per user and action). Raises HTTP 429.
-- -----------------------------------------------------------------------------
create table private.rate_limits (
  user_id uuid not null,
  action text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (user_id, action, window_start)
);
alter table private.rate_limits enable row level security;

create function private.check_rate_limit(p_action text, p_config_key text, p_default integer, p_window interval)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_max integer := private.config_num(p_config_key, p_default)::integer;
  v_start timestamptz := pg_catalog.date_bin(p_window, now(), timestamptz '2000-01-01');
  v_hits integer;
begin
  if v_uid is null then
    return; -- service role / internal jobs are not rate limited
  end if;
  insert into private.rate_limits as rl (user_id, action, window_start, hits)
  values (v_uid, p_action, v_start, 1)
  on conflict (user_id, action, window_start) do update set hits = rl.hits + 1
  returning hits into v_hits;

  if v_hits > v_max then
    raise exception 'Demasiada actividad seguida. Esperá un momento y probá de nuevo.'
      using errcode = 'PT429';
  end if;

  if random() < 0.01 then
    delete from private.rate_limits where window_start < now() - interval '2 days';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Generic helpers
-- -----------------------------------------------------------------------------
create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Normalises user text: trims, removes control characters (except newlines),
-- collapses runs of blank lines. Used by content triggers.
create function private.clean_text(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(
    regexp_replace(coalesce(p, ''), '[\x01-\x09\x0B-\x1F\x7F\u200B-\u200F\u202A-\u202E\u2066-\u2069]', '', 'g'),
    '\n{3,}', E'\n\n', 'g'))
$$;
