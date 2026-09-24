-- =============================================================================
-- MbareteFans · 008 · Function privileges (allowlist).
--
-- PostgreSQL grants EXECUTE on new functions to PUBLIC, and per-schema default
-- privileges cannot revoke that. So we sweep every function and grant back
-- only what each role needs. Keep this list in sync when adding functions;
-- supabase/tests/database/00_privileges.test.sql fails if something leaks.
-- =============================================================================

revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

-- Internal helpers are not reachable through the Data API (the private schema
-- is not exposed), but RLS policies, triggers and invoker functions running
-- as the signed-in user need to call them.
grant execute on all functions in schema private to authenticated;
grant execute on all functions in schema private to service_role;

-- Anonymous (pre-login) access: only the username availability check.
grant execute on function public.check_username(text) to anon, authenticated;

-- Signed-in users
grant execute on function public.my_admin_roles() to authenticated;
grant execute on function public.search_profiles(text, integer) to authenticated;
grant execute on function public.get_my_blocks() to authenticated;
grant execute on function public.get_feed(text, integer, integer) to authenticated;
grant execute on function public.get_posts(uuid, uuid, boolean, integer, integer) to authenticated;
grant execute on function public.get_story_rail() to authenticated;
grant execute on function public.track_view(uuid, integer, boolean) to authenticated;
grant execute on function public.start_conversation(uuid) to authenticated;
grant execute on function public.get_inbox() to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.mark_notifications_read() to authenticated;
grant execute on function public.get_badges() to authenticated;
grant execute on function public.submit_kyc(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.upsert_bank_account(text, text, text, text) to authenticated;
grant execute on function public.request_payout(bigint) to authenticated;
grant execute on function public.get_my_monetization() to authenticated;
grant execute on function public.get_creator_stats() to authenticated;

-- Admin RPCs: callable by signed-in users, each one checks the caller's role.
grant execute on function public.admin_list_reports(integer) to authenticated;
grant execute on function public.admin_resolve_report(text, uuid, text, text) to authenticated;
grant execute on function public.admin_list_appeals() to authenticated;
grant execute on function public.admin_resolve_appeal(uuid, boolean, text) to authenticated;
grant execute on function public.admin_list_kyc() to authenticated;
grant execute on function public.admin_review_kyc(uuid, text, text) to authenticated;
grant execute on function public.admin_credit_earnings(text, text, bigint, text) to authenticated;
grant execute on function public.admin_advance_balance(text, public.balance_bucket, public.balance_bucket, bigint, text) to authenticated;
grant execute on function public.admin_set_config(text, jsonb, text) to authenticated;

-- Server only (Edge Functions with the service role key)
grant execute on all functions in schema public to service_role;
