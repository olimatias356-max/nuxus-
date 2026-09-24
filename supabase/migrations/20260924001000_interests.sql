-- =============================================================================
-- MbareteFans · 010 · Interest profile used by the feed ranking.
--   Explicit: categories chosen at onboarding.
--   Implicit: likes, saves, comments and completed views nudge the weights.
-- =============================================================================

create table public.user_interests (
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null references public.categories (slug) on delete cascade,
  weight real not null default 0 check (weight between 0 and 10),
  explicit boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);
alter table public.user_interests enable row level security;
grant select on public.user_interests to authenticated;
create policy "users see their interests" on public.user_interests
  for select to authenticated using (user_id = (select auth.uid()));

insert into public.app_config (key, value, is_public, description) values
  ('feed.interest_boost', '0.6', false, 'Peso máximo del perfil de intereses en el ranking')
on conflict (key) do nothing;

create function public.set_interests(p_categories text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Iniciá sesión' using errcode = 'PT401';
  end if;
  if coalesce(array_length(p_categories, 1), 0) > 14 then
    raise exception 'Demasiadas categorías' using errcode = '22023';
  end if;
  update public.user_interests set explicit = false, weight = greatest(weight - 2, 0), updated_at = now()
  where user_id = v_uid and explicit and not (category = any (coalesce(p_categories, '{}')));
  insert into public.user_interests (user_id, category, weight, explicit)
  select v_uid, c.slug, 2, true from public.categories c where c.slug = any (coalesce(p_categories, '{}'))
  on conflict (user_id, category) do update set explicit = true, weight = greatest(public.user_interests.weight, 2), updated_at = now();
  select count(*) into v_count from public.user_interests where user_id = v_uid and explicit;
  return v_count;
end;
$$;

create function private.bump_interest(p_user uuid, p_post uuid, p_delta real)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category text;
begin
  select category into v_category from public.posts where id = p_post and author_id <> p_user;
  if v_category is null then
    return;
  end if;
  insert into public.user_interests (user_id, category, weight)
  values (p_user, v_category, p_delta)
  on conflict (user_id, category) do update
    set weight = least(public.user_interests.weight * 0.98 + p_delta, 10), updated_at = now();
end;
$$;

create function private.interest_signal_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'likes' then
    perform private.bump_interest(new.user_id, new.post_id, 0.3);
  elsif tg_table_name = 'saves' then
    perform private.bump_interest(new.user_id, new.post_id, 0.5);
  elsif tg_table_name = 'comments' then
    perform private.bump_interest(new.author_id, new.post_id, 0.4);
  elsif tg_table_name = 'post_views' and new.completed and (tg_op = 'INSERT' or not old.completed) then
    perform private.bump_interest(new.viewer_id, new.post_id, 0.2);
  end if;
  return null;
end;
$$;
create trigger likes_interest after insert on public.likes
  for each row execute function private.interest_signal_trigger();
create trigger saves_interest after insert on public.saves
  for each row execute function private.interest_signal_trigger();
create trigger comments_interest after insert on public.comments
  for each row execute function private.interest_signal_trigger();
create trigger post_views_interest after insert or update of completed on private.post_views
  for each row execute function private.interest_signal_trigger();

-- 0..1 affinity of the caller for a category (relative to their strongest interest).
create function private.interest_affinity(p_category text)
returns double precision
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select i.weight / nullif((select max(weight) from public.user_interests where user_id = (select auth.uid())), 0)
     from public.user_interests i where i.user_id = (select auth.uid()) and i.category = p_category), 0)::double precision
$$;

-- Feed ranking with the interest profile (same contract as before).
create or replace function public.get_feed(p_mode text default 'for_you', p_limit integer default 15, p_offset integer default 0)
returns setof public.feed_item
language sql
stable
set search_path = ''
as $$
  with me as (select (select auth.uid()) as uid),
  followed as (
    select f.followee_id from public.follows f, me where f.follower_id = me.uid
  ),
  candidates as (
    select p.*,
           exists (select 1 from followed where followed.followee_id = p.author_id) as is_following
    from public.posts p
    where p.status = 'published'
      and p.created_at > now() - interval '60 days'
      and (p_mode <> 'reels' or p.kind = 'video')
      and (p_mode <> 'following' or p.author_id in (select followee_id from followed) or p.author_id = (select uid from me))
    order by p.created_at desc
    limit 600
  ),
  scored as (
    select c.*,
      (
        (1 + ln(1 + c.like_count + 2 * c.comment_count + 3 * c.save_count + 0.05 * c.view_count))
        / power(extract(epoch from (now() - c.created_at)) / 3600.0 + 2, 1.15)
        * case when c.is_following then 1.6 else 1 end
        * case when c.author_id = (select uid from me) then 0.35 else 1 end
        * case when private.viewed_recently(c.id) then 0.25 else 1 end
        * (1 + private.config_num('feed.interest_boost', 0.6)::float8 * private.interest_affinity(c.category))
        * (1 + private.config_num('feed.pro_bonus', 0.05)::float8 * private.is_pro_public(c.author_id)::int)
        * (0.9 + random() * 0.2)
      ) as base_score
    from candidates c
  ),
  diversified as (
    select s.*,
      s.base_score * power(private.config_num('feed.same_creator_decay', 0.55)::float8,
        (row_number() over (partition by s.author_id order by s.base_score desc)) - 1) as final_score
    from scored s
  )
  select d.id, d.author_id, d.kind, d.media_path, d.thumb_path, d.width, d.height, d.duration_ms,
         d.caption, d.category, d.status, d.like_count, d.comment_count, d.save_count, d.view_count,
         d.created_at, pr.username, pr.display_name, pr.avatar_path, pr.is_verified,
         exists (select 1 from public.likes l where l.post_id = d.id and l.user_id = (select uid from me)),
         exists (select 1 from public.saves s where s.post_id = d.id and s.user_id = (select uid from me)),
         d.is_following,
         case when p_mode = 'following' then extract(epoch from d.created_at) else d.final_score end
  from diversified d
  join public.profiles pr on pr.id = d.author_id
  order by case when p_mode = 'following' then extract(epoch from d.created_at) else d.final_score end desc, d.id
  limit least(greatest(p_limit, 1), 50)
  offset greatest(p_offset, 0)
$$;

-- Explore: most engaging recent posts, optionally by category.
create function public.get_explore(p_category text default null, p_limit integer default 30, p_offset integer default 0)
returns setof public.feed_item
language sql
stable
set search_path = ''
as $$
  select p.id, p.author_id, p.kind, p.media_path, p.thumb_path, p.width, p.height, p.duration_ms,
         p.caption, p.category, p.status, p.like_count, p.comment_count, p.save_count, p.view_count,
         p.created_at, pr.username, pr.display_name, pr.avatar_path, pr.is_verified,
         exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = (select auth.uid())),
         exists (select 1 from public.saves s where s.post_id = p.id and s.user_id = (select auth.uid())),
         exists (select 1 from public.follows f where f.follower_id = (select auth.uid()) and f.followee_id = p.author_id),
         (ln(1 + p.like_count + 2 * p.comment_count + 3 * p.save_count + 0.05 * p.view_count)
           / power(extract(epoch from (now() - p.created_at)) / 3600.0 + 2, 0.8))::float8
  from public.posts p
  join public.profiles pr on pr.id = p.author_id
  where p.status = 'published'
    and p.created_at > now() - interval '30 days'
    and (p_category is null or p.category = p_category)
    and p.author_id <> (select auth.uid())
  order by 24 desc, p.id
  limit least(greatest(p_limit, 1), 60)
  offset greatest(p_offset, 0)
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on function public.set_interests(text[]) from public, anon;
revoke execute on function public.get_feed(text, integer, integer) from public, anon;
revoke execute on function public.get_explore(text, integer, integer) from public, anon;
grant execute on function public.set_interests(text[]) to authenticated;
grant execute on function public.get_feed(text, integer, integer) to authenticated;
grant execute on function public.get_explore(text, integer, integer) to authenticated;
