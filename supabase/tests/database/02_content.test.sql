-- Posts, interactions, blocks, reports and the feed.
begin;
\ir helpers/test_helpers.psql
select plan(23);

select tests.create_user('ana') as ana \gset
select tests.create_user('beto') as beto \gset
select tests.create_user('caro') as caro \gset
select tests.create_user('mod.dani') as mod \gset
select tests.grant_role(:'mod', 'MODERATION');

-- publishing ------------------------------------------------------------------
select tests.as_user(:'ana');
insert into public.posts (kind, media_path, caption, category)
values ('image', :'ana' || '/p1.jpg', E'Hola​ Paraguay', 'cultura');
select is((select caption from public.posts where author_id = :'ana'), 'Hola Paraguay', 'captions are cleaned of invisible characters');
select is((select posts_count from public.profiles where id = :'ana'), 1, 'posts_count is maintained by the server');

select throws_ok(format($$ insert into public.posts (kind, media_path) values ('image', '%s/robado.jpg') $$, :'beto'),
  '23514', null, 'media must be inside the author''s own folder');
select throws_ok(format($$ insert into public.posts (author_id, kind, media_path) values ('%s', 'image', '%s/x.jpg') $$, :'beto', :'beto'),
  '42501', null, 'users cannot post as someone else');
select throws_ok(format($$ insert into public.posts (kind, media_path, status) values ('image', '%s/x.jpg', 'published') $$, :'ana'),
  '42501', null, 'users cannot choose the moderation status');
select throws_like(format($$ insert into public.posts (kind, media_path) values ('video', '%s/v.mp4') $$, :'ana'),
  '%portada%', 'videos require a cover image');
select throws_ok($$ update public.posts set like_count = 9999 $$, '42501', null, 'counters are not writable');

select id as post from public.posts where author_id = :'ana' \gset

-- interactions ----------------------------------------------------------------
select tests.as_user(:'beto');
insert into public.likes (post_id) values (:'post');
insert into public.comments (post_id, body) values (:'post', '¡Qué lindo!');
select tests.as_postgres();
select is((select like_count from public.posts where id = :'post'), 1, 'likes update the counter');
select is((select comment_count from public.posts where id = :'post'), 1, 'comments update the counter');
select is((select count(*)::integer from public.notifications where user_id = :'ana'), 2, 'the author is notified of like and comment');

select tests.as_user(:'beto');
delete from public.likes where post_id = :'post';
select tests.as_postgres();
select is((select like_count from public.posts where id = :'post'), 0, 'unlike decrements the counter');

-- notifications cannot be forged
select tests.as_user(:'beto');
select throws_ok(format($$ insert into public.notifications (user_id, type, body) values ('%s', 'system', 'phishing') $$, :'ana'),
  '42501', null, 'users cannot create notifications');

-- blocks ----------------------------------------------------------------------
select tests.as_user(:'ana');
insert into public.blocks (blocked_id) values (:'caro');
select tests.as_user(:'caro');
select is((select count(*)::integer from public.posts where id = :'post'), 0, 'blocked users cannot see the post');
select throws_ok(format($$ insert into public.likes (post_id) values ('%s') $$, :'post'),
  '42501', null, 'blocked users cannot like');
select throws_ok(format($$ insert into public.comments (post_id, body) values ('%s', 'hola') $$, :'post'),
  '42501', null, 'blocked users cannot comment');
select throws_ok(format($$ insert into public.follows (followee_id) values ('%s') $$, :'ana'),
  '42501', null, 'blocked users cannot follow');
select is((select count(*)::integer from public.get_feed('for_you', 20, 0) where author_id = :'ana'), 0,
  'the feed excludes blocked creators');

-- feed ------------------------------------------------------------------------
select tests.as_user(:'beto');
select is((select count(*)::integer from public.get_feed('for_you', 20, 0) where id = :'post'), 1, 'the feed returns visible posts');
select is((select count(*)::integer from public.get_feed('reels', 20, 0) where id = :'post'), 0, 'reels only contain videos');

-- reports ---------------------------------------------------------------------
insert into public.reports (target_type, target_id, reason) values ('post', :'post', 'spam');
select throws_ok(format($$ insert into public.reports (target_type, target_id, reason) values ('post', '%s', 'spam') $$, :'post'),
  '23505', null, 'the same user cannot report the same content twice');
select tests.as_user(:'mod');
insert into public.reports (target_type, target_id, reason) values ('post', :'post', 'minors');
select tests.as_user(:'beto');
select is((select count(*)::integer from public.posts where id = :'post'), 0, 'child-safety reports hide content until review');
select tests.as_user(:'ana');
select is((select status from public.posts where id = :'post'), 'review', 'the author still sees it, marked for review');
select tests.as_user(:'mod');
select is((select count(*)::integer from public.admin_list_reports(10)), 1, 'moderators see the report queue');

select * from finish();
rollback;
