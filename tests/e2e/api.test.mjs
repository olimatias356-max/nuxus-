// End-to-end API tests against a running Supabase stack (local CLI or the
// no-Docker harness). They exercise the same calls the mobile app makes.
//
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL,
//   MAILPIT_URL (default http://127.0.0.1:54324), PAYOUT_WEBHOOK_SECRET
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const URL_ = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';
const PAYOUT_SECRET = process.env.PAYOUT_WEBHOOK_SECRET ?? 'test-payout-secret';
const PASSWORD = 'Mbarete2026!';
assert.ok(ANON && SERVICE && process.env.DATABASE_URL, 'Set SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL');

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
const run = crypto.randomBytes(3).toString('hex');
const client = () => createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const service = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');

const codeIn = (text = '') => text.match(/>\s*(\d{6})\s*</)?.[1] ?? text.match(/\b(\d{6})\b/)?.[1];

// Reads the OTP from the local mail catcher (Mailpit, or Inbucket on older Supabase CLIs).
async function otpFor(email, afterMs) {
  for (let i = 0; i < 60; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`).catch(() => null);
    if (res?.ok) {
      const { messages = [] } = await res.json();
      const msg = messages.find((m) => new Date(m.Created).getTime() >= afterMs - 1000);
      if (msg) {
        const full = await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json();
        const code = codeIn(full.HTML) ?? codeIn(full.Text);
        if (code) return code;
      }
    } else {
      const box = email.split('@')[0];
      const list = await fetch(`${MAILPIT}/api/v1/mailbox/${encodeURIComponent(box)}`).then((r) => (r.ok ? r.json() : []), () => []);
      const msg = [...list].reverse().find((m) => new Date(m.date).getTime() >= afterMs - 1000);
      if (msg) {
        const full = await (await fetch(`${MAILPIT}/api/v1/mailbox/${encodeURIComponent(box)}/${msg.id}`)).json();
        const code = codeIn(full.body?.html) ?? codeIn(full.body?.text);
        if (code) return code;
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no OTP email for ${email}`);
}

async function signUp(name, birth = '1995-05-05') {
  const c = client();
  const email = `${name}.${run}@example.com`;
  const username = `${name}_${run}`;
  const started = Date.now();
  const { data, error } = await c.auth.signUp({
    email,
    password: PASSWORD,
    options: { data: { username, display_name: name, birth_date: birth, country: 'PY', terms_version: '2026-09' } },
  });
  if (error) return { error };
  assert.equal(data.session, null, 'email confirmation is required');
  const token = await otpFor(email, started);
  const verified = await c.auth.verifyOtp({ email, token, type: 'signup' });
  assert.ifError(verified.error);
  return { c, user: verified.data.user, email, username };
}

const S = {};

test.before(async () => {
  await db.connect();
});
test.after(async () => {
  await db.end();
});

test('sign-up needs the emailed code and creates the profile', async () => {
  S.creator = await signUp('creadora');
  S.fan = await signUp('fan');
  const { data } = await S.creator.c.from('profiles').select('username, is_verified').eq('id', S.creator.user.id).single();
  assert.equal(data.username, S.creator.username);
  assert.equal(data.is_verified, false);
});

test('sign-up rejects minors and weak passwords', async () => {
  const minor = await signUp('menor', '2012-01-01');
  assert.ok(minor.error, 'minor must be rejected');
  const weak = await client().auth.signUp({ email: `weak.${run}@example.com`, password: 'abc', options: { data: {} } });
  assert.ok(weak.error, 'weak password must be rejected');
});

test('storage: users cannot write into someone else\'s folder', async () => {
  const { error } = await S.fan.c.storage.from('media').upload(`${S.creator.user.id}/evil.jpg`, JPEG, { contentType: 'image/jpeg' });
  assert.ok(error, 'upload into foreign folder must fail');
  const bad = await S.fan.c.storage.from('media').upload(`${S.fan.user.id}/x.exe`, Buffer.from('MZ'), { contentType: 'application/x-msdownload' });
  assert.ok(bad.error, 'disallowed mime types must fail');
});

test('creator publishes a photo', async () => {
  const path = `${S.creator.user.id}/${crypto.randomUUID()}.jpg`;
  const up = await S.creator.c.storage.from('media').upload(path, JPEG, { contentType: 'image/jpeg' });
  assert.ifError(up.error);
  const { data, error } = await S.creator.c.from('posts').insert({ kind: 'image', media_path: path, caption: 'Tereré ruso 🧉', category: 'cultura', width: 1, height: 1 }).select('id').single();
  assert.ifError(error);
  S.post = { id: data.id, path };
});

test('fan sees it in the feed and can load the private file through a signed URL', async () => {
  const { data: feed, error } = await S.fan.c.rpc('get_feed', { p_mode: 'for_you', p_limit: 20, p_offset: 0 });
  assert.ifError(error);
  assert.ok(feed.some((p) => p.id === S.post.id));
  const signed = await S.fan.c.storage.from('media').createSignedUrl(S.post.path, 60);
  assert.ifError(signed.error);
  const res = await fetch(signed.data.signedUrl);
  assert.equal(res.status, 200);
  const anon = await client().storage.from('media').createSignedUrl(S.post.path, 60);
  assert.ok(anon.error, 'anonymous users cannot sign private media');
});

test('likes, comments and follows notify the creator', async () => {
  assert.ifError((await S.fan.c.from('likes').insert({ post_id: S.post.id })).error);
  assert.ifError((await S.fan.c.from('comments').insert({ post_id: S.post.id, body: '¡Qué bueno!' })).error);
  assert.ifError((await S.fan.c.from('follows').insert({ followee_id: S.creator.user.id })).error);
  const { data } = await S.creator.c.from('notifications').select('type');
  assert.deepEqual(new Set(data.map((n) => n.type)), new Set(['like', 'comment', 'follow']));
  const forged = await S.fan.c.from('notifications').insert({ user_id: S.creator.user.id, type: 'system', body: 'phishing' });
  assert.ok(forged.error, 'clients cannot create notifications');
});

test('direct messages', async () => {
  const { data: conv, error } = await S.fan.c.rpc('start_conversation', { p_other: S.creator.user.id });
  assert.ifError(error);
  assert.ifError((await S.fan.c.from('messages').insert({ conversation_id: conv, body: 'Hola!' })).error);
  const { data: inbox } = await S.creator.c.rpc('get_inbox');
  assert.equal(inbox.find((c) => c.conversation_id === conv)?.unread_count, 1);
  S.conv = conv;
});

test('clients cannot grant themselves Pro, balance or verification', async () => {
  const sub = await S.creator.c.from('subscriptions').insert({ user_id: S.creator.user.id, plan_id: 'pro_absoluto', status: 'active', channel: 'sandbox', external_id: 'x', current_period_end: '2100-01-01' });
  assert.ok(sub.error);
  const svc = await S.creator.c.rpc('svc_apply_subscription', { p_user: S.creator.user.id, p_plan: 'pro_basico', p_channel: 'sandbox', p_external_id: 'x', p_status: 'active', p_period_end: '2100-01-01', p_auto_renew: true, p_event_id: 'x', p_event_type: 'x' });
  assert.ok(svc.error);
  const verified = await S.creator.c.from('profiles').update({ is_verified: true }).eq('id', S.creator.user.id);
  assert.ok(verified.error);
  const payout = await S.creator.c.rpc('request_payout', { p_amount: null });
  assert.match(payout.error?.message ?? '', /Pro/);
});

test('sandbox purchase through the Edge Function activates Pro', async () => {
  const { data, error } = await S.creator.c.functions.invoke('purchase-verify', { body: { channel: 'sandbox', plan_id: 'pro_basico' } });
  assert.ifError(error);
  assert.equal(data.status, 'active');
  const { data: m } = await S.creator.c.rpc('get_my_monetization');
  assert.equal(m.is_pro, true);
  const noAuth = await client().functions.invoke('purchase-verify', { body: { channel: 'sandbox', plan_id: 'pro_basico' } });
  assert.ok(noAuth.error, 'anonymous purchases are rejected');
});

test('KYC documents are private and reviewed by an admin', async () => {
  const uid = S.creator.user.id;
  const paths = {};
  for (const side of ['front', 'selfie']) {
    paths[side] = `${uid}/${crypto.randomUUID()}-${side}.jpg`;
    assert.ifError((await S.creator.c.storage.from('kyc').upload(paths[side], JPEG, { contentType: 'image/jpeg' })).error);
  }
  const readBack = await S.creator.c.storage.from('kyc').createSignedUrl(paths.front, 60);
  assert.ok(readBack.error, 'users cannot read back KYC documents');
  const { data: status, error } = await S.creator.c.rpc('submit_kyc', {
    p_legal_name: 'Creadora Ejemplo', p_document_type: 'ci', p_document_country: 'PY', p_document_number: `4.${run.slice(0, 3)}.567`,
    p_front_path: paths.front, p_back_path: null, p_selfie_path: paths.selfie,
  });
  assert.ifError(error);
  assert.equal(status, 'REVIEW');

  // an admin (role granted from SQL, never from the app)
  S.admin = await signUp('revisora');
  assert.ok(S.admin.user, 'reviewer account created');
  await db.query(`insert into private.admin_roles (user_id, role) values ($1, 'SUPER_ADMIN')`, [S.admin.user.id]);
  const denied = await S.fan.c.rpc('admin_review_kyc', { p_user: uid, p_decision: 'approve' });
  assert.ok(denied.error, 'regular users cannot approve KYC');
  const doc = await S.admin.c.storage.from('kyc').createSignedUrl(paths.front, 60);
  assert.ifError(doc.error);
  const review = await S.admin.c.rpc('admin_review_kyc', { p_user: uid, p_decision: 'approve' });
  assert.ifError(review.error);
  const { data: prof } = await S.fan.c.from('profiles').select('is_verified').eq('id', uid).single();
  assert.equal(prof.is_verified, true);
});

test('earnings, withdrawal and signed payout webhook', async () => {
  const bank = await S.creator.c.rpc('upsert_bank_account', { p_bank_name: 'Banco Nacional', p_account_type: 'savings', p_holder_name: 'Creadora Ejemplo', p_account_number: '0012-3456-7890' });
  assert.ifError(bank.error);
  const credit = await S.admin.c.rpc('admin_credit_earnings', { p_username: S.creator.username, p_source: 'ads', p_gross: 200000, p_reference: `ads-${run}` });
  assert.ifError(credit.error);
  assert.ifError((await S.admin.c.rpc('admin_advance_balance', { p_username: S.creator.username, p_from: 'ESTIMATED', p_to: 'AVAILABLE', p_amount: 140000, p_reference: `rel-${run}` })).error);

  const cooldown = await S.creator.c.rpc('request_payout', { p_amount: null });
  assert.match(cooldown.error?.message ?? '', /24 h/);
  await db.query(`update public.bank_accounts set updated_at = now() - interval '2 days' where user_id = $1`, [S.creator.user.id]);

  const { data: payoutId, error } = await S.creator.c.rpc('request_payout', { p_amount: null });
  assert.ifError(error);
  let { data: m } = await S.creator.c.rpc('get_my_monetization');
  assert.equal(m.balances.PROCESSING, 140000);
  assert.equal(m.balances.AVAILABLE, 0);

  const body = JSON.stringify({ payout_id: payoutId, status: 'PAID', provider: 'test-bank', provider_ref: `tx-${run}` });
  const forged = await fetch(`${URL_}/functions/v1/payout-webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mbarete-timestamp': String(Math.floor(Date.now() / 1000)), 'x-mbarete-signature': 'deadbeef' },
    body,
  });
  assert.equal(forged.status, 401, 'unsigned webhooks are rejected');

  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac('sha256', PAYOUT_SECRET).update(`${ts}.${body}`).digest('hex');
  for (let i = 0; i < 2; i++) {
    const res = await fetch(`${URL_}/functions/v1/payout-webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-mbarete-timestamp': ts, 'x-mbarete-signature': sig }, body });
    assert.equal(res.status, 200);
  }
  ({ data: m } = await S.creator.c.rpc('get_my_monetization'));
  assert.equal(m.balances.PAID, 140000, 'settled exactly once');
  assert.equal(m.balances.PROCESSING, 0);
});

test('blocking hides content and private files', async () => {
  assert.ifError((await S.creator.c.from('blocks').insert({ blocked_id: S.fan.user.id })).error);
  const { data: posts } = await S.fan.c.from('posts').select('id').eq('id', S.post.id);
  assert.equal(posts.length, 0);
  const signed = await S.fan.c.storage.from('media').createSignedUrl(S.post.path, 60);
  assert.ok(signed.error, 'blocked users lose access to the files');
  const msg = await S.fan.c.from('messages').insert({ conversation_id: S.conv, body: '¿Hola?' });
  assert.ok(msg.error, 'blocked users cannot message');
});

test('account deletion removes the user and their files', async () => {
  const { error } = await S.fan.c.functions.invoke('delete-account', { body: { confirm: 'ELIMINAR' } });
  assert.ifError(error);
  const { rows } = await db.query('select count(*)::int as n from auth.users where id = $1', [S.fan.user.id]);
  assert.equal(rows[0].n, 0);
  const again = await S.fan.c.auth.signInWithPassword({ email: S.fan.email, password: PASSWORD });
  assert.ok(again.error, 'deleted accounts cannot sign in');
});
