-- Push tokens and the push queue.
begin;
\ir helpers/test_helpers.psql
select plan(9);

select tests.create_user('push.a') as a \gset
select tests.create_user('push.b') as b \gset

select tests.as_user(:'a');
select lives_ok($$ select public.register_push_token('ExponentPushToken[abcdefghijklmnop]', 'android') $$, 'users register their device');
select throws_ok($$ select public.register_push_token('https://evil.example/hook', 'android') $$, '22023', null, 'arbitrary push endpoints are rejected');
select throws_ok($$ insert into public.push_tokens (token, user_id, platform) values ('ExponentPushToken[zzzzzzzzzzzzzzzz]', auth.uid(), 'ios') $$,
  '42501', null, 'tokens can only be written through the RPC');

-- same device, new account: the token moves
select tests.as_user(:'b');
select public.register_push_token('ExponentPushToken[abcdefghijklmnop]', 'ios');
select tests.as_postgres();
select is((select user_id from public.push_tokens where token = 'ExponentPushToken[abcdefghijklmnop]'), :'b'::uuid, 'a device token belongs to the account signed in on it');

-- a follow and a message queue pushes for b
select tests.as_user(:'a');
insert into public.follows (followee_id) values (:'b');
select public.start_conversation(:'b') as conv \gset
insert into public.messages (conversation_id, body) values (:'conv', 'mi clave es 1234');
select tests.as_postgres();
select is((select count(*)::integer from private.push_queue where user_id = :'b'), 2, 'follow and message are queued for push');
select is((select count(*)::integer from private.push_queue where body like '%1234%'), 0, 'message text never goes into the push');
select is((select data ->> 'url' from private.push_queue where user_id = :'b' and data ->> 'type' = 'message'), '/messages/' || :'conv', 'the push deep-links to the conversation');

select tests.as_user(:'b');
select throws_ok($$ select public.svc_claim_push_batch(10) $$, '42501', null, 'users cannot read the push queue');
select tests.as_service();
select is((select count(*)::integer from public.svc_claim_push_batch(10)), 2, 'the dispatcher claims pending pushes');

select * from finish();
rollback;
