-- =============================================================================
-- MbareteFans · 007 · Moderation (strikes, appeals) and role-checked admin
-- operations. Every admin action is written to the audit log.
-- =============================================================================

-- Moderators can see content under review.
drop policy "published posts are visible" on public.posts;
create policy "published posts are visible" on public.posts
  for select to authenticated
  using (
    author_id = (select auth.uid())
    or (status = 'published' and private.can_see_user(author_id))
    or private.has_role('MODERATION')
  );

drop policy "active stories are visible" on public.stories;
create policy "active stories are visible" on public.stories
  for select to authenticated
  using (
    (expires_at > now()
      and (author_id = (select auth.uid()) or (status = 'published' and private.can_see_user(author_id))))
    or private.has_role('MODERATION')
  );

insert into public.app_config (key, value, is_public, description) values
  ('moderation.strikes_restrict', '3', false, 'Strikes activos que restringen la cuenta'),
  ('moderation.strikes_suspend', '5', false, 'Strikes activos que suspenden la cuenta'),
  ('moderation.strike_days', '90', false, 'Días que un strike permanece activo')
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Strikes and appeals
-- -----------------------------------------------------------------------------
create table public.strikes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null,
  target_type text,
  target_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index strikes_user_idx on public.strikes (user_id, expires_at);
alter table public.strikes enable row level security;
grant select on public.strikes to authenticated;
create policy "users see their strikes" on public.strikes
  for select to authenticated using (user_id = (select auth.uid()) or private.has_role('MODERATION'));

create table public.appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('post', 'story', 'comment', 'account', 'kyc', 'strike')),
  target_id uuid,
  message text not null check (char_length(message) between 10 and 1000),
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text
);
create unique index appeals_one_open_idx on public.appeals (user_id, target_type, target_id) where status = 'open';
alter table public.appeals enable row level security;
grant select on public.appeals to authenticated;
grant insert (target_type, target_id, message) on public.appeals to authenticated;
create policy "users see their appeals" on public.appeals
  for select to authenticated using (user_id = (select auth.uid()) or private.has_role('MODERATION'));
create policy "users appeal" on public.appeals
  for insert to authenticated with check (user_id = (select auth.uid()));

create function private.appeals_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.check_rate_limit('appeal', 'limits.reports_per_day', 50, interval '1 day');
  new.message := private.clean_text(new.message);
  new.status := 'open';
  new.created_at := now();
  return new;
end;
$$;
create trigger appeals_before_insert
  before insert on public.appeals
  for each row execute function private.appeals_before_insert();

create function private.apply_strike_policy(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active integer;
begin
  select count(*) into v_active from public.strikes
  where user_id = p_user and revoked_at is null and expires_at > now();
  if v_active >= private.config_num('moderation.strikes_suspend', 5) then
    update public.profiles set status = 'suspended' where id = p_user and status <> 'suspended';
  elsif v_active >= private.config_num('moderation.strikes_restrict', 3) then
    update public.profiles set status = 'restricted' where id = p_user and status = 'active';
  end if;
end;
$$;

create function private.assert_role(p_role public.admin_role)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_role(p_role) then
    raise exception 'No tenés permisos para esta acción' using errcode = 'PT403';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Moderation queue
-- -----------------------------------------------------------------------------
create function public.admin_list_reports(p_limit integer default 50)
returns table (
  target_type text,
  target_id uuid,
  report_count integer,
  reasons text[],
  first_reported_at timestamptz,
  owner_id uuid,
  owner_username text,
  preview_text text,
  preview_media_path text,
  preview_kind text,
  content_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_role('MODERATION');
  return query
  select r.target_type, r.target_id, count(*)::integer, array_agg(distinct r.reason), min(r.created_at),
         coalesce(po.author_id, st.author_id, co.author_id, pr.id),
         owner.username,
         coalesce(po.caption, st.caption, co.body, pr.bio, msg.body),
         coalesce(po.thumb_path, po.media_path, st.media_path),
         coalesce(po.kind, st.kind),
         coalesce(po.status, st.status, co.status, pr.status)
  from public.reports r
  left join public.posts po on r.target_type = 'post' and po.id = r.target_id
  left join public.stories st on r.target_type = 'story' and st.id = r.target_id
  left join public.comments co on r.target_type = 'comment' and co.id = r.target_id
  left join public.profiles pr on r.target_type = 'user' and pr.id = r.target_id
  left join public.messages msg on r.target_type = 'message' and msg.id = r.target_id
  left join public.profiles owner on owner.id = coalesce(po.author_id, st.author_id, co.author_id, pr.id, msg.sender_id)
  where r.status = 'open'
  group by r.target_type, r.target_id, po.author_id, st.author_id, co.author_id, pr.id, owner.username,
           po.caption, st.caption, co.body, pr.bio, msg.body, po.thumb_path, po.media_path, st.media_path,
           po.kind, st.kind, po.status, st.status, co.status, pr.status, msg.sender_id
  order by bool_or(r.reason = 'minors') desc, count(*) desc, min(r.created_at)
  limit least(greatest(p_limit, 1), 200);
end;
$$;

-- p_action: 'dismiss' | 'remove' | 'restore' | 'suspend_user'
create function public.admin_resolve_report(p_target_type text, p_target_id uuid, p_action text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_days integer := private.config_num('moderation.strike_days', 90)::integer;
begin
  perform private.assert_role('MODERATION');
  if p_action not in ('dismiss', 'remove', 'restore', 'suspend_user') then
    raise exception 'Acción inválida' using errcode = '22023';
  end if;

  v_owner := case p_target_type
    when 'post' then (select author_id from public.posts where id = p_target_id)
    when 'story' then (select author_id from public.stories where id = p_target_id)
    when 'comment' then (select author_id from public.comments where id = p_target_id)
    when 'message' then (select sender_id from public.messages where id = p_target_id)
    when 'user' then p_target_id
  end;

  if p_action in ('remove', 'suspend_user') then
    if p_target_type = 'post' then
      update public.posts set status = 'removed' where id = p_target_id;
    elsif p_target_type = 'story' then
      update public.stories set status = 'removed' where id = p_target_id;
    elsif p_target_type = 'comment' then
      update public.comments set status = 'removed' where id = p_target_id;
    end if;
    if v_owner is not null then
      insert into public.strikes (user_id, reason, target_type, target_id, expires_at)
      values (v_owner, coalesce(p_note, 'Incumplimiento de las reglas de la comunidad'), p_target_type, p_target_id,
              now() + make_interval(days => v_days));
      perform private.notify(v_owner, 'moderation',
        'Quitamos contenido tuyo por incumplir las reglas de la comunidad. Podés apelar desde Ajustes.', null,
        case when p_target_type = 'post' then p_target_id end,
        jsonb_build_object('target_type', p_target_type, 'target_id', p_target_id));
      perform private.apply_strike_policy(v_owner);
    end if;
    if p_action = 'suspend_user' and v_owner is not null then
      update public.profiles set status = 'suspended' where id = v_owner;
    end if;
  elsif p_action in ('restore', 'dismiss') then
    if p_target_type = 'post' then
      update public.posts set status = 'published' where id = p_target_id and status = 'review';
    elsif p_target_type = 'story' then
      update public.stories set status = 'published' where id = p_target_id and status = 'review';
    elsif p_target_type = 'comment' and p_action = 'restore' then
      update public.comments set status = 'published' where id = p_target_id;
    end if;
  end if;

  update public.reports
  set status = case when p_action = 'dismiss' then 'dismissed' else 'actioned' end,
      resolved_at = now(), resolved_by = (select auth.uid()), resolution = coalesce(p_note, p_action)
  where target_type = p_target_type and target_id = p_target_id and status = 'open';

  perform private.audit('moderation.' || p_action, p_target_type, p_target_id::text, null,
                        jsonb_build_object('owner', v_owner), p_note);
end;
$$;

create function public.admin_list_appeals()
returns setof public.appeals
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_role('MODERATION');
  return query select * from public.appeals where status = 'open' order by created_at limit 200;
end;
$$;

create function public.admin_resolve_appeal(p_appeal uuid, p_accept boolean, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appeal public.appeals;
begin
  perform private.assert_role('MODERATION');
  select * into v_appeal from public.appeals where id = p_appeal and status = 'open' for update;
  if not found then
    raise exception 'Apelación inexistente o resuelta' using errcode = 'PT404';
  end if;
  update public.appeals set status = case when p_accept then 'accepted' else 'rejected' end,
                            resolved_at = now(), resolution = p_note
  where id = p_appeal;
  if p_accept then
    if v_appeal.target_type = 'post' then
      update public.posts set status = 'published' where id = v_appeal.target_id and author_id = v_appeal.user_id;
    elsif v_appeal.target_type = 'story' then
      update public.stories set status = 'published' where id = v_appeal.target_id and author_id = v_appeal.user_id;
    elsif v_appeal.target_type = 'comment' then
      update public.comments set status = 'published' where id = v_appeal.target_id and author_id = v_appeal.user_id;
    elsif v_appeal.target_type = 'account' then
      update public.profiles set status = 'active' where id = v_appeal.user_id;
    end if;
    update public.strikes set revoked_at = now()
    where user_id = v_appeal.user_id and revoked_at is null
      and (v_appeal.target_id is null or target_id = v_appeal.target_id or id = v_appeal.target_id);
  end if;
  perform private.notify(v_appeal.user_id, 'moderation',
    case when p_accept then 'Aceptamos tu apelación. Gracias por tu paciencia.'
         else 'Revisamos tu apelación y mantuvimos la decisión.' end);
  perform private.audit('appeal.' || case when p_accept then 'accept' else 'reject' end, 'appeals',
                        p_appeal::text, null, null, p_note);
end;
$$;

-- -----------------------------------------------------------------------------
-- KYC review
-- -----------------------------------------------------------------------------
create function public.admin_list_kyc()
returns table (
  user_id uuid,
  username text,
  legal_name text,
  document_type text,
  document_country text,
  document_last4 text,
  front_path text,
  back_path text,
  selfie_path text,
  submitted_at timestamptz,
  duplicate_identity boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_role('KYC');
  return query
  select k.user_id, p.username, k.legal_name, k.document_type, k.document_country::text, k.document_last4,
         d.front_path, d.back_path, d.selfie_path, k.submitted_at,
         exists (select 1 from private.kyc_documents d2 where d2.document_hash = d.document_hash and d2.user_id <> k.user_id)
  from public.kyc_profiles k
  join private.kyc_documents d on d.user_id = k.user_id
  join public.profiles p on p.id = k.user_id
  where k.status = 'REVIEW'
  order by k.submitted_at
  limit 200;
end;
$$;

-- p_decision: 'approve' | 'reject' | 'suspend'
create function public.admin_review_kyc(p_user uuid, p_decision text, p_reason text default null)
returns public.kyc_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kyc public.kyc_profiles;
  v_doc record;
  v_new public.kyc_status;
begin
  perform private.assert_role('KYC');
  if p_user = (select auth.uid()) then
    raise exception 'No podés revisar tu propia verificación' using errcode = 'PT403';
  end if;
  select * into v_kyc from public.kyc_profiles where user_id = p_user for update;
  if not found then
    raise exception 'Verificación inexistente' using errcode = 'PT404';
  end if;
  select * into v_doc from private.kyc_documents where user_id = p_user;

  if p_decision = 'approve' then
    if v_kyc.status <> 'REVIEW' then
      raise exception 'Solo se aprueban verificaciones en revisión' using errcode = 'PT409';
    end if;
    if exists (select 1 from private.kyc_documents d join public.kyc_profiles k on k.user_id = d.user_id
               where d.document_hash = v_doc.document_hash and d.user_id <> p_user and k.status = 'VERIFIED') then
      raise exception 'La identidad ya está verificada en otra cuenta' using errcode = 'PT409';
    end if;
    v_new := 'VERIFIED';
  elsif p_decision = 'reject' then
    v_new := 'REJECTED';
  elsif p_decision = 'suspend' then
    v_new := 'SUSPENDED';
  else
    raise exception 'Decisión inválida' using errcode = '22023';
  end if;

  update public.kyc_profiles
  set status = v_new, reviewed_at = now(), updated_at = now(),
      rejection_reason = case when v_new = 'VERIFIED' then null else coalesce(p_reason, 'No pudimos validar tus datos') end
  where user_id = p_user;
  update private.kyc_documents set reviewer_id = (select auth.uid()) where user_id = p_user;
  update public.profiles set is_verified = (v_new = 'VERIFIED') where id = p_user;

  if v_doc.document_hash is not null and v_new in ('VERIFIED', 'SUSPENDED') then
    insert into private.kyc_identity_registry (document_hash, user_id, status)
    values (v_doc.document_hash, p_user, v_new)
    on conflict (document_hash) do update set user_id = excluded.user_id, status = excluded.status, updated_at = now();
  end if;

  if v_new = 'VERIFIED' then
    update public.bank_accounts set status = 'verified', updated_at = updated_at
    where user_id = p_user and status = 'pending'
      and private.normalize_name(holder_name) = private.normalize_name(v_kyc.legal_name);
  end if;

  perform private.notify(p_user, 'kyc', case v_new
    when 'VERIFIED' then 'Tu identidad fue verificada. Ya tenés la insignia de cuenta verificada.'
    when 'REJECTED' then 'No pudimos verificar tu identidad: ' || coalesce(p_reason, 'revisá tus datos') || '. Podés reintentar.'
    else 'Tu verificación fue suspendida. Contactá a soporte.' end);
  perform private.audit('kyc.' || p_decision, 'kyc_profiles', p_user::text,
                        jsonb_build_object('status', v_kyc.status), jsonb_build_object('status', v_new), p_reason);
  return v_new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Finance
-- -----------------------------------------------------------------------------
create function public.admin_credit_earnings(p_username text, p_source text, p_gross bigint, p_reference text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_tx uuid;
begin
  perform private.assert_role('FINANCE');
  select id into v_user from public.profiles where username = lower(btrim(p_username));
  if v_user is null then
    raise exception 'Usuario inexistente' using errcode = 'PT404';
  end if;
  v_tx := private.credit_earnings(v_user, p_source, p_gross, private.user_currency(v_user), p_reference, null);
  perform private.audit('finance.credit', 'wallet_ledger', v_tx::text, null,
                        jsonb_build_object('user', v_user, 'source', p_source, 'gross', p_gross, 'reference', p_reference));
  return v_tx;
end;
$$;

create function public.admin_advance_balance(p_username text, p_from public.balance_bucket, p_to public.balance_bucket,
                                             p_amount bigint, p_reference text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_tx uuid;
begin
  perform private.assert_role('FINANCE');
  select id into v_user from public.profiles where username = lower(btrim(p_username));
  if v_user is null then
    raise exception 'Usuario inexistente' using errcode = 'PT404';
  end if;
  v_tx := private.advance_balance(v_user, private.user_currency(v_user), p_from, p_to, p_amount, p_reference);
  perform private.audit('finance.advance', 'wallet_ledger', v_tx::text, null,
    jsonb_build_object('user', v_user, 'from', p_from, 'to', p_to, 'amount', p_amount));
  return v_tx;
end;
$$;

create function public.admin_set_config(p_key text, p_value jsonb, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
begin
  perform private.assert_role('SUPER_ADMIN');
  if p_reason is null or char_length(btrim(p_reason)) < 5 then
    raise exception 'Indicá el motivo del cambio' using errcode = '22023';
  end if;
  select value into v_old from public.app_config where key = p_key for update;
  if not found then
    raise exception 'Clave inexistente' using errcode = 'PT404';
  end if;
  update public.app_config set value = p_value, updated_at = now(), updated_by = (select auth.uid()) where key = p_key;
  perform private.audit('config.update', 'app_config', p_key, v_old, p_value, p_reason);
end;
$$;


-- -----------------------------------------------------------------------------
-- Maintenance (schedule with pg_cron on the hosted project, see README)
-- -----------------------------------------------------------------------------
create function public.svc_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stories integer;
  v_limits integer;
begin
  perform private.assert_service_role();
  delete from public.stories where expires_at < now() - interval '2 days';
  get diagnostics v_stories = row_count;
  delete from private.rate_limits where window_start < now() - interval '2 days';
  get diagnostics v_limits = row_count;
  delete from private.post_views where hour_bucket < now() - interval '120 days';
  return jsonb_build_object('stories_deleted', v_stories, 'rate_limit_rows_deleted', v_limits);
end;
$$;
