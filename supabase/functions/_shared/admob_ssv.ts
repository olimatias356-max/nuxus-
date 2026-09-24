// AdMob rewarded-ad Server-Side Verification (SSV).
// https://developers.google.com/admob/android/ssv#manual_verification
//
// Google calls our URL with
//   ?ad_network=…&ad_unit=…&custom_data=…&reward_amount=…&reward_item=…&timestamp=…&transaction_id=…&user_id=…&signature=…&key_id=…
// `signature` and `key_id` are always the last two parameters. The signed message is the raw query
// string up to (not including) "&signature="; the signature is a base64url DER ECDSA P-256/SHA-256
// signature made with the key `key_id` from verifier-keys.json.
import { b64urlToBytes, pemToDer } from './crypto.ts';

export const SSV_KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
export const SSV_MAX_AGE_MS = 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class SsvError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

export type SsvReward = {
  transactionId: string;
  userId: string | null; // null when the callback carries no valid Supabase user id
  postId: string | null;
  adNetwork: string;
  adUnit: string;
  rewardItem: string;
  rewardAmount: number;
  timestampMs: number;
};

// ---------------------------------------------------------------------------
// ECDSA signature encodings
// ---------------------------------------------------------------------------

/** DER `SEQUENCE { INTEGER r, INTEGER s }` → IEEE P1363 `r || s` (what WebCrypto expects). */
export function derToRaw(der: Uint8Array, size = 32): Uint8Array {
  let i = 0;
  const byte = () => {
    if (i >= der.length) throw new Error('DER truncado');
    return der[i++];
  };
  const length = () => {
    const first = byte();
    if (first < 0x80) return first;
    if (first !== 0x81) throw new Error('DER: longitud no soportada');
    const len = byte();
    if (len < 0x80) throw new Error('DER: longitud no mínima');
    return len;
  };
  const integer = () => {
    if (byte() !== 0x02) throw new Error('DER: se esperaba INTEGER');
    const len = length();
    if (len === 0 || len > size + 1 || i + len > der.length) throw new Error('DER: INTEGER inválido');
    let v = der.subarray(i, i + len);
    i += len;
    if (v[0] & 0x80) throw new Error('DER: INTEGER negativo');
    while (v.length > 0 && v[0] === 0) v = v.subarray(1);
    if (v.length > size) throw new Error('DER: INTEGER demasiado grande');
    const out = new Uint8Array(size);
    out.set(v, size - v.length);
    return out;
  };
  if (byte() !== 0x30) throw new Error('DER: se esperaba SEQUENCE');
  const seqLen = length();
  if (i + seqLen !== der.length) throw new Error('DER: longitud de SEQUENCE inválida');
  const r = integer();
  const s = integer();
  if (i !== der.length) throw new Error('DER: bytes sobrantes');
  const raw = new Uint8Array(size * 2);
  raw.set(r, 0);
  raw.set(s, size);
  return raw;
}

/** IEEE P1363 `r || s` → DER. Used by tests (WebCrypto signs in P1363). */
export function rawToDer(raw: Uint8Array): Uint8Array {
  const size = raw.length / 2;
  if (!Number.isInteger(size) || size === 0 || size > 66) throw new Error('firma cruda inválida');
  const int = (x: Uint8Array) => {
    let start = 0;
    while (start < x.length - 1 && x[start] === 0) start++;
    const v = x.subarray(start);
    const body = v[0] & 0x80 ? [0, ...v] : [...v];
    return [0x02, body.length, ...body];
  };
  const body = [...int(raw.subarray(0, size)), ...int(raw.subarray(size))];
  const head = body.length < 0x80 ? [0x30, body.length] : [0x30, 0x81, body.length];
  return new Uint8Array([...head, ...body]);
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

/** Parses verifier-keys.json: `{ keys: [{ keyId, pem, base64 }] }` (base64 = SPKI DER). */
export async function importSsvKeys(json: unknown): Promise<Map<string, CryptoKey>> {
  const keys = (json as { keys?: Array<{ keyId?: number | string; pem?: string; base64?: string }> })?.keys;
  if (!Array.isArray(keys)) throw new Error('verifier-keys.json inválido');
  const out = new Map<string, CryptoKey>();
  for (const k of keys) {
    if (k?.keyId === undefined || (!k.base64 && !k.pem)) continue;
    try {
      const der = k.base64 ? b64urlToBytes(k.base64).slice().buffer as ArrayBuffer : pemToDer(k.pem!);
      out.set(String(k.keyId), await crypto.subtle.importKey('spki', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']));
    } catch {
      // skip keys we cannot parse; others may still verify
    }
  }
  if (!out.size) throw new Error('verifier-keys.json sin claves válidas');
  return out;
}

/** Caches Google's public keys (24 h) and refreshes early, at most every 5 minutes, when an unknown key id shows up. */
export class SsvKeyStore {
  private keys = new Map<string, CryptoKey>();
  private fetchedAt: number | null = null;
  private inflight: Promise<void> | null = null;

  constructor(
    private load: () => Promise<unknown>,
    private opts: { ttlMs: number; minRefreshMs: number } = { ttlMs: 24 * 3600_000, minRefreshMs: 5 * 60_000 },
    private now: () => number = Date.now,
  ) {}

  private refresh(): Promise<void> {
    this.inflight ??= (async () => {
      try {
        const keys = await importSsvKeys(await this.load());
        this.keys = keys;
        this.fetchedAt = this.now();
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }

  async get(keyId: string): Promise<CryptoKey | null> {
    if (this.fetchedAt === null || this.now() - this.fetchedAt > this.opts.ttlMs) {
      try {
        await this.refresh();
      } catch (e) {
        if (!this.keys.size) throw e; // keep serving stale keys if Google is briefly unreachable
      }
    }
    if (!this.keys.has(keyId) && this.now() - (this.fetchedAt ?? 0) > this.opts.minRefreshMs) {
      await this.refresh().catch(() => {});
    }
    return this.keys.get(keyId) ?? null;
  }
}

// ---------------------------------------------------------------------------
// Callback parsing and verification
// ---------------------------------------------------------------------------

/** Splits the raw query into the signed message and the trailing `signature` / `key_id`. */
export function splitSsvQuery(query: string): { message: string; signature: string; keyId: string } {
  const q = query.startsWith('?') ? query.slice(1) : query;
  const i = q.indexOf('&signature=');
  if (i <= 0) throw new SsvError(400, 'missing_signature');
  const tail = /^&signature=([A-Za-z0-9_-]+={0,2})&key_id=(\d{1,20})$/.exec(q.slice(i));
  if (!tail) throw new SsvError(400, 'malformed_signature');
  return { message: q.slice(0, i), signature: tail[1], keyId: tail[2] };
}

/** Reads the reward fields from the SIGNED part of the query only. */
export function parseSsvMessage(message: string, nowMs: number, maxAgeMs = SSV_MAX_AGE_MS): SsvReward {
  const params = new URLSearchParams(message);
  const seen = new Set<string>();
  for (const k of params.keys()) {
    if (seen.has(k)) throw new SsvError(400, 'duplicate_param');
    seen.add(k);
  }
  const get = (k: string) => params.get(k) ?? '';

  const ts = get('timestamp');
  if (!/^\d{10,16}$/.test(ts)) throw new SsvError(400, 'invalid_timestamp');
  const timestampMs = Number(ts);
  if (nowMs - timestampMs > maxAgeMs || timestampMs - nowMs > MAX_FUTURE_SKEW_MS) throw new SsvError(400, 'stale_timestamp');

  const transactionId = get('transaction_id');
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(transactionId)) throw new SsvError(400, 'invalid_transaction_id');

  const amount = get('reward_amount') || '0';
  if (!/^\d{1,9}$/.test(amount)) throw new SsvError(400, 'invalid_reward_amount');

  const userId = get('user_id');
  const customData = get('custom_data');
  return {
    transactionId,
    userId: UUID.test(userId) ? userId.toLowerCase() : null,
    postId: UUID.test(customData) ? customData.toLowerCase() : null,
    adNetwork: get('ad_network').slice(0, 100),
    adUnit: get('ad_unit').slice(0, 100),
    rewardItem: get('reward_item').slice(0, 100),
    rewardAmount: Number(amount),
    timestampMs,
  };
}

export async function verifyEcdsaDer(key: CryptoKey, message: string, signatureB64url: string): Promise<boolean> {
  let raw: Uint8Array;
  try {
    raw = derToRaw(b64urlToBytes(signatureB64url));
  } catch {
    return false;
  }
  return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, raw.slice(), new TextEncoder().encode(message));
}

/** Full check of a callback query. Throws SsvError (4xx) on anything that is not a fresh, genuine Google callback. */
export async function verifySsvCallback(
  query: string,
  getKey: (keyId: string) => Promise<CryptoKey | null>,
  nowMs = Date.now(),
): Promise<SsvReward> {
  const { message, signature, keyId } = splitSsvQuery(query);
  const reward = parseSsvMessage(message, nowMs);
  const key = await getKey(keyId);
  if (!key) throw new SsvError(403, 'unknown_key');
  if (!(await verifyEcdsaDer(key, message, signature))) throw new SsvError(403, 'bad_signature');
  return reward;
}

export type SsvRecordResult = { id: string | null; ignored?: string };

/**
 * Request → response for the SSV endpoint. `record` stores the reward and throws on transient
 * failures (→ 503 so Google retries). Duplicates and unattributable rewards answer 200 so Google stops retrying.
 */
export async function handleSsvRequest(
  query: string,
  deps: { getKey: (keyId: string) => Promise<CryptoKey | null>; record: (r: SsvReward & { userId: string }) => Promise<SsvRecordResult>; now?: () => number },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const q = query.startsWith('?') ? query.slice(1) : query;
  if (!q) return { status: 200, body: { ok: true } }; // AdMob console verification ping
  let reward: SsvReward;
  try {
    reward = await verifySsvCallback(q, deps.getKey, (deps.now ?? Date.now)());
  } catch (e) {
    if (e instanceof SsvError) return { status: e.status, body: { error: e.code } };
    console.error('admob-ssv: key fetch failed', e instanceof Error ? e.message : e);
    return { status: 503, body: { error: 'keys_unavailable' } };
  }
  if (!reward.userId) return { status: 200, body: { ok: true, ignored: 'no_user' } };
  try {
    const res = await deps.record({ ...reward, userId: reward.userId });
    return { status: 200, body: res.ignored ? { ok: true, ignored: res.ignored } : { ok: true, id: res.id } };
  } catch (e) {
    console.error('admob-ssv: record failed', e instanceof Error ? e.message : e);
    return { status: 503, body: { error: 'retry' } };
  }
}
