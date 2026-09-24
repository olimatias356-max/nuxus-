-- Sign-up rules (age gate, username, terms) and profile protections.
begin;
\ir helpers/test_helpers.psql
select plan(16);

select tests.create_user('lucia.py') as lucia \gset
select tests.create_user('chila.dev', date '1990-01-01', 'AR') as chila \gset

select is((select username from public.profiles where id = :'lucia'), 'lucia.py', 'sign-up creates the profile');
select is((select country from public.profiles where id = :'chila')::text, 'AR', 'country comes from metadata');
select ok(exists (select 1 from private.user_private where user_id = :'lucia'), 'birth date is stored privately');

select throws_like($$ select tests.create_user('menor.edad', (current_date - interval '15 years')::date) $$,
  '%al menos 18%', 'minors cannot sign up');
select throws_like($$ select tests.create_user('lu cia!') $$, '%3 a 24%', 'invalid usernames are rejected');
select throws_like($$ select tests.create_user('Lucia.PY') $$, '%ya está en uso%', 'usernames are case-insensitive and unique');
select throws_like($$ select tests.create_user('soporte') $$, '%reservado%', 'reserved usernames are rejected');
select throws_like($$ select tests.create_user('mbarete.oficial') $$, '%reservado%', 'brand look-alike prefixes are rejected');
select throws_like($$ select tests.create_user('ok.user', date '1995-05-05', 'PY', 'viejo') $$,
  '%términos%', 'sign-up requires the current terms version');

select tests.as_anon();
select is(public.check_username('lucia.py'), 'Ese nombre de usuario ya está en uso.', 'anon can check availability');
select is(public.check_username('nuevo_user'), null, 'available usernames return null');

-- profile updates
select tests.as_user(:'lucia');
update public.profiles set bio = 'Tereré y cultura' where id = :'lucia';
select is((select bio from public.profiles where id = :'lucia'), 'Tereré y cultura', 'users edit their bio');

update public.profiles set bio = 'hackeado' where id = :'chila';
select tests.as_postgres();
select isnt((select bio from public.profiles where id = :'chila'), 'hackeado', 'users cannot edit other profiles');

select tests.as_user(:'lucia');
select throws_ok($$ update public.profiles set is_verified = true where id = auth.uid() $$,
  '42501', null, 'users cannot mark themselves as verified');
select throws_ok($$ update public.profiles set avatar_path = 'otro/usuario.jpg' where id = auth.uid() $$,
  '23514', null, 'avatars must live in the user''s own folder');

-- blocks hide profiles in both directions
insert into public.blocks (blocked_id) values (:'chila');
select tests.as_user(:'chila');
select is((select count(*)::integer from public.profiles where id = :'lucia'), 0, 'a blocked user cannot see the blocker profile');

select * from finish();
rollback;
