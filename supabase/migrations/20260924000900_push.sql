-- =============================================================================
-- MbareteFans · 009 · Push notifications (Expo Push).
--
--  * Devices register their Expo push token through an RPC (a token moves to
--    the account currently signed in on that device).
--  * Server-created notifications and new messages are queued in
--    private.push_queue; the `push-dispatch` Edge Function drains the queue.
--  * If pg_net is available and `push.dispatch_url` is configured, the queue is
--    kicked immediately; otherwise schedule the function (e.g. every minute).
--  * Message pushes never include the message text (lock-screen privacy).
-- =============================================================================

create table public.push_tokens (
  token text primary key check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
grant select on public.push_tokens to authenticated;
create policy "users see their devices" on public.push_tokens
  for select to authenticated using (user_id = (select auth.uid()));

insert into public.app_config (key, value, is_public, description) values
  ('push.dispatch_url', 'null', false, 'URL de la Edge Function push-dispatch (se llama al encolar si pg_net está disponible)'),
  ('limits.push_tokens_per_user', '10', false, null)
on conflict (key) do nothing;

insert into private.secrets (name, value) values
  ('push_dispatch_secret', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (name) do nothing;

create function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_max integer := private.config_num('limits.push_tokens_per_user', 10)::integer;
begin
  if v_uid is null then
    raise exception 'Iniciá sesión' using errcode = 'PT401';
  end if;
  if p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$' or p_platform not in ('ios', 'android') then
    raise exception 'Token de notificaciones inválido' using errcode = '22023';
  end if;
  perform private.check_rate_limit('push_token', 'limits.kyc_per_day', 20, interval '1 day');

  insert into public.push_tokens (token, user_id, platform)
  values (p_token, v_uid, p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();

  delete from public.push_tokens
  where user_id = v_uid and token in (
    select token from public.push_tokens where user_id = v_uid order by updated_at desc offset v_max
  );
end;
$$;

create function public.unregister_push_token(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens where token = p_token and user_id = (select auth.uid())
$$;

-- -----------------------------------------------------------------------------
-- Queue
-- -----------------------------------------------------------------------------
create table private.push_queue (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts integer not null default 0
);
create index push_queue_pending_idx on private.push_queue (created_at) where sent_at is null;
alter table private.push_queue enable row level security;

-- Calls the dispatcher right away when pg_net and the URL are configured.
create function private.kick_push_dispatch()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := private.config('push.dispatch_url') #>> '{}';
begin
  if v_url is null or v_url = '' or not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_net') then
    return;
  end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using v_url, '{}'::jsonb,
          jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', private.secret('push_dispatch_secret'));
exception when others then
  -- never let a push failure break the user action that created it
  null;
end;
$$;

create function private.enqueue_push(p_user uuid, p_title text, p_body text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.push_tokens where user_id = p_user) then
    return;
  end if;
  insert into private.push_queue (user_id, title, body, data)
  values (p_user, left(p_title, 80), left(p_body, 180), coalesce(p_data, '{}'::jsonb));
  perform private.kick_push_dispatch();
end;
$$;

create function private.notifications_push_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text;
  v_url text;
begin
  select username into v_actor from public.profiles where id = new.actor_id;
  v_url := case
    when new.type in ('like', 'comment') and new.post_id is not null then '/post/' || new.post_id
    when new.type = 'follow' and v_actor is not null then '/u/' || v_actor
    when new.type in ('earning', 'payment', 'payout', 'kyc') then '/creator'
    when new.type = 'security' then '/settings/security'
    else '/activity' end;
  perform private.enqueue_push(
    new.user_id,
    'MbareteFans',
    case when v_actor is not null then '@' || v_actor || ' ' || new.body else new.body end,
    jsonb_build_object('url', v_url, 'type', new.type));
  return null;
end;
$$;
create trigger notifications_push
  after insert on public.notifications
  for each row execute function private.notifications_push_trigger();

create function private.messages_push_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender text;
  v_member record;
begin
  select username into v_sender from public.profiles where id = new.sender_id;
  for v_member in
    select user_id from public.conversation_members
    where conversation_id = new.conversation_id and user_id <> new.sender_id
  loop
    perform private.enqueue_push(v_member.user_id, '@' || coalesce(v_sender, 'alguien'), 'Te envió un mensaje',
                                 jsonb_build_object('url', '/messages/' || new.conversation_id, 'type', 'message'));
  end loop;
  return null;
end;
$$;
create trigger messages_push
  after insert on public.messages
  for each row execute function private.messages_push_trigger();

-- -----------------------------------------------------------------------------
-- Service-only helpers for the dispatcher
-- -----------------------------------------------------------------------------
create function public.svc_check_push_secret(p_secret text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_service_role();
  return p_secret is not null and p_secret = private.secret('push_dispatch_secret');
end;
$$;

create function public.svc_claim_push_batch(p_limit integer default 300)
returns table (id bigint, title text, body text, data jsonb, tokens text[])
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_service_role();
  return query
  with batch as (
    select q.id from private.push_queue q
    where q.sent_at is null and q.attempts < 3 and q.created_at > now() - interval '6 hours'
    order by q.created_at
    limit least(greatest(p_limit, 1), 1000)
    for update skip locked
  ), claimed as (
    update private.push_queue q set attempts = q.attempts + 1
    from batch where q.id = batch.id
    returning q.id, q.user_id, q.title, q.body, q.data
  )
  select c.id, c.title, c.body, c.data,
         coalesce((select array_agg(t.token) from public.push_tokens t where t.user_id = c.user_id), '{}')
  from claimed c;
end;
$$;

create function public.svc_finish_push(p_sent bigint[], p_dead_tokens text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_service_role();
  update private.push_queue set sent_at = now() where id = any (coalesce(p_sent, '{}'));
  delete from public.push_tokens where token = any (coalesce(p_dead_tokens, '{}'));
  delete from private.push_queue where created_at < now() - interval '7 days';
end;
$$;

-- privileges (see 008_privileges)
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on function public.register_push_token(text, text) from public, anon;
revoke execute on function public.unregister_push_token(text) from public, anon;
revoke execute on function public.svc_check_push_secret(text) from public, anon, authenticated;
revoke execute on function public.svc_claim_push_batch(integer) from public, anon, authenticated;
revoke execute on function public.svc_finish_push(bigint[], text[]) from public, anon, authenticated;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;
grant execute on function public.svc_check_push_secret(text) to service_role;
grant execute on function public.svc_claim_push_batch(integer) to service_role;
grant execute on function public.svc_finish_push(bigint[], text[]) to service_role;
