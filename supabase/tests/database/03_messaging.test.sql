-- Direct messages, privacy between members and rate limits.
begin;
\ir helpers/test_helpers.psql
select plan(10);

select tests.create_user('eva') as eva \gset
select tests.create_user('fede') as fede \gset
select tests.create_user('gabi') as gabi \gset

select tests.as_user(:'eva');
select public.start_conversation(:'fede') as conv \gset
select is(public.start_conversation(:'fede'), :'conv'::uuid, 'starting again reuses the 1:1 conversation');
insert into public.messages (conversation_id, body) values (:'conv', 'Hola Fede');

select tests.as_user(:'fede');
select is((select unread_count from public.get_inbox() where conversation_id = :'conv'), 1, 'the recipient sees 1 unread');
select is((select unread_messages from public.get_badges()), 1, 'badge counts unread messages');
select public.mark_conversation_read(:'conv');
select is((select unread_count from public.get_inbox() where conversation_id = :'conv'), 0, 'reading clears the unread count');

-- outsiders
select tests.as_user(:'gabi');
select is((select count(*)::integer from public.messages where conversation_id = :'conv'), 0, 'non-members cannot read messages');
select throws_ok(format($$ insert into public.messages (conversation_id, body) values ('%s', 'intruso') $$, :'conv'),
  '42501', null, 'non-members cannot write into a conversation');
select throws_ok(format($$ insert into public.conversation_members (conversation_id, user_id) values ('%s', auth.uid()) $$, :'conv'),
  '42501', null, 'users cannot add themselves to conversations');

-- blocks stop messaging
select tests.as_user(:'fede');
insert into public.blocks (blocked_id) values (:'eva');
select tests.as_user(:'eva');
select throws_ok(format($$ insert into public.messages (conversation_id, body) values ('%s', '¿Hola?') $$, :'conv'),
  '42501', null, 'a blocked user cannot keep messaging');
select throws_like(format($$ select public.start_conversation('%s') $$, :'fede'),
  '%No podés enviarle mensajes%', 'a blocked user cannot open a new conversation');

-- rate limit (lowered for the test)
select tests.as_postgres();
update public.app_config set value = '3' where key = 'limits.messages_per_minute';
select tests.as_user(:'gabi');
select public.start_conversation(:'eva') as conv2 \gset
insert into public.messages (conversation_id, body) values (:'conv2', '1'), (:'conv2', '2'), (:'conv2', '3');
select throws_ok(format($$ insert into public.messages (conversation_id, body) values ('%s', '4') $$, :'conv2'),
  'PT429', null, 'flooding messages is rate limited (HTTP 429)');

select * from finish();
rollback;
