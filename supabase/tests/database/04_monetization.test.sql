-- Pro entitlements, KYC, bank accounts, ledger and withdrawals.
begin;
\ir helpers/test_helpers.psql
select plan(31);

select tests.create_user('creadora') as cre \gset
select tests.create_user('otro.user') as otro \gset
select tests.create_user('kyc.rev') as rev \gset
select tests.create_user('finanzas') as fin \gset
select tests.grant_role(:'rev', 'KYC');
select tests.grant_role(:'fin', 'FINANCE');

-- clients cannot write money state ------------------------------------------------
select tests.as_user(:'cre');
select throws_ok(format($$ insert into public.subscriptions (user_id, plan_id, status, channel, external_id, current_period_end)
  values ('%s', 'pro_absoluto', 'active', 'sandbox', 'x', now() + interval '1 year') $$, :'cre'),
  '42501', null, 'users cannot grant themselves Pro');
select throws_ok(format($$ insert into public.wallet_ledger (tx_id, user_id, currency, bucket, amount, entry_type, source)
  values (gen_random_uuid(), '%s', 'PYG', 'AVAILABLE', 999999, 'credit', 'ads') $$, :'cre'),
  '42501', null, 'users cannot credit their own wallet');
select throws_ok(format($$ select public.svc_apply_subscription('%s', 'pro_basico', 'sandbox', 'x', 'active',
  now() + interval '1 month', true, 'e1', 'purchase') $$, :'cre'),
  '42501', null, 'users cannot call server-only billing functions');
select throws_like($$ select public.request_payout() $$, '%plan Pro%', 'free creators cannot withdraw');
select is((select (public.get_my_monetization() ->> 'is_pro')::boolean), false, 'free creators are not Pro');

-- Pro through a verified purchase (service role) ---------------------------------
select tests.as_service();
select public.svc_apply_subscription(:'cre', 'pro_basico', 'google_play', 'token-abc', 'active',
  now() + interval '30 days', true, 'gp-order-1', 'purchase') as sub \gset
select is(public.svc_apply_subscription(:'cre', 'pro_basico', 'google_play', 'token-abc', 'active',
  now() + interval '30 days', true, 'gp-order-1', 'purchase'), :'sub'::uuid, 'billing events are idempotent');
select throws_like(format($$ select public.svc_apply_subscription('%s', 'pro_basico', 'google_play', 'token-abc', 'active',
  now() + interval '30 days', true, 'gp-order-2', 'purchase') $$, :'otro'),
  '%otra cuenta%', 'a purchase token cannot be reused by another account');

select tests.as_user(:'cre');
select is((select (public.get_my_monetization() ->> 'is_pro')::boolean), true, 'verified purchase activates Pro');
select is((select count(*)::integer from public.notifications where type = 'payment'), 1, 'the user is notified once');
select throws_like($$ select public.request_payout() $$, '%identidad%', 'Pro without KYC cannot withdraw');

-- KYC ----------------------------------------------------------------------------
select throws_like($$ select public.submit_kyc('Creadora Ejemplo', 'ci', 'PY', '1.234.567', 'x/front.jpg', null, 'x/selfie.jpg') $$,
  '%Subí las fotos%', 'KYC requires documents uploaded by the user');
select tests.fake_object('kyc', :'cre' || '/front.jpg', :'cre');
select tests.fake_object('kyc', :'cre' || '/selfie.jpg', :'cre');
select tests.as_user(:'cre');
select is(public.submit_kyc('Creadora Ejemplo', 'ci', 'PY', '1.234.567', :'cre' || '/front.jpg', null, :'cre' || '/selfie.jpg'),
  'REVIEW'::public.kyc_status, 'KYC submission goes to review');
select is((select count(*)::integer from storage.objects where bucket_id = 'kyc'), 0, 'users cannot read back KYC documents');
select throws_like($$ select public.submit_kyc('Creadora Ejemplo', 'ci', 'PY', '1234567', 'a', null, 'b') $$,
  '%ya está%', 'KYC cannot be re-submitted while in review');

-- same identity on another account
select tests.fake_object('kyc', :'otro' || '/f.jpg', :'otro');
select tests.fake_object('kyc', :'otro' || '/s.jpg', :'otro');
select tests.as_user(:'otro');
select throws_like(format($$ select public.submit_kyc('Creadora Ejemplo', 'ci', 'PY', '1234567', '%s/f.jpg', null, '%s/s.jpg') $$, :'otro', :'otro'),
  '%otra cuenta%', 'one identity = one monetized account');
select throws_like(format($$ select public.admin_review_kyc('%s', 'approve') $$, :'cre'),
  '%permisos%', 'regular users cannot approve KYC');

select tests.as_user(:'rev');
select is((select count(*)::integer from storage.objects where bucket_id = 'kyc'), 4, 'KYC reviewers can read documents');
select is(public.admin_review_kyc(:'cre', 'approve'), 'VERIFIED'::public.kyc_status, 'reviewers approve KYC');
select tests.as_postgres();
select is((select is_verified from public.profiles where id = :'cre'), true, 'approval grants the verified badge');

-- bank account ----------------------------------------------------------------------
select tests.as_user(:'cre');
select public.upsert_bank_account('Banco Nacional', 'savings', 'Creadora Ejemplo', '0012-3456-7890');
select is((select status from public.bank_accounts), 'verified', 'holder matching the verified identity is auto-verified');
select is((select account_last4 from public.bank_accounts), '7890', 'only the last 4 digits are visible');
select tests.as_postgres();
select isnt((select account_number_enc::text from private.bank_account_secrets limit 1), '001234567890', 'account number is encrypted at rest');

-- earnings ---------------------------------------------------------------------------
select tests.as_user(:'fin');
select public.admin_credit_earnings('creadora', 'ads', 100000, 'ads-2026-09-24') as tx \gset
select is(public.admin_credit_earnings('creadora', 'ads', 100000, 'ads-2026-09-24'), :'tx'::uuid, 'earning credits are idempotent');
select public.admin_advance_balance('creadora', 'ESTIMATED', 'AVAILABLE', 70000, 'release-1');
select tests.as_user(:'cre');
select is((select (public.get_my_monetization() -> 'balances' ->> 'AVAILABLE')::bigint), 70000::bigint,
  'creators receive 70% of valid ad revenue');
select tests.as_postgres();
select throws_ok($$ update public.wallet_ledger set amount = 1 $$, 'PT403', null, 'the ledger is immutable, even for the owner role');

-- withdrawal -------------------------------------------------------------------------
select tests.as_user(:'cre');
select throws_like($$ select public.request_payout() $$, '%24 h%', 'new bank accounts have a security cooldown');
select tests.as_postgres();
update public.bank_accounts set updated_at = now() - interval '2 days' where user_id = :'cre';
select tests.as_user(:'cre');
select public.request_payout() as payout \gset
select is((select (public.get_my_monetization() -> 'balances' ->> 'PROCESSING')::bigint), 70000::bigint,
  'the withdrawal moves the balance to PROCESSING');
select throws_like($$ select public.request_payout() $$, '%en proceso%', 'only one withdrawal at a time');

select tests.as_service();
select is(public.svc_complete_payout(:'payout', 'FAILED', 'test', 'ref-1', 'banco rechazó'), 'FAILED', 'failed payouts are settled');
select is(public.svc_complete_payout(:'payout', 'PAID', 'test', 'ref-1'), 'FAILED', 'settlement is idempotent');
select tests.as_user(:'cre');
select is((select (public.get_my_monetization() -> 'balances' ->> 'AVAILABLE')::bigint), 70000::bigint,
  'a failed payout returns the money to AVAILABLE exactly once');

select * from finish();
rollback;
