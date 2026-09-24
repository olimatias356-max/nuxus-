-- Interest profile and its effect on the feed.
begin;
\ir helpers/test_helpers.psql
select plan(5);

select tests.create_user('int.creator') as c \gset
select tests.create_user('int.viewer') as v \gset

select tests.as_user(:'c');
insert into public.posts (kind, media_path, caption, category) values
  ('image', :'c' || '/a.jpg', 'fútbol', 'deportes'),
  ('image', :'c' || '/b.jpg', 'receta', 'cocina');

select tests.as_user(:'v');
select is(public.set_interests(array['cocina']), 1, 'onboarding stores explicit interests');
select throws_ok($$ insert into public.user_interests (user_id, category, weight) values (auth.uid(), 'humor', 10) $$,
  '42501', null, 'interests cannot be written directly');
select is((select category from public.get_feed('for_you', 1, 0)), 'cocina', 'the feed favours the viewer''s interests');

insert into public.likes (post_id) select id from public.posts where category = 'deportes';
select ok((select weight from public.user_interests where user_id = auth.uid() and category = 'deportes') > 0, 'likes teach the profile');

select tests.as_user(:'c');
insert into public.likes (post_id) select id from public.posts where category = 'cocina';
select is((select count(*)::integer from public.user_interests where user_id = auth.uid()), 0, 'liking your own post does not change your profile');

select * from finish();
rollback;
