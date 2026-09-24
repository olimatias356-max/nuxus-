-- =============================================================================
-- MbareteFans · 003 · Content: posts, stories, likes, saves, comments,
-- follows, reports, views, counters and the ranked feed.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Posts
-- -----------------------------------------------------------------------------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('image', 'video')),
  media_path text not null check (char_length(media_path) <= 200),
  thumb_path text check (char_length(thumb_path) <= 200),
  width integer check (width between 1 and 10000),
  height integer check (height between 1 and 10000),
  duration_ms integer check (duration_ms between 0 and 3600000),
  caption text not null default '' check (char_length(caption) <= 2200),
  category text references public.categories (slug),
  status text not null default 'published' check (status in ('published', 'review', 'removed')),
  like_count integer not null default 0,
  comment_count integer not null default 0,
  save_count integer not null default 0,
  view_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posts_media_in_own_folder check (
    media_path like author_id::text || '/%'
    and (thumb_path is null or thumb_path like author_id::text || '/%')
  )
);
create index posts_author_created_idx on public.posts (author_id, created_at desc);
create index posts_published_created_idx on public.posts (created_at desc) where status = 'published';
create index posts_media_path_idx on public.posts (media_path);
create index posts_thumb_path_idx on public.posts (thumb_path) where thumb_path is not null;

alter table public.posts enable row level security;
grant select, delete on public.posts to authenticated;
grant insert (kind, media_path, thumb_path, width, height, duration_ms, caption, category) on public.posts to authenticated;
grant update (caption, category) on public.posts to authenticated;

create policy "published posts are visible" on public.posts
  for select to authenticated
  using (
    author_id = (select auth.uid())
    or (status = 'published' and private.can_see_user(author_id))
  );
create policy "active users publish their own posts" on public.posts
  for insert to authenticated
  with check (author_id = (select auth.uid()) and private.is_active_user());
create policy "authors edit their posts" on public.posts
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));
create policy "authors delete their posts" on public.posts
  for delete to authenticated
  using (author_id = (select auth.uid()));

create function private.posts_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.caption := private.clean_text(new.caption);
  if tg_op = 'INSERT' then
    perform private.check_rate_limit('post', 'limits.posts_per_hour', 20, interval '1 hour');
    if new.kind = 'video' and new.thumb_path is null then
      raise exception 'Los videos necesitan una portada' using errcode = '22023';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger posts_before_write
  before insert or update on public.posts
  for each row execute function private.posts_before_write();

create function private.posts_count_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set posts_count = posts_count + 1 where id = new.author_id;
  elsif tg_op = 'DELETE' then
    update public.profiles set posts_count = greatest(posts_count - 1, 0) where id = old.author_id;
  end if;
  return null;
end;
$$;
create trigger posts_count
  after insert or delete on public.posts
  for each row execute function private.posts_count_trigger();

create function private.can_see_post(p_post uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.posts p
    where p.id = p_post
      and (p.author_id = (select auth.uid()) or (p.status = 'published' and private.can_see_user(p.author_id)))
  )
$$;

-- -----------------------------------------------------------------------------
-- Stories (24 h)
-- -----------------------------------------------------------------------------
create table public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('image', 'video')),
  media_path text not null check (char_length(media_path) <= 200),
  caption text not null default '' check (char_length(caption) <= 200),
  duration_ms integer check (duration_ms between 0 and 60000),
  status text not null default 'published' check (status in ('published', 'review', 'removed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  constraint stories_media_in_own_folder check (media_path like author_id::text || '/%')
);
create index stories_author_idx on public.stories (author_id, created_at desc);
create index stories_expires_idx on public.stories (expires_at);
create index stories_media_path_idx on public.stories (media_path);
alter table public.stories enable row level security;
grant select, delete on public.stories to authenticated;
grant insert (kind, media_path, caption, duration_ms) on public.stories to authenticated;

create policy "active stories are visible" on public.stories
  for select to authenticated
  using (
    expires_at > now()
    and (author_id = (select auth.uid()) or (status = 'published' and private.can_see_user(author_id)))
  );
create policy "active users publish stories" on public.stories
  for insert to authenticated
  with check (author_id = (select auth.uid()) and private.is_active_user());
create policy "authors delete stories" on public.stories
  for delete to authenticated
  using (author_id = (select auth.uid()));

create function private.stories_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.check_rate_limit('story', 'limits.stories_per_day', 40, interval '1 day');
  new.caption := private.clean_text(new.caption);
  new.created_at := now();
  new.expires_at := now() + interval '24 hours';
  return new;
end;
$$;
create trigger stories_before_insert
  before insert on public.stories
  for each row execute function private.stories_before_insert();

create table public.story_views (
  story_id uuid not null references public.stories (id) on delete cascade,
  viewer_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);
alter table public.story_views enable row level security;
grant select on public.story_views to authenticated;
grant insert (story_id) on public.story_views to authenticated;

create policy "viewers and authors see story views" on public.story_views
  for select to authenticated
  using (
    viewer_id = (select auth.uid())
    or exists (select 1 from public.stories s where s.id = story_id and s.author_id = (select auth.uid()))
  );
create policy "users mark stories they can see as viewed" on public.story_views
  for insert to authenticated
  with check (
    viewer_id = (select auth.uid())
    and exists (select 1 from public.stories s where s.id = story_id)
  );

-- -----------------------------------------------------------------------------
-- Follows
-- -----------------------------------------------------------------------------
create table public.follows (
  follower_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id, created_at desc);
alter table public.follows enable row level security;
grant select, delete on public.follows to authenticated;
grant insert (followee_id) on public.follows to authenticated;

create policy "follow graph is visible" on public.follows
  for select to authenticated
  using (private.can_see_user(follower_id) and private.can_see_user(followee_id));
create policy "users follow visible accounts" on public.follows
  for insert to authenticated
  with check (
    follower_id = (select auth.uid())
    and private.is_active_user()
    and private.can_see_user(followee_id)
  );
create policy "users unfollow or remove followers" on public.follows
  for delete to authenticated
  using (follower_id = (select auth.uid()) or followee_id = (select auth.uid()));

create function private.follows_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.check_rate_limit('follow', 'limits.follows_per_hour', 200, interval '1 hour');
  return new;
end;
$$;
create trigger follows_before_insert
  before insert on public.follows
  for each row execute function private.follows_before_insert();

create function private.follows_count_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    update public.profiles set followers_count = followers_count + 1 where id = new.followee_id;
  elsif tg_op = 'DELETE' then
    update public.profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
    update public.profiles set followers_count = greatest(followers_count - 1, 0) where id = old.followee_id;
  end if;
  return null;
end;
$$;
create trigger follows_count
  after insert or delete on public.follows
  for each row execute function private.follows_count_trigger();

-- Blocking someone removes follows in both directions.
create function private.blocks_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and followee_id = new.blocked_id)
     or (follower_id = new.blocked_id and followee_id = new.blocker_id);
  return null;
end;
$$;
create trigger blocks_after_insert
  after insert on public.blocks
  for each row execute function private.blocks_after_insert();

-- -----------------------------------------------------------------------------
-- Likes and saves
-- -----------------------------------------------------------------------------
create table public.likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index likes_user_idx on public.likes (user_id, created_at desc);
alter table public.likes enable row level security;
grant select, delete on public.likes to authenticated;
grant insert (post_id) on public.likes to authenticated;

create policy "users see their likes" on public.likes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "users like visible posts" on public.likes
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_active_user() and private.can_see_post(post_id));
create policy "users remove their likes" on public.likes
  for delete to authenticated using (user_id = (select auth.uid()));

create table public.saves (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index saves_user_idx on public.saves (user_id, created_at desc);
alter table public.saves enable row level security;
grant select, delete on public.saves to authenticated;
grant insert (post_id) on public.saves to authenticated;

create policy "users see their saves" on public.saves
  for select to authenticated using (user_id = (select auth.uid()));
create policy "users save visible posts" on public.saves
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_see_post(post_id));
create policy "users remove their saves" on public.saves
  for delete to authenticated using (user_id = (select auth.uid()));

create function private.post_counter_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delta integer := case when tg_op = 'INSERT' then 1 else -1 end;
  v_post uuid := coalesce(new.post_id, old.post_id);
begin
  if tg_table_name = 'likes' then
    update public.posts set like_count = greatest(like_count + v_delta, 0) where id = v_post;
  elsif tg_table_name = 'saves' then
    update public.posts set save_count = greatest(save_count + v_delta, 0) where id = v_post;
  elsif tg_table_name = 'comments' then
    update public.posts set comment_count = greatest(comment_count + v_delta, 0) where id = v_post;
  end if;
  return null;
end;
$$;
create trigger likes_count after insert or delete on public.likes
  for each row execute function private.post_counter_trigger();
create trigger saves_count after insert or delete on public.saves
  for each row execute function private.post_counter_trigger();

-- -----------------------------------------------------------------------------
-- Comments
-- -----------------------------------------------------------------------------
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  status text not null default 'published' check (status in ('published', 'removed')),
  created_at timestamptz not null default now()
);
create index comments_post_idx on public.comments (post_id, created_at);
alter table public.comments enable row level security;
grant select, delete on public.comments to authenticated;
grant insert (post_id, body) on public.comments to authenticated;

create policy "comments on visible posts are visible" on public.comments
  for select to authenticated
  using (
    (status = 'published' or author_id = (select auth.uid()))
    and private.can_see_post(post_id)
    and private.can_see_user(author_id)
  );
create policy "active users comment on visible posts" on public.comments
  for insert to authenticated
  with check (author_id = (select auth.uid()) and private.is_active_user() and private.can_see_post(post_id));
create policy "authors and post owners delete comments" on public.comments
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    or exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid()))
  );

create function private.comments_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.check_rate_limit('comment_min', 'limits.comments_per_minute', 8, interval '1 minute');
  perform private.check_rate_limit('comment_hour', 'limits.comments_per_hour', 120, interval '1 hour');
  new.body := private.clean_text(new.body);
  if char_length(new.body) = 0 then
    raise exception 'El comentario está vacío' using errcode = '22023';
  end if;
  new.created_at := now();
  return new;
end;
$$;
create trigger comments_before_insert
  before insert on public.comments
  for each row execute function private.comments_before_insert();
create trigger comments_count after insert or delete on public.comments
  for each row execute function private.post_counter_trigger();

-- -----------------------------------------------------------------------------
-- Reports (UGC requirement of Google Play and the App Store)
-- -----------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment', 'user', 'message', 'story')),
  target_id uuid not null,
  reason text not null check (reason in
    ('sexual', 'minors', 'violence', 'harassment', 'hate', 'self_harm', 'impersonation', 'copyright', 'spam', 'other')),
  details text not null default '' check (char_length(details) <= 500),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution text,
  unique (reporter_id, target_type, target_id)
);
create index reports_open_idx on public.reports (status, created_at) where status = 'open';
create index reports_target_idx on public.reports (target_type, target_id);
alter table public.reports enable row level security;
grant select on public.reports to authenticated;
grant insert (target_type, target_id, reason, details) on public.reports to authenticated;

create policy "reporters see their reports" on public.reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or private.has_role('MODERATION'));
create policy "users file reports" on public.reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()));

create function private.reports_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.check_rate_limit('report', 'limits.reports_per_day', 50, interval '1 day');
  new.details := private.clean_text(new.details);
  new.status := 'open';
  new.created_at := now();
  return new;
end;
$$;
create trigger reports_before_insert
  before insert on public.reports
  for each row execute function private.reports_before_insert();

-- Auto-hide content pending human review when it collects enough distinct
-- reports, or immediately for child-safety reports. Nothing is deleted
-- automatically: a moderator decides (the AI/automation is not final).
create function private.reports_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_threshold integer := private.config_num('moderation.report_threshold', 3)::integer;
  v_count integer;
begin
  select count(distinct reporter_id) into v_count
  from public.reports
  where target_type = new.target_type and target_id = new.target_id and status = 'open';

  if new.reason = 'minors' or v_count >= v_threshold then
    if new.target_type = 'post' then
      update public.posts set status = 'review' where id = new.target_id and status = 'published';
    elsif new.target_type = 'story' then
      update public.stories set status = 'review' where id = new.target_id and status = 'published';
    elsif new.target_type = 'comment' then
      update public.comments set status = 'removed' where id = new.target_id and status = 'published';
    end if;
  end if;
  return null;
end;
$$;
create trigger reports_after_insert
  after insert on public.reports
  for each row execute function private.reports_after_insert();

-- -----------------------------------------------------------------------------
-- Views (algorithm signal). Recorded through an RPC, one per user/post/hour.
-- -----------------------------------------------------------------------------
create table private.post_views (
  post_id uuid not null references public.posts (id) on delete cascade,
  viewer_id uuid not null references auth.users (id) on delete cascade,
  hour_bucket timestamptz not null,
  watched_ms integer not null default 0,
  completed boolean not null default false,
  primary key (post_id, viewer_id, hour_bucket)
);
create index post_views_viewer_idx on private.post_views (viewer_id, post_id);
alter table private.post_views enable row level security;

create function public.track_view(p_post uuid, p_watched_ms integer default 0, p_completed boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_inserted boolean;
begin
  if v_uid is null or not private.can_see_post(p_post) then
    return;
  end if;
  perform private.check_rate_limit('view', 'limits.views_per_minute', 240, interval '1 minute');
  if exists (select 1 from public.posts where id = p_post and author_id = v_uid) then
    return; -- self views do not count
  end if;
  insert into private.post_views (post_id, viewer_id, hour_bucket, watched_ms, completed)
  values (p_post, v_uid, date_trunc('hour', now()), greatest(least(coalesce(p_watched_ms, 0), 3600000), 0), coalesce(p_completed, false))
  on conflict (post_id, viewer_id, hour_bucket) do update
    set watched_ms = greatest(private.post_views.watched_ms, excluded.watched_ms),
        completed = private.post_views.completed or excluded.completed
  returning (xmax = 0) into v_inserted;
  if v_inserted then
    update public.posts set view_count = view_count + 1 where id = p_post;
  end if;
end;
$$;

create function private.viewed_recently(p_post uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.post_views
    where post_id = p_post and viewer_id = (select auth.uid()) and hour_bucket > now() - interval '3 days'
  )
$$;

-- Pro status used by the ranking (small, controlled bonus). Placeholder until
-- subscriptions exist; replaced in the monetization migration.
create function private.is_pro_public(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select false
$$;

-- -----------------------------------------------------------------------------
-- Feed item shape shared by feed, profile grids and post detail.
-- -----------------------------------------------------------------------------
create type public.feed_item as (
  id uuid,
  author_id uuid,
  kind text,
  media_path text,
  thumb_path text,
  width integer,
  height integer,
  duration_ms integer,
  caption text,
  category text,
  status text,
  like_count integer,
  comment_count integer,
  save_count integer,
  view_count integer,
  created_at timestamptz,
  author_username text,
  author_display_name text,
  author_avatar_path text,
  author_is_verified boolean,
  liked boolean,
  saved boolean,
  following boolean,
  score double precision
);

-- Ranked feed. Runs as the caller, so RLS decides what is visible.
--   candidate generation -> filtering (RLS, blocks, seen) -> ranking -> diversity re-rank
-- p_mode: 'for_you' | 'following' | 'reels'
create function public.get_feed(p_mode text default 'for_you', p_limit integer default 15, p_offset integer default 0)
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
        * (1 + private.config_num('feed.pro_bonus', 0.05)::float8 * private.is_pro_public(c.author_id)::int)
        -- small random exploration term so new creators get a chance
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

-- Posts of one profile (grid) or a single post, in feed_item shape.
create function public.get_posts(p_author uuid default null, p_post uuid default null, p_saved boolean default false,
                                 p_limit integer default 30, p_offset integer default 0)
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
         extract(epoch from p.created_at)::float8
  from public.posts p
  join public.profiles pr on pr.id = p.author_id
  where (p_post is null or p.id = p_post)
    and (p_author is null or p.author_id = p_author)
    and (not p_saved or exists (select 1 from public.saves s where s.post_id = p.id and s.user_id = (select auth.uid())))
    and (p_post is not null or p_author is not null or p_saved)
  order by p.created_at desc
  limit least(greatest(p_limit, 1), 60)
  offset greatest(p_offset, 0)
$$;

-- Stories grouped by author for the home rail (own first, then unseen first).
create function public.get_story_rail()
returns table (
  author_id uuid,
  username text,
  display_name text,
  avatar_path text,
  is_verified boolean,
  story_count integer,
  has_unseen boolean,
  latest_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select s.author_id, p.username, p.display_name, p.avatar_path, p.is_verified,
         count(*)::integer as story_count,
         bool_or(not exists (
           select 1 from public.story_views v where v.story_id = s.id and v.viewer_id = (select auth.uid())
         )) as has_unseen,
         max(s.created_at) as latest_at
  from public.stories s
  join public.profiles p on p.id = s.author_id
  where s.author_id = (select auth.uid())
     or s.author_id in (select f.followee_id from public.follows f where f.follower_id = (select auth.uid()))
  group by s.author_id, p.username, p.display_name, p.avatar_path, p.is_verified
  order by (s.author_id = (select auth.uid())) desc, bool_or(not exists (
             select 1 from public.story_views v where v.story_id = s.id and v.viewer_id = (select auth.uid())
           )) desc, max(s.created_at) desc
  limit 50
$$;
