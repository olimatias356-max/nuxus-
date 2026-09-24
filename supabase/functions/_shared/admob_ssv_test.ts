import { assert, assertEquals, assertRejects, assertThrows } from 'jsr:@std/assert@1';

import { bytesToB64url } from './crypto.ts';
import {
  derToRaw,
  handleSsvRequest,
  importSsvKeys,
  parseSsvMessage,
  rawToDer,
  splitSsvQuery,
  SsvError,
  SsvKeyStore,
  type SsvReward,
  verifySsvCallback,
} from './admob_ssv.ts';

const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);
const USER = '5b0c1e7a-3f4d-4e2b-9a1c-0d2e3f4a5b6c';
const POST = '9f8e7d6c-5b4a-4321-8fed-cba987654321';

async function keyPair() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
  let bin = '';
  for (const b of spki) bin += String.fromCharCode(b);
  const base64 = btoa(bin);
  const pem = `-----BEGIN PUBLIC KEY-----\n${base64.match(/.{1,64}/g)!.join('\n')}\n-----END PUBLIC KEY-----`;
  return { pair, base64, pem };
}

async function sign(privateKey: CryptoKey, message: string): Promise<string> {
  const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(message)));
  return bytesToB64url(rawToDer(raw));
}

function message(overrides: Record<string, string> = {}): string {
  const p = {
    ad_network: '5450213213286189855',
    ad_unit: '1234567890',
    custom_data: POST,
    reward_amount: '1',
    reward_item: 'ad_free',
    timestamp: String(NOW - 1000),
    transaction_id: '123456789abcdef',
    user_id: USER,
    ...overrides,
  };
  // Google percent-encodes values; URLSearchParams does the same.
  return new URLSearchParams(p).toString();
}

async function setup() {
  const { pair, base64, pem } = await keyPair();
  const keys = await importSsvKeys({ keys: [{ keyId: 3335741209, pem, base64 }] });
  return { pair, keys, getKey: (id: string) => Promise.resolve(keys.get(id) ?? null) };
}

// ---------------------------------------------------------------------------
// DER <-> raw
// ---------------------------------------------------------------------------

Deno.test('rawToDer/derToRaw round-trip, including leading zero bytes and high bits', () => {
  const cases: Uint8Array[] = [];
  for (let i = 0; i < 200; i++) cases.push(crypto.getRandomValues(new Uint8Array(64)));
  const zeros = new Uint8Array(64).fill(0x11);
  zeros.set([0, 0, 0x05], 0); // r with two leading zero bytes
  zeros.set([0], 32); // s with a leading zero byte
  const high = new Uint8Array(64).fill(0xff); // both need a 0x00 sign byte in DER
  const tiny = new Uint8Array(64);
  tiny[31] = 1;
  tiny[63] = 0; // s = 0
  cases.push(zeros, high, tiny);
  for (const raw of cases) assertEquals(derToRaw(rawToDer(raw)), raw);
});

Deno.test('rawToDer produces minimal DER integers', () => {
  const raw = new Uint8Array(64);
  raw.set([0, 0, 0x7f], 0);
  raw[32] = 0x80;
  const der = rawToDer(raw);
  assertEquals(der[0], 0x30);
  assertEquals(der[2], 0x02);
  assertEquals(der[3], 30); // 32 bytes minus two leading zeros
  const sAt = 4 + 30;
  assertEquals([der[sAt], der[sAt + 1], der[sAt + 2]], [0x02, 33, 0x00]); // 0x80.. gets a sign byte
});

Deno.test('derToRaw accepts a redundant leading zero and rejects malformed input', () => {
  const r = new Uint8Array(32).fill(0x01);
  const s = new Uint8Array(32).fill(0x02);
  const lenient = new Uint8Array([0x30, 2 + 33 + 2 + 32, 0x02, 33, 0x00, ...r, 0x02, 32, ...s]);
  assertEquals(derToRaw(lenient), new Uint8Array([...r, ...s]));

  const good = rawToDer(new Uint8Array([...r, ...s]));
  assertThrows(() => derToRaw(good.subarray(0, good.length - 1))); // truncated
  assertThrows(() => derToRaw(new Uint8Array([...good, 0x00]))); // trailing bytes
  assertThrows(() => derToRaw(new Uint8Array([0x31, ...good.subarray(1)]))); // not a SEQUENCE
  const negative = new Uint8Array(good);
  negative[4] = 0x81; // high bit set without sign byte → negative integer
  assertThrows(() => derToRaw(negative));
  const tooBig = new Uint8Array([0x30, 2 + 34 + 2 + 32, 0x02, 34, 0x01, 0x01, ...r, 0x02, 32, ...s]);
  assertThrows(() => derToRaw(tooBig));
  assertThrows(() => derToRaw(new Uint8Array([])));
});

Deno.test('derToRaw handles long-form lengths (P-521 style)', () => {
  const raw = new Uint8Array(132).fill(0x42);
  assertEquals(derToRaw(rawToDer(raw), 66), raw);
});

// ---------------------------------------------------------------------------
// Query parsing
// ---------------------------------------------------------------------------

Deno.test('splitSsvQuery: message excludes &signature=… and key_id must be last', () => {
  const m = message();
  const parts = splitSsvQuery(`?${m}&signature=MEUCIQ_-abc&key_id=3335741209`);
  assertEquals(parts, { message: m, signature: 'MEUCIQ_-abc', keyId: '3335741209' });
  for (const bad of [m, `${m}&key_id=1&signature=abc`, `${m}&signature=abc`, `${m}&signature=abc&key_id=1&user_id=x`, 'signature=abc&key_id=1', `${m}&signature=a%2Fb&key_id=1`]) {
    const e = assertThrows(() => splitSsvQuery(bad), SsvError);
    assertEquals(e.status, 400);
  }
});

Deno.test('parseSsvMessage validates timestamp, ids and duplicates', () => {
  const r = parseSsvMessage(message(), NOW);
  assertEquals(r.userId, USER);
  assertEquals(r.postId, POST);
  assertEquals(r.rewardAmount, 1);
  assertEquals(r.timestampMs, NOW - 1000);

  const code = (m: string) => (assertThrows(() => parseSsvMessage(m, NOW), SsvError) as SsvError).code;
  assertEquals(code(message({ timestamp: String(NOW - 3600_001) })), 'stale_timestamp');
  assertEquals(code(message({ timestamp: String(NOW + 10 * 60_000) })), 'stale_timestamp');
  assertEquals(code(message({ timestamp: 'abc' })), 'invalid_timestamp');
  assertEquals(code(message({ transaction_id: 'x y' })), 'invalid_transaction_id');
  assertEquals(code(message({ transaction_id: '' })), 'invalid_transaction_id');
  assertEquals(code(message({ reward_amount: '-1' })), 'invalid_reward_amount');
  assertEquals(code(`${message()}&user_id=${USER}`), 'duplicate_param');

  assertEquals(parseSsvMessage(message({ custom_data: '' }), NOW).postId, null);
  assertEquals(parseSsvMessage(message({ custom_data: 'not-a-uuid' }), NOW).postId, null);
  assertEquals(parseSsvMessage(message({ user_id: 'testuser' }), NOW).userId, null);
});

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

Deno.test('verifySsvCallback accepts a genuine callback signed with a local P-256 key', async () => {
  const { pair, getKey } = await setup();
  const m = message();
  const reward = await verifySsvCallback(`${m}&signature=${await sign(pair.privateKey, m)}&key_id=3335741209`, getKey, NOW);
  assertEquals(reward.transactionId, '123456789abcdef');
  assertEquals(reward.userId, USER);
});

Deno.test('verifySsvCallback: tampered message, unknown key id and wrong key fail', async () => {
  const { pair, getKey } = await setup();
  const m = message();
  const sig = await sign(pair.privateKey, m);

  const tampered = message({ user_id: '11111111-2222-4333-8444-555555555555' });
  let e = await assertRejects(() => verifySsvCallback(`${tampered}&signature=${sig}&key_id=3335741209`, getKey, NOW), SsvError);
  assertEquals([e.status, e.code], [403, 'bad_signature']);

  e = await assertRejects(() => verifySsvCallback(`${m}&signature=${sig}&key_id=42`, getKey, NOW), SsvError);
  assertEquals([e.status, e.code], [403, 'unknown_key']);

  const other = await keyPair();
  const otherSig = await sign(other.pair.privateKey, m);
  e = await assertRejects(() => verifySsvCallback(`${m}&signature=${otherSig}&key_id=3335741209`, getKey, NOW), SsvError);
  assertEquals(e.code, 'bad_signature');

  e = await assertRejects(() => verifySsvCallback(`${m}&signature=AAAA&key_id=3335741209`, getKey, NOW), SsvError);
  assertEquals(e.code, 'bad_signature'); // not DER

  // Parameters appended after key_id are not part of the signed message: rejected, never trusted.
  e = await assertRejects(() => verifySsvCallback(`${m}&signature=${sig}&key_id=3335741209&custom_data=${POST}`, getKey, NOW), SsvError);
  assertEquals(e.status, 400);
});

Deno.test('importSsvKeys reads base64 or PEM and rejects empty sets', async () => {
  const { pem, pair } = await keyPair();
  const keys = await importSsvKeys({ keys: [{ keyId: 7, pem }, { keyId: 8, base64: '!!!' }] });
  assertEquals([...keys.keys()], ['7']);
  const m = message();
  assert(await verifySsvCallback(`${m}&signature=${await sign(pair.privateKey, m)}&key_id=7`, (id) => Promise.resolve(keys.get(id) ?? null), NOW));
  await assertRejects(() => importSsvKeys({ keys: [] }));
  await assertRejects(() => importSsvKeys({ nope: 1 }));
});

Deno.test('SsvKeyStore caches, refreshes on unknown ids at most every 5 min, and serves stale keys on outage', async () => {
  const { pem } = await keyPair();
  let calls = 0;
  let fail = false;
  let t = 0;
  const store = new SsvKeyStore(
    () => {
      calls++;
      if (fail) return Promise.reject(new Error('down'));
      return Promise.resolve({ keys: [{ keyId: 1, pem }] });
    },
    { ttlMs: 24 * 3600_000, minRefreshMs: 5 * 60_000 },
    () => t,
  );
  assert(await store.get('1'));
  assertEquals(calls, 1);
  assertEquals(await store.get('2'), null); // just fetched: no refetch
  assertEquals(calls, 1);
  t += 6 * 60_000;
  assertEquals(await store.get('2'), null); // unknown id after 5 min → one refetch
  assertEquals(calls, 2);
  assertEquals(await store.get('2'), null);
  assertEquals(calls, 2);
  t += 25 * 3600_000;
  fail = true;
  assert(await store.get('1'), 'stale keys survive a failed refresh');

  const empty = new SsvKeyStore(() => Promise.reject(new Error('down')));
  await assertRejects(() => empty.get('1'));
});

// ---------------------------------------------------------------------------
// Request handling
// ---------------------------------------------------------------------------

Deno.test('handleSsvRequest: ping, success, duplicates, unattributable rewards and retries', async () => {
  const { pair, getKey } = await setup();
  const stored: SsvReward[] = [];
  const record = (r: SsvReward & { userId: string }) => {
    stored.push(r);
    return Promise.resolve({ id: 'imp-1' });
  };
  const now = () => NOW;

  assertEquals(await handleSsvRequest('', { getKey, record, now }), { status: 200, body: { ok: true } });

  const m = message();
  const q = `${m}&signature=${await sign(pair.privateKey, m)}&key_id=3335741209`;
  assertEquals(await handleSsvRequest(q, { getKey, record, now }), { status: 200, body: { ok: true, id: 'imp-1' } });
  assertEquals(stored[0].postId, POST);

  const noUser = message({ user_id: '' });
  const q2 = `${noUser}&signature=${await sign(pair.privateKey, noUser)}&key_id=3335741209`;
  assertEquals((await handleSsvRequest(q2, { getKey, record, now })).body.ignored, 'no_user');
  assertEquals(stored.length, 1);

  const forged = await handleSsvRequest(`${m}&signature=${await sign((await keyPair()).pair.privateKey, m)}&key_id=3335741209`, { getKey, record, now });
  assertEquals(forged.status, 403);
  assertEquals(stored.length, 1);

  assertEquals((await handleSsvRequest(`${m}&key_id=3335741209&signature=abc`, { getKey, record, now })).status, 400);

  const down = await handleSsvRequest(q, { getKey: () => Promise.reject(new Error('down')), record, now });
  assertEquals(down.status, 503);
  const dbDown = await handleSsvRequest(q, { getKey, record: () => Promise.reject(new Error('db')), now });
  assertEquals(dbDown.status, 503);
  const dup = await handleSsvRequest(q, { getKey, record: () => Promise.resolve({ id: null, ignored: 'PT404' }), now });
  assertEquals(dup, { status: 200, body: { ok: true, ignored: 'PT404' } });
});
