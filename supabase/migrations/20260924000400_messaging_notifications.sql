-- =============================================================================
-- MbareteFans · 004 · Direct messages (1:1) and notifications.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Conversations
-- -----------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_message_preview text check (char_length(last_message_preview) <= 120),
  last_sender_id uuid references public.profiles (id) on delete set null
);
alter table public.conversations enable row level security;

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on public.conversation_members (user_id);
alter table public.conversation_members enable row level security;

create function private.is_member(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation and user_id = (select auth.uid())
  )
$$;

-- The caller can message in this conversation: member, active, and no block
-- with any other member.
create function private.can_message(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_member(p_conversation)
     and private.is_active_user()
     and not exists (
       select 1 from public.conversation_members m
       where m.conversation_id = p_conversation
         and m.user_id <> (select auth.uid())
         and (private.is_blocked_with(m.user_id)
              or exists (select 1 from public.profiles p where p.id = m.user_id and p.status = 'suspended'))
     )
$$;

grant select on public.conversations to authenticated;
create policy "members see conversations" on public.conversations
  for select to authenticated using (private.is_member(id));

grant select on public.conversation_members to authenticated;
grant update (last_read_at) on public.conversation_members to authenticated;
create policy "members see co-members" on public.conversation_members
  for select to authenticated using (private.is_member(conversation_id));
create policy "members update their read marker" on public.conversation_members
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Messages
-- -----------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at desc);
alter table public.messages enable row level security;
grant select on public.messages to authenticated;
grant insert (conversation_id, body) on public.messages to authenticated;

create policy "members read messages" on public.messages
  for select to authenticated using (private.is_member(conversation_id));
create policy "members send messages when allowed" on public.messages
  for insert to authenticated
  with check (sender_id = (select auth.uid()) and private.can_message(conversation_id));

create function private.messages_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.check_rate_limit('message', 'limits.messages_per_minute', 30, interval '1 minute');
  new.body := private.clean_text(new.body);
  if char_length(new.body) = 0 then
    raise exception 'El mensaje está vacío' using errcode = '22023';
  end if;
  new.created_at := clock_timestamp();
  return new;
end;
$$;
create trigger messages_before_insert
  before insert on public.messages
  for each row execute function private.messages_before_insert();

create function private.messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      last_message_preview = left(new.body, 120),
      last_sender_id = new.sender_id
  where id = new.conversation_id;

  update public.conversation_members
  set last_read_at = new.created_at
  where conversation_id = new.conversation_id and user_id = new.sender_id;
  return null;
end;
$$;
create trigger messages_after_insert
  after insert on public.messages
  for each row execute function private.messages_after_insert();

-- Opens (or reuses) a 1:1 conversation with another user.
create function public.start_conversation(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_conversation uuid;
begin
  if v_uid is null then
    raise exception 'Iniciá sesión para enviar mensajes' using errcode = 'PT401';
  end if;
  if p_other is null or p_other = v_uid then
    raise exception 'Conversación inválida' using errcode = '22023';
  end if;
  if not private.is_active_user() then
    raise exception 'Tu cuenta no puede enviar mensajes en este momento' using errcode = 'PT403';
  end if;
  if not exists (select 1 from public.profiles where id = p_other and status <> 'suspended')
     or private.is_blocked_with(p_other) then
    raise exception 'No podés enviarle mensajes a esta cuenta' using errcode = 'PT403';
  end if;

  select m1.conversation_id into v_conversation
  from public.conversation_members m1
  join public.conversation_members m2 on m2.conversation_id = m1.conversation_id and m2.user_id = p_other
  where m1.user_id = v_uid
    and (select count(*) from public.conversation_members m3 where m3.conversation_id = m1.conversation_id) = 2
  limit 1;

  if v_conversation is not null then
    return v_conversation;
  end if;

  perform private.check_rate_limit('conversation', 'limits.conversations_per_hour', 30, interval '1 hour');

  insert into public.conversations default values returning id into v_conversation;
  insert into public.conversation_members (conversation_id, user_id) values (v_conversation, v_uid), (v_conversation, p_other);
  return v_conversation;
end;
$$;

-- Inbox: one row per conversation with the other member and unread count.
create function public.get_inbox()
returns table (
  conversation_id uuid,
  other_id uuid,
  other_username text,
  other_display_name text,
  other_avatar_path text,
  other_is_verified boolean,
  last_message_at timestamptz,
  last_message_preview text,
  last_sender_id uuid,
  unread_count integer,
  can_message boolean
)
language sql
stable
set search_path = ''
as $$
  select c.id, o.user_id, p.username, p.display_name, p.avatar_path, p.is_verified,
         c.last_message_at, c.last_message_preview, c.last_sender_id,
         (select count(*)::integer from public.messages msg
           where msg.conversation_id = c.id and msg.sender_id <> (select auth.uid())
             and msg.created_at > me.last_read_at),
         private.can_message(c.id)
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id
  join public.conversation_members o on o.conversation_id = c.id and o.user_id <> me.user_id
  join public.profiles p on p.id = o.user_id
  where me.user_id = (select auth.uid())
  order by coalesce(c.last_message_at, c.created_at) desc
  limit 200
$$;

create function public.mark_conversation_read(p_conversation uuid)
returns void
language sql
set search_path = ''
as $$
  update public.conversation_members
  set last_read_at = clock_timestamp()
  where conversation_id = p_conversation and user_id = (select auth.uid())
$$;

-- -----------------------------------------------------------------------------
-- Notifications (created only by the server)
-- -----------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete cascade,
  type text not null check (type in
    ('like', 'comment', 'follow', 'earning', 'payment', 'payout', 'kyc', 'moderation', 'security', 'system')),
  post_id uuid references public.posts (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 300),
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy "users read their notifications" on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()) and (actor_id is null or private.can_see_user(actor_id)));
create policy "users mark notifications as read" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "users delete notifications" on public.notifications
  for delete to authenticated
  using (user_id = (select auth.uid()));

create function private.notify(p_user uuid, p_type text, p_body text, p_actor uuid default null,
                               p_post uuid default null, p_data jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null or p_user = p_actor then
    return;
  end if;
  -- collapse repeated social notifications (e.g. like/unlike/like)
  if p_type in ('like', 'follow') and exists (
    select 1 from public.notifications
    where user_id = p_user and type = p_type and actor_id is not distinct from p_actor
      and post_id is not distinct from p_post and created_at > now() - interval '12 hours'
  ) then
    return;
  end if;
  insert into public.notifications (user_id, actor_id, type, post_id, body, data)
  values (p_user, p_actor, p_type, p_post, left(p_body, 300), coalesce(p_data, '{}'::jsonb));
end;
$$;

create function private.social_notifications_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if tg_table_name = 'likes' then
    select author_id into v_owner from public.posts where id = new.post_id;
    perform private.notify(v_owner, 'like', 'le dio me gusta a tu publicación', new.user_id, new.post_id);
  elsif tg_table_name = 'comments' then
    select author_id into v_owner from public.posts where id = new.post_id;
    perform private.notify(v_owner, 'comment', 'comentó: ' || left(new.body, 120), new.author_id, new.post_id,
                           jsonb_build_object('comment_id', new.id));
  elsif tg_table_name = 'follows' then
    perform private.notify(new.followee_id, 'follow', 'empezó a seguirte', new.follower_id);
  end if;
  return null;
end;
$$;
create trigger likes_notify after insert on public.likes
  for each row execute function private.social_notifications_trigger();
create trigger comments_notify after insert on public.comments
  for each row execute function private.social_notifications_trigger();
create trigger follows_notify after insert on public.follows
  for each row execute function private.social_notifications_trigger();

create function public.mark_notifications_read()
returns void
language sql
set search_path = ''
as $$
  update public.notifications set read_at = now()
  where user_id = (select auth.uid()) and read_at is null
$$;

-- Badge counts for the tab bar.
create function public.get_badges()
returns table (unread_notifications integer, unread_messages integer)
language sql
stable
set search_path = ''
as $$
  select
    (select count(*)::integer from public.notifications n
      where n.user_id = (select auth.uid()) and n.read_at is null
        and (n.actor_id is null or private.can_see_user(n.actor_id))),
    (select count(*)::integer from public.conversation_members me
      join public.messages m on m.conversation_id = me.conversation_id
      where me.user_id = (select auth.uid()) and m.sender_id <> me.user_id and m.created_at > me.last_read_at)
$$;

-- Realtime: clients subscribe to their messages and notifications (RLS applies).
alter publication supabase_realtime add table public.messages, public.notifications;

