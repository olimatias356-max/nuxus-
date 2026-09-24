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
const FX_RATES = { USD: { PYG: 7300, ARS: 1350, BRL: 5.4, USD: 1 } };
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

test('clients cannot grant themselves money, monetization or verification', async () => {
  const verified = await S.creator.c.from('profiles').update({ is_verified: true }).eq('id', S.creator.user.id);
  assert.ok(verified.error);
  const ledger = await S.creator.c.from('wallet_ledger').insert({ user_id: S.creator.user.id, amount: 1000000 });
  assert.ok(ledger.error, 'the ledger is written only by the server');
  const mon = await S.creator.c.from('creator_monetization').upsert({ user_id: S.creator.user.id, status: 'active', activated_at: '2020-01-01' });
  assert.ok(mon.error, 'monetization status is written only by the server');
  const imp = await S.fan.c.from('ad_impressions').insert({ viewer_id: S.fan.user.id, creator_id: S.creator.user.id, post_id: S.post.id, format: 'native', status: 'valid', verified: true });
  assert.ok(imp.error, 'impressions are written only through the RPC');
  const svc = await S.creator.c.rpc('svc_import_ad_revenue', { p_period_start: '2026-01-01', p_period_end: '2026-01-02', p_gross_micros: 1e9, p_currency: 'USD', p_fx_rates: {}, p_external_ref: `evil-${run}` });
  assert.ok(svc.error, 'service functions are not callable by users');
  const due = await S.creator.c.rpc('svc_payouts_due', { p_limit: 10 });
  assert.ok(due.error, 'beneficiary data is only for the payout job');
  const { data: cfg } = await S.creator.c.from('app_config').select('key, value');
  assert.ok(!(cfg ?? []).some((r) => r.key === 'revenue.ads_creator_share'), 'the revenue share is not readable by clients');
  const pro = await S.creator.c.from('subscriptions').select('*');
  assert.ok(pro.error, 'there are no subscriptions any more');
});

test('video watch sessions: devices, heartbeats and clamping', async () => {
  const uid = S.creator.user.id;
  const { data, error } = await S.creator.c.from('posts').insert({
    kind: 'video', media_path: `${uid}/${crypto.randomUUID()}.mp4`, thumb_path: `${uid}/${crypto.randomUUID()}.jpg`,
    caption: 'Chipa caliente', category: 'cultura', width: 720, height: 1280, duration_ms: 60000,
  }).select('id').single();
  assert.ifError(error);
  S.video = data.id;

  const hash = crypto.createHash('sha256').update(`mbaretefans:e2e-${run}`).digest('hex');
  const dev = await S.fan.c.rpc('register_device', { p_device_hash: hash, p_platform: 'android', p_model: 'Pixel 8', p_os_version: '15', p_app_version: '1.0.0' });
  assert.ifError(dev.error);
  S.device = dev.data;
  const again = await S.fan.c.rpc('register_device', { p_device_hash: hash, p_platform: 'android', p_model: 'Pixel 8', p_os_version: '15', p_app_version: '1.0.1' });
  assert.equal(again.data, S.device, 'the same device keeps its id');
  const badHash = await S.fan.c.rpc('register_device', { p_device_hash: 'not-a-hash', p_platform: 'android', p_model: null, p_os_version: null, p_app_version: null });
  assert.ok(badHash.error, 'device hashes are validated');

  const photo = await S.fan.c.rpc('start_watch', { p_post: S.post.id, p_device: S.device });
  assert.equal(photo.data, null, 'photos have no watch sessions');
  const own = await S.creator.c.rpc('start_watch', { p_post: S.video, p_device: null });
  assert.equal(own.data, null, 'your own videos never count');

  const start = await S.fan.c.rpc('start_watch', { p_post: S.video, p_device: S.device });
  assert.ifError(start.error);
  assert.ok(start.data, 'a session is created');
  S.session = start.data;

  // The server never credits more time than really elapsed.
  assert.ifError((await S.fan.c.rpc('heartbeat_watch', { p_session: S.session, p_watched_ms: 30000, p_ads_ok: true })).error);
  let { rows } = await db.query('select watched_ms from public.watch_sessions where id = $1', [S.session]);
  assert.ok(rows[0].watched_ms < 5000, `clamped to elapsed time (got ${rows[0].watched_ms})`);
  const tooBig = await S.fan.c.rpc('heartbeat_watch', { p_session: S.session, p_watched_ms: 3600000, p_ads_ok: true });
  assert.ok(tooBig.error, 'deltas above 30 s are rejected');
  const stolen = await S.creator.c.rpc('heartbeat_watch', { p_session: S.session, p_watched_ms: 1000, p_ads_ok: true });
  assert.ok(stolen.error, 'only the viewer can report their session');

  // Simulate ten real minutes of playback.
  await db.query(`update public.watch_sessions set started_at = now() - interval '3 hours', last_heartbeat_at = now() - interval '3 hours' where id = $1`, [S.session]);
  for (let i = 0; i < 3; i++) {
    assert.ifError((await S.fan.c.rpc('heartbeat_watch', { p_session: S.session, p_watched_ms: 30000, p_ads_ok: true })).error);
  }
  ({ rows } = await db.query('select watched_ms, status from public.watch_sessions where id = $1', [S.session]));
  assert.ok(rows[0].watched_ms >= 60000 && rows[0].watched_ms <= 63000, `capped at the video length (got ${rows[0].watched_ms})`);
  assert.equal(rows[0].status, 'pending', 'sessions start pending until the fraud checks run');

  const { data: mine } = await S.creator.c.from('watch_sessions').select('id').eq('id', S.session);
  assert.equal(mine?.length ?? 0, 0, 'creators cannot read viewers\' sessions');
});

// Lowers the thresholds so the flow fits in a test and restores them afterwards.
const CONFIG = {
  'monetization.min_followers': '1',
  'monetization.min_watch_hours': '0.01',
  'antifraud.min_account_age_hours': '0',
};
const savedConfig = {};
test.after(async () => {
  for (const [key, value] of Object.entries(savedConfig)) {
    await db.query('update public.app_config set value = $2 where key = $1', [key, value]);
  }
});

test('monetization: requirements, activation and 50/50 split only from activation', async () => {
  for (const [key, value] of Object.entries(CONFIG)) {
    const { rows } = await db.query('select value from public.app_config where key = $1', [key]);
    savedConfig[key] = rows[0].value;
    await db.query('update public.app_config set value = $2 where key = $1', [key, value]);
  }
  const { data: before } = await S.creator.c.rpc('get_monetization_progress');
  assert.equal(before.status, 'locked', 'pending sessions do not count yet');
  const early = await S.creator.c.rpc('activate_monetization');
  assert.ok(early.error, 'cannot activate before meeting the requirements');

  // An ad shown before activation: 100 % platform.
  const pre = await S.fan.c.rpc('log_ad_impression', { p_post: S.video, p_format: 'native', p_ad_unit: 'ca-app-pub-3940256099942544/2247696110', p_value_micros: 1000, p_currency: 'USD', p_precision: 'estimated', p_device: S.device, p_session: S.session });
  assert.ifError(pre.error);
  await db.query(`update public.ad_impressions set created_at = now() - interval '150 minutes' where id = $1`, [pre.data]);

  const svc = await service.rpc('svc_run_fraud_checks');
  assert.ifError(svc.error);
  const { rows: [sess] } = await db.query('select status, monetizable from public.watch_sessions where id = $1', [S.session]);
  assert.deepEqual(sess, { status: 'valid', monetizable: true });

  const { data: ready } = await S.creator.c.rpc('get_monetization_progress');
  assert.equal(ready.status, 'eligible');
  assert.equal(ready.can_activate, true);
  assert.ok(ready.watch_hours > 0 && ready.followers >= 1);
  const act = await S.creator.c.rpc('activate_monetization');
  assert.ifError(act.error);
  assert.equal(act.data.status, 'active');
  await db.query(`update public.creator_monetization set activated_at = now() - interval '140 minutes' where user_id = $1`, [S.creator.user.id]);

  // An ad shown after activation: shared with the creator.
  const post = await S.fan.c.rpc('log_ad_impression', { p_post: S.video, p_format: 'native', p_ad_unit: 'ca-app-pub-3940256099942544/2247696110', p_value_micros: 1000, p_currency: 'USD', p_precision: 'estimated', p_device: S.device, p_session: S.session });
  assert.ifError(post.error);
  S.impression = post.data;
  await db.query(`update public.ad_impressions set created_at = now() - interval '130 minutes' where id = $1`, [post.data]);
  assert.ifError((await service.rpc('svc_run_fraud_checks')).error);
  const { rows: imps } = await db.query('select status from public.ad_impressions where id = any($1)', [[pre.data, post.data]]);
  assert.deepEqual(imps.map((r) => r.status), ['valid', 'valid']);

  // Finance imports the real AdMob revenue for the period: USD 100.
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const importArgs = { p_period_start: yesterday, p_period_end: today, p_gross_micros: 100_000_000, p_currency: 'USD', p_fx_rates: FX_RATES, p_external_ref: `admob-e2e-${run}` };
  const denied = await S.creator.c.rpc('admin_import_ad_revenue', importArgs);
  assert.ok(denied.error, 'only finance imports revenue');
  const imported = await S.admin.c.rpc('admin_import_ad_revenue', importArgs);
  assert.ifError(imported.error);
  S.import = imported.data;
  const twice = await S.admin.c.rpc('admin_import_ad_revenue', importArgs);
  assert.ok(twice.error || twice.data === S.import, 'the same AdMob period is never imported twice');

  // Two equal impressions, one before activation: the creator gets half of one → 25 % of USD 100 in PYG.
  const expected = Math.round(100 * FX_RATES.USD.PYG * 0.25);
  let { data: wallet } = await S.creator.c.rpc('get_my_wallet');
  assert.equal(wallet.currency, 'PYG');
  assert.equal(wallet.pending, expected, `pending ${wallet.pending} ≠ ${expected}`);
  assert.equal(wallet.available, 0);
  assert.doesNotMatch(JSON.stringify(wallet), /share|percent|porcentaje|comisi|commission|0\.5\b/i, 'the wallet never exposes the split');
  const { data: progress } = await S.creator.c.rpc('get_monetization_progress');
  assert.doesNotMatch(JSON.stringify(progress), /share|percent|porcentaje|comisi|commission/i);

  // AdMob pays (21–26): finance releases the import.
  const released = await S.admin.c.rpc('admin_release_ad_revenue', { p_import: S.import });
  assert.ifError(released.error);
  ({ data: wallet } = await S.creator.c.rpc('get_my_wallet'));
  assert.equal(wallet.available, expected);
  assert.equal(wallet.pending, 0);
  S.expected = expected;
});

test('dLocal payout account, withdrawal window and signed payout webhook', async () => {
  let { data: wallet } = await S.creator.c.rpc('get_my_wallet');
  assert.ok(wallet.withdraw_blockers.includes('payout_account_required'));
  const blocked = await S.creator.c.rpc('request_payout', { p_amount: null });
  assert.ok(blocked.error, 'no payout without a payout account');

  const acct = await S.creator.c.rpc('upsert_payout_account', {
    p_bank_name: 'Banco Nacional de Fomento', p_bank_code: 'BNF', p_account_type: 'savings', p_holder_name: 'Creadora Ejemplo',
    p_account_number: '0012345678', p_document_type: 'CI', p_document_number: `4${run.slice(0, 3)}567`, p_branch: null,
  });
  assert.ifError(acct.error);
  ({ data: wallet } = await S.creator.c.rpc('get_my_wallet'));
  assert.equal(wallet.payout_account.last4, '5678');
  assert.doesNotMatch(JSON.stringify(wallet), /0012345678/, 'the full account number never comes back');
  assert.ok(wallet.withdraw_blockers.includes('payout_account_cooldown'), `blockers: ${wallet.withdraw_blockers}`);
  await db.query(`update public.bank_accounts set updated_at = now() - interval '2 days' where user_id = $1`, [S.creator.user.id]);

  const { data: payoutId, error } = await S.creator.c.rpc('request_payout', { p_amount: null });
  assert.ifError(error);
  ({ data: wallet } = await S.creator.c.rpc('get_my_wallet'));
  assert.equal(wallet.processing, S.expected);
  assert.equal(wallet.available, 0);
  const p = wallet.payouts.find((x) => x.id === payoutId);
  assert.equal(p.status, 'REQUESTED');
  const day = Number(p.scheduled_for.slice(8, 10));
  assert.ok(day >= 21 && day <= 26, `scheduled inside the 21–26 window (${p.scheduled_for})`);
  const second = await S.creator.c.rpc('request_payout', { p_amount: null });
  assert.ok(second.error, 'one open withdrawal at a time');

  // The payout job sees decrypted beneficiary data only when the window is open.
  const { data: due, error: dueError } = await service.rpc('svc_payouts_due', { p_limit: 50 });
  assert.ifError(dueError);
  const inWindow = new Date().getUTCDate() >= 21 && new Date().getUTCDate() <= 26 && p.scheduled_for <= new Date().toISOString().slice(0, 10);
  const mine = (due ?? []).find((d) => d.payout_id === payoutId);
  if (inWindow) {
    assert.equal(mine?.account_number, '0012345678');
    assert.equal(mine?.amount, S.expected);
  } else {
    assert.equal(mine, undefined, 'nothing is sent outside the window');
  }
  assert.ifError((await service.rpc('svc_mark_payout_sent', { p_payout: payoutId, p_provider_ref: `dl-${run}` })).error);

  const body = JSON.stringify({ payout_id: payoutId, status: 'PAID', provider: 'test-bank', provider_ref: `tx-${run}` });
  const forged = await fetch(`${URL_}/functions/v1/payout-webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mbarete-timestamp': String(Math.floor(Date.now() / 1000)), 'x-mbarete-signature': 'deadbeef' },
    body,
  });
  assert.equal(forged.status, 401, 'unsigned webhooks are rejected');
  const forgedDlocal = await fetch(`${URL_}/functions/v1/payout-webhook?provider=dlocal`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-date': new Date().toISOString(), 'x-login': 'x', authorization: 'V2-HMAC-SHA256, Signature: deadbeef' },
    body: JSON.stringify({ external_id: payoutId, status: 'PAID' }),
  });
  assert.ok(forgedDlocal.status === 401 || forgedDlocal.status === 400, `forged dLocal notifications are rejected (${forgedDlocal.status})`);

  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac('sha256', PAYOUT_SECRET).update(`${ts}.${body}`).digest('hex');
  for (let i = 0; i < 2; i++) {
    const res = await fetch(`${URL_}/functions/v1/payout-webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-mbarete-timestamp': ts, 'x-mbarete-signature': sig }, body });
    assert.equal(res.status, 200);
  }
  ({ data: wallet } = await S.creator.c.rpc('get_my_wallet'));
  assert.equal(wallet.paid_total, S.expected, 'settled exactly once');
  assert.equal(wallet.processing, 0);
  assert.equal(wallet.payouts.find((x) => x.id === payoutId).status, 'PAID');
});

test('invalid traffic found later is clawed back automatically', async () => {
  await db.query(`insert into private.account_risk (user_id, score, flags, trusted) values ($1, 90, '{bot_pattern}', false)
                  on conflict (user_id) do update set trusted = false, flags = '{bot_pattern}', score = 90`, [S.fan.user.id]);
  assert.ifError((await service.rpc('svc_run_fraud_checks')).error);
  const { rows: [imp] } = await db.query('select status from public.ad_impressions where id = $1', [S.impression]);
  assert.equal(imp.status, 'invalid');
  const { rows: [sess] } = await db.query('select status from public.watch_sessions where id = $1', [S.session]);
  assert.equal(sess.status, 'invalid');
  const { rows: adj } = await db.query(`select count(*)::int as n from public.wallet_ledger where user_id = $1 and entry_type in ('debit', 'adjustment') and description ilike '%tráfico inválido%'`, [S.creator.user.id]);
  assert.ok(adj[0].n >= 1, 'a clawback entry is written');
  const { data: progress } = await S.creator.c.rpc('get_monetization_progress');
  assert.equal(progress.watch_hours, 0, 'invalid hours are discounted from the counters');
  assert.equal(progress.status, 'active', 'an active creator is not deactivated by the counters');
  const { data: analytics, error } = await S.creator.c.rpc('get_creator_analytics', { p_days: 28 });
  assert.ifError(error);
  assert.ok(analytics.invalid_traffic.impressions >= 1);
  assert.ok(Array.isArray(analytics.daily) && analytics.totals);
});

test('AdMob SSV callback and payout job reject unauthenticated calls', async () => {
  const ping = await fetch(`${URL_}/functions/v1/admob-ssv`);
  assert.equal(ping.status, 200, 'AdMob console verification ping');
  const qs = new URLSearchParams({ ad_network: '5450213213286189855', ad_unit: '1234567890', custom_data: S.video, reward_amount: '1', reward_item: 'ad_free', timestamp: String(Date.now()), transaction_id: `tx${run}`, user_id: S.fan.user.id, key_id: '3335741209', signature: 'MEUCIQCLJS_s4ia_sN06HqzeW7Wc3nhZi4RlW3qV1oO-6AIYdQIgGJEh-rzKreO-paNDbSCzWGMtmgJHYYW9k2_icM9LFMY' });
  const forged = await fetch(`${URL_}/functions/v1/admob-ssv?${qs}`);
  assert.ok(forged.status >= 400 && forged.status < 500, `forged rewards are rejected (${forged.status})`);
  const { rows } = await db.query('select count(*)::int as n from public.ad_impressions where ssv_transaction_id = $1', [`tx${run}`]);
  assert.equal(rows[0].n, 0);
  for (const name of ['dlocal-payouts', 'admob-import']) {
    const res = await fetch(`${URL_}/functions/v1/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 401, `${name} requires the service role`);
  }
});

test('push: device tokens and the dispatcher', async () => {
  const token = `ExponentPushToken[e2e${run}abcdefghij]`;
  assert.ifError((await S.creator.c.rpc('register_push_token', { p_token: token, p_platform: 'android' })).error);
  const bad = await S.creator.c.rpc('register_push_token', { p_token: 'https://evil.example', p_platform: 'android' });
  assert.ok(bad.error, 'arbitrary endpoints are rejected');
  assert.ifError((await S.fan.c.from('messages').insert({ conversation_id: S.conv, body: 'secreto 1234' })).error);
  const { rows } = await db.query(`select body from private.push_queue where user_id = $1 order by id desc limit 1`, [S.creator.user.id]);
  assert.equal(rows[0]?.body, 'Te envió un mensaje', 'message text is not sent in the push');

  const denied = await fetch(`${URL_}/functions/v1/push-dispatch`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(denied.status, 401);
  const res = await fetch(`${URL_}/functions/v1/push-dispatch`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${SERVICE}` }, body: '{}' });
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.ok(out.claimed >= 1, 'pending pushes are claimed');
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
