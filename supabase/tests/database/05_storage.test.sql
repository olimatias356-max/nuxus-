-- Storage object policies (the Storage API evaluates the same RLS).
begin;
\ir helpers/test_helpers.psql
select plan(8);

select tests.create_user('hugo') as hugo \gset
select tests.create_user('ines') as ines \gset

select tests.as_user(:'hugo');
select lives_ok(format($$ insert into storage.objects (bucket_id, name, owner_id) values ('media', '%s/v.mp4', '%s') $$, :'hugo', :'hugo'),
  'users upload into their own media folder');
select throws_ok(format($$ insert into storage.objects (bucket_id, name, owner_id) values ('media', '%s/x.mp4', '%s') $$, :'ines', :'hugo'),
  '42501', null, 'users cannot upload into someone else''s folder');
select throws_ok(format($$ insert into storage.objects (bucket_id, name, owner_id) values ('avatars', '%s/a.jpg', '%s') $$, :'ines', :'hugo'),
  '42501', null, 'users cannot overwrite someone else''s avatar folder');

select tests.as_user(:'ines');
select is((select count(*)::integer from storage.objects where bucket_id = 'media' and name = :'hugo' || '/v.mp4'), 0,
  'unpublished media is private');

select tests.as_user(:'hugo');
insert into storage.objects (bucket_id, name, owner_id) values ('media', :'hugo' || '/v.jpg', :'hugo');
insert into public.posts (kind, media_path, thumb_path, duration_ms) values ('video', :'hugo' || '/v.mp4', :'hugo' || '/v.jpg', 12000);

select tests.as_user(:'ines');
select is((select count(*)::integer from storage.objects where bucket_id = 'media' and name like :'hugo' || '/%'), 2,
  'media of a published post is readable by others');

select tests.as_user(:'hugo');
insert into public.blocks (blocked_id) values (:'ines');
select tests.as_user(:'ines');
select is((select count(*)::integer from storage.objects where bucket_id = 'media' and name like :'hugo' || '/%'), 0,
  'blocking also revokes access to the files');

select tests.as_user(:'ines');
insert into storage.objects (bucket_id, name, owner_id) values ('kyc', :'ines' || '/doc.jpg', :'ines');
select is((select count(*)::integer from storage.objects where bucket_id = 'kyc'), 0, 'KYC uploads are write-only for users');

select tests.as_anon();
select is((select count(*)::integer from storage.objects where bucket_id in ('media', 'kyc')), 0,
  'anonymous visitors cannot list private files');

select * from finish();
rollback;
