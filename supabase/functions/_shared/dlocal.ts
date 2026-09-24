// dLocal Payouts helpers (pure, unit tested in dlocal_test.ts).
//
// CONFIRMED against docs.dlocal.com (via Context7, 2026-09):
//   - V3 payload shape for BANK_TRANSFER in PY / AR / BR: external_id, payment_method_id, flow_type, purpose,
//     country, currency, amount (decimal), notification_url, beneficiary { first_name, last_name, document { type, id },
//     bank_account { code, branch, account, type: CHECKING | SAVINGS } }.
//     PY: document CI + bank_account.code + account. AR: CUIL/CUIT (11 digits) + CBU/CVU in account.
//     BR: document + code + branch + account + type.
//   - Endpoint: POST {api}/payouts/v3 (api.dlocal.com / sandbox.dlocal.com).
//   - Statuses: PENDING (100), PAID (200), REJECTED (300), CANCELLED (400); DELIVERED / ON_HOLD / RECEIVED are
//     intermediate. Notifications are signed "V2-HMAC-SHA256, Signature: hex(HMAC(secret, X-Login + X-Date + body))"
//     in the Authorization header.
// MUST BE CONFIRMED with dLocal before going live (their docs contradict each other):
//   - Request auth for Payouts V3: the "Payouts API Integration" page asks for a `Payload-Signature` header,
//     "Generate a signature" says V3 uses OAuth2 Bearer tokens, and payins use V2-HMAC in Authorization.
//     We send the V2-HMAC Authorization header AND Payload-Signature = hex(HMAC(secret, body)); a 401/403 halts
//     the batch without failing any payout, so a wrong guess is safe.
//   - `purpose` code for creator earnings (OTHER_SERVICES is the documented B2C example).
//   - The exact error code dLocal returns for a duplicated external_id (we match 409 and "duplicat…" texts).
//   - Notification body field names (we accept flat V3 `{id, external_id, status, status_code}` and the
//     `{event_type, payload:{…}}` envelope).
import { hmacSha256Hex, safeEqual } from './crypto.ts';

export const DLOCAL_DEFAULT_PAYOUTS_PATH = '/payouts/v3';
export const CURRENCY_DECIMALS: Record<string, number> = { PYG: 0, ARS: 2, BRL: 2, USD: 2 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DlocalCredentials = { login: string; transKey: string; secretKey: string };

/** Row returned by svc_payouts_due. Contains decrypted data: never log it. */
export type DuePayout = {
  payout_id: string;
  user_id: string;
  amount: number | string;
  currency: string;
  country: string;
  email: string | null;
  holder_name: string | null;
  document_type: string | null;
  document_number: string | null;
  bank_name: string | null;
  bank_code: string | null;
  branch: string | null;
  account_type: string | null;
  account_number: string | null;
};

// ---------------------------------------------------------------------------
// Signatures
// ---------------------------------------------------------------------------

export function dlocalSignature(secretKey: string, login: string, xDate: string, body: string): Promise<string> {
  return hmacSha256Hex(secretKey, login + xDate + body);
}

export async function dlocalHeaders(c: DlocalCredentials, body: string, now = new Date()): Promise<Record<string, string>> {
  const xDate = now.toISOString();
  return {
    'X-Date': xDate,
    'X-Login': c.login,
    'X-Trans-Key': c.transKey,
    'Content-Type': 'application/json',
    'User-Agent': 'MbareteFans/1.0',
    Authorization: `V2-HMAC-SHA256, Signature: ${await dlocalSignature(c.secretKey, c.login, xDate, body)}`,
    'Payload-Signature': await hmacSha256Hex(c.secretKey, body),
  };
}

/** Verifies a dLocal notification: Authorization = "V2-HMAC-SHA256, Signature: <hex>" over X-Login + X-Date + raw body. */
export async function verifyDlocalNotification(
  c: { login: string; secretKey: string },
  h: { xDate: string | null; authorization: string | null },
  rawBody: string,
): Promise<boolean> {
  if (!c.login || !c.secretKey || !h.xDate || !h.authorization) return false;
  const m = /^V2-HMAC-SHA256,\s*Signature:\s*([0-9a-fA-F]{64})\s*$/.exec(h.authorization.trim());
  if (!m) return false;
  return safeEqual(m[1].toLowerCase(), await dlocalSignature(c.secretKey, c.login, h.xDate, rawBody));
}

// ---------------------------------------------------------------------------
// Payload builder
// ---------------------------------------------------------------------------

const DOCUMENT_TYPES: Record<string, string> = {
  ci: 'CI',
  ruc: 'RUC',
  dni: 'DNI',
  cuil: 'CUIL',
  cuit: 'CUIT',
  cpf: 'CPF',
  cnpj: 'CNPJ',
  passport: 'PASS',
  pass: 'PASS',
};
const ACCOUNT_TYPES: Record<string, string> = { savings: 'SAVINGS', checking: 'CHECKING' };

/** Removes undefined / null / '' values and empty objects, recursively. */
export function stripEmpty<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripEmpty) as T;
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    const clean = stripEmpty(v);
    if (clean === undefined || clean === null || clean === '') continue;
    if (typeof clean === 'object' && !Array.isArray(clean) && !Object.keys(clean).length) continue;
    out[k] = clean;
  }
  return out as T;
}

/** Minor units → decimal amount (PYG has 0 decimals, ARS/BRL 2). Exact for any integer input. */
export function formatAmount(minor: bigint, decimals: number): number {
  if (decimals === 0) return Number(minor);
  const s = minor.toString().padStart(decimals + 1, '0');
  return Number(`${s.slice(0, -decimals)}.${s.slice(-decimals)}`);
}

/** "Juan Carlos Pérez Gómez" → first "Juan Carlos", last "Pérez Gómez"; 2–3 words → first word / rest. */
export function splitName(full: string): { first_name: string; last_name: string } {
  const words = full.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { first_name: words[0] ?? '', last_name: words[0] ?? '' };
  const cut = words.length >= 4 ? 2 : 1;
  return { first_name: words.slice(0, cut).join(' '), last_name: words.slice(cut).join(' ') };
}

const clean = (s: string | null | undefined) => (s ?? '').trim();
const compact = (s: string | null | undefined) => clean(s).replace(/[\s.\-/]/g, '');

export type BuildResult = { ok: true; payload: Record<string, unknown> } | { ok: false; error: string };

export function buildPayoutPayload(p: DuePayout, opts: { notificationUrl?: string | null } = {}): BuildResult {
  if (!UUID.test(p.payout_id ?? '')) return { ok: false, error: 'invalid_payout_id' };
  const country = clean(p.country).toUpperCase();
  if (!['PY', 'AR', 'BR'].includes(country)) return { ok: false, error: 'unsupported_country' };
  const currency = clean(p.currency).toUpperCase();
  const decimals = CURRENCY_DECIMALS[currency];
  if (decimals === undefined) return { ok: false, error: 'unsupported_currency' };
  let minor: bigint;
  try {
    minor = BigInt(String(p.amount));
  } catch {
    return { ok: false, error: 'invalid_amount' };
  }
  if (minor <= 0n) return { ok: false, error: 'invalid_amount' };

  const name = splitName(clean(p.holder_name));
  if (!name.first_name) return { ok: false, error: 'missing_holder_name' };
  const docType = DOCUMENT_TYPES[clean(p.document_type).toLowerCase()] ?? (/^[A-Za-z]{2,6}$/.test(clean(p.document_type)) ? clean(p.document_type).toUpperCase() : '');
  const docId = compact(p.document_number);
  if (!docType || !docId) return { ok: false, error: 'missing_document' };
  const account = compact(p.account_number);
  if (!account) return { ok: false, error: 'missing_account_number' };
  const bankCode = clean(p.bank_code);
  const branch = clean(p.branch);
  const accountType = ACCOUNT_TYPES[clean(p.account_type).toLowerCase()];
  if (country === 'PY' && !bankCode) return { ok: false, error: 'missing_bank_code' };
  if (country === 'BR' && (!bankCode || !branch || !accountType)) return { ok: false, error: 'missing_bank_details' };

  const payload = stripEmpty({
    external_id: p.payout_id,
    payment_method_id: 'BANK_TRANSFER',
    flow_type: 'B2C',
    purpose: 'OTHER_SERVICES',
    country,
    currency,
    amount: formatAmount(minor, decimals),
    notification_url: opts.notificationUrl ?? undefined,
    beneficiary: {
      first_name: name.first_name,
      last_name: name.last_name,
      email: clean(p.email) || undefined,
      document: { type: docType, id: docId },
      bank_account: {
        // Argentina routes by CBU/CVU alone.
        code: country === 'AR' ? undefined : bankCode,
        branch: country === 'AR' ? undefined : branch,
        account,
        type: country === 'AR' ? undefined : accountType,
      },
    },
  });
  return { ok: true, payload };
}

// ---------------------------------------------------------------------------
// Responses and notifications
// ---------------------------------------------------------------------------

/** Keeps provider messages free of account / document numbers and emails. */
export function sanitizeReason(s: unknown): string {
  return String(s ?? '')
    .replace(/\S+@\S+/g, '[email]')
    .replace(/\d{5,}/g, '****')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

const FAILED = new Set(['REJECTED', 'CANCELLED', 'CANCELED', 'FAILED', 'DECLINED', 'EXPIRED']);
const REVERSED = new Set(['RETURNED', 'REVERSED', 'REFUNDED']);

/** dLocal status → svc_complete_payout status; null = not final yet (PENDING, DELIVERED, ON_HOLD…). */
export function mapDlocalStatus(status: unknown, statusCode?: unknown): 'PAID' | 'FAILED' | 'REVERSED' | null {
  const s = String(status ?? '').trim().toUpperCase();
  if (s === 'PAID') return 'PAID';
  if (FAILED.has(s)) return 'FAILED';
  if (REVERSED.has(s)) return 'REVERSED';
  if (!s) {
    const code = String(statusCode ?? '');
    if (code === '200') return 'PAID';
    if (code === '300' || code === '400') return 'FAILED';
  }
  return null;
}

type Obj = Record<string, unknown>;
const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));

function reasonOf(b: Obj | null): string {
  if (!b) return '';
  const code = str(b.code ?? b.error_code ?? b.status_code);
  const msg = str(b.status_detail ?? b.message ?? b.error_description ?? b.description ?? b.desc ?? b.error);
  return sanitizeReason([code, msg].filter(Boolean).join(': '));
}

export type CreateOutcome =
  | { kind: 'sent'; ref: string | null }
  | { kind: 'paid'; ref: string | null }
  | { kind: 'rejected'; ref: string | null; reason: string }
  | { kind: 'duplicate'; ref: string | null }
  | { kind: 'retry'; reason: string }
  | { kind: 'halt'; reason: string };

/**
 * Classifies the response to "create payout".
 * - rejected: definitive (validation / beneficiary data) → FAILED, balance goes back to AVAILABLE.
 * - duplicate: dLocal already has this external_id (earlier run crashed after sending) → mark sent.
 * - retry: unknown outcome (5xx / timeout) → leave REQUESTED; the external_id makes the retry idempotent.
 * - halt: our credentials / endpoint / rate limit → stop the batch, touch nothing.
 */
export function classifyCreateResponse(httpStatus: number, body: unknown): CreateOutcome {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? (body as Obj) : null;
  const ref = str(b?.id ?? b?.payout_id ?? b?.cashout_id) || null;
  const text = `${str(b?.message)} ${str(b?.description)} ${str(b?.desc)} ${str(b?.error)} ${str(b?.status_detail)}`;
  const duplicate = /duplicat|already (exists|registered|processed|used)/i.test(text);

  if (httpStatus >= 200 && httpStatus < 300) {
    const final = mapDlocalStatus(b?.status, b?.status_code);
    if (final === 'PAID') return { kind: 'paid', ref };
    if (final === 'FAILED' || final === 'REVERSED') return { kind: 'rejected', ref, reason: reasonOf(b) || 'rejected' };
    return { kind: 'sent', ref };
  }
  if (httpStatus === 409 || ((httpStatus === 400 || httpStatus === 422) && duplicate)) return { kind: 'duplicate', ref };
  if (httpStatus === 400 || httpStatus === 422) return { kind: 'rejected', ref, reason: reasonOf(b) || `http_${httpStatus}` };
  if (httpStatus === 401 || httpStatus === 403) return { kind: 'halt', reason: 'auth' };
  if (httpStatus === 404 || httpStatus === 405) return { kind: 'halt', reason: 'endpoint' };
  if (httpStatus === 429) return { kind: 'halt', reason: 'rate_limited' };
  return { kind: 'retry', reason: `http_${httpStatus}` };
}

export type PayoutOutcome = 'sent' | 'paid' | 'failed' | 'retry' | 'halted';

/**
 * Sends one due payout and records the result. I/O is injected so the money flow is unit tested:
 * `post` performs the HTTP call (throws on network errors), `rpc` calls the service-role SQL functions.
 */
export async function processPayout(
  p: DuePayout,
  deps: {
    creds: DlocalCredentials;
    notificationUrl?: string | null;
    post: (body: string, headers: Record<string, string>) => Promise<{ status: number; body: unknown }>;
    rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown>;
    now?: Date;
  },
): Promise<{ outcome: PayoutOutcome; detail?: string }> {
  const failPayout = (ref: string | null, reason: string) =>
    deps.rpc('svc_complete_payout', { p_payout: p.payout_id, p_status: 'FAILED', p_provider: 'dlocal', p_provider_ref: ref, p_failure_reason: reason });

  const built = buildPayoutPayload(p, { notificationUrl: deps.notificationUrl });
  if (!built.ok) {
    await failPayout(null, `invalid_beneficiary:${built.error}`);
    return { outcome: 'failed', detail: built.error };
  }
  const body = JSON.stringify(built.payload);
  let res: { status: number; body: unknown };
  try {
    res = await deps.post(body, await dlocalHeaders(deps.creds, body, deps.now));
  } catch {
    return { outcome: 'retry', detail: 'network' };
  }
  const c = classifyCreateResponse(res.status, res.body);
  const ref = ('ref' in c ? c.ref : null) ?? `external:${p.payout_id}`;
  switch (c.kind) {
    case 'sent':
    case 'duplicate':
      await deps.rpc('svc_mark_payout_sent', { p_payout: p.payout_id, p_provider_ref: ref });
      return c.kind === 'duplicate' ? { outcome: 'sent', detail: 'duplicate' } : { outcome: 'sent' };
    case 'paid':
      await deps.rpc('svc_mark_payout_sent', { p_payout: p.payout_id, p_provider_ref: ref });
      await deps.rpc('svc_complete_payout', { p_payout: p.payout_id, p_status: 'PAID', p_provider: 'dlocal', p_provider_ref: ref, p_failure_reason: null });
      return { outcome: 'paid' };
    case 'rejected':
      await failPayout(c.ref, c.reason);
      return { outcome: 'failed', detail: c.reason };
    case 'retry':
      return { outcome: 'retry', detail: c.reason };
    case 'halt':
      return { outcome: 'halted', detail: c.reason };
  }
}

export type DlocalNotification = { payoutId: string | null; providerRef: string; status: string; statusCode: string; reason: string };

export function parseDlocalNotification(body: unknown): DlocalNotification {
  const root = body && typeof body === 'object' ? (body as Obj) : {};
  const p = root.payload && typeof root.payload === 'object' ? (root.payload as Obj) : root;
  const external = str(p.external_id ?? p.external_reference).trim();
  return {
    payoutId: UUID.test(external) ? external.toLowerCase() : null,
    providerRef: str(p.id ?? p.payout_id ?? p.cashout_id).slice(0, 200),
    status: str(p.status).toUpperCase(),
    statusCode: str(p.status_code),
    reason: reasonOf(p),
  };
}
