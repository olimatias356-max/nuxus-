-- Structural security checks: RLS everywhere, no leaked grants, safe definers.
begin;
\ir helpers/test_helpers.psql
select plan(9);

select is(
  (select count(*)::integer from pg_tables where schemaname in ('public', 'private') and not rowsecurity),
  0, 'every table in public/private has RLS enabled');

select is(
  (select array_agg(p.proname order by p.proname)::text
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')),
  '{check_username}', 'anon can only execute check_username');

select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'svc\_%' and has_function_privilege('authenticated', p.oid, 'execute')),
  0, 'signed-in users cannot execute server-only svc_* functions');

select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  0, 'every SECURITY DEFINER function pins its search_path');

select is(
  (select count(*)::integer from information_schema.role_table_grants
   where table_schema = 'private' and grantee in ('anon', 'authenticated', 'PUBLIC')),
  0, 'no API role has privileges on private tables');

select is(
  (select count(*)::integer from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon' and privilege_type <> 'SELECT'),
  0, 'anon cannot write to any public table');

select is(
  (select array_agg(table_name::text order by table_name)::text from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon'),
  '{app_config,categories,countries}', 'anon can only read public reference data');

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'is_verified', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.profiles', 'followers_count', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.profiles', 'status', 'UPDATE'),
  'users cannot update verification, counters or status of profiles');

select ok(
  not has_table_privilege('authenticated', 'public.wallet_ledger', 'INSERT')
  and not has_table_privilege('authenticated', 'public.subscriptions', 'INSERT')
  and not has_table_privilege('authenticated', 'public.payouts', 'INSERT')
  and not has_table_privilege('authenticated', 'public.kyc_profiles', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.notifications', 'INSERT'),
  'users cannot write financial, KYC or notification records');

select * from finish();
rollback;
