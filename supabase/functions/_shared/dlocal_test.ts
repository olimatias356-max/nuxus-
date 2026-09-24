import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1';

import {
  buildPayoutPayload,
  classifyCreateResponse,
  dlocalHeaders,
  dlocalSignature,
  type DuePayout,
  formatAmount,
  mapDlocalStatus,
  parseDlocalNotification,
  processPayout,
  sanitizeReason,
  splitName,
  stripEmpty,
  verifyDlocalNotification,
} from './dlocal.ts';

const CREDS = { login: 'test-login', transKey: 'test-trans-key', secretKey: 'test-secret-key' };
const X_DATE = '2026-09-21T12:00:00.000Z';
const BODY = '{"external_id":"abc","amount":1000}';
// Independent vectors: python3 -c "import hmac,hashlib; print(hmac.new(b'test-secret-key', b'test-login'+b'2026-09-21T12:00:00.000Z'+BODY, hashlib.sha256).hexdigest())"
const V2_SIGNATURE = '592ac35e853ddbc4b2e9cd5c1e89be5f78e0c778e9e77d75119e4d90ad0afe1f';
const PAYLOAD_SIGNATURE = 'd5ba765bdb08e8dd850529f11a070160b7324c774d64a04834b1203bd3319e6e';

const PAYOUT = 'c1a2b3c4-d5e6-4f70-8a9b-0c1d2e3f4a5b';

function due(overrides: Partial<DuePayout> = {}): DuePayout {
  return {
    payout_id: PAYOUT,
    user_id: '5b0c1e7a-3f4d-4e2b-9a1c-0d2e3f4a5b6c',
    amount: 150000,
    currency: 'PYG',
    country: 'PY',
    email: 'creadora@example.com',
    holder_name: 'María José Benítez',
    document_type: 'ci',
    document_number: '1.234.567',
    bank_name: 'Banco Itaú',
    bank_code: '11',
    branch: null,
    account_type: 'savings',
    account_number: '0012345678',
    ...overrides,
  };
}

function hasEmpty(v: unknown): boolean {
  if (v === undefined || v === null || v === '') return true;
  if (typeof v !== 'object') return false;
  const entries = Object.values(v as Record<string, unknown>);
  return entries.length === 0 || entries.some(hasEmpty);
}

// ---------------------------------------------------------------------------
// Signatures
// ---------------------------------------------------------------------------

Deno.test('dlocalSignature matches a known HMAC-SHA256 vector', async () => {
  assertEquals(await dlocalSignature(CREDS.secretKey, CREDS.login, X_DATE, BODY), V2_SIGNATURE);
});

Deno.test('dlocalHeaders carries the V2-HMAC Authorization and Payload-Signature', async () => {
  const h = await dlocalHeaders(CREDS, BODY, new Date(X_DATE));
  assertEquals(h['X-Date'], X_DATE);
  assertEquals(h['X-Login'], 'test-login');
  assertEquals(h['X-Trans-Key'], 'test-trans-key');
  assertEquals(h['Content-Type'], 'application/json');
  assertEquals(h.Authorization, `V2-HMAC-SHA256, Signature: ${V2_SIGNATURE}`);
  assertEquals(h['Payload-Signature'], PAYLOAD_SIGNATURE);
  assertFalse(JSON.stringify(h).includes('test-secret-key'), 'the secret never travels');
});

Deno.test('verifyDlocalNotification accepts genuine and rejects forged notifications', async () => {
  const c = { login: CREDS.login, secretKey: CREDS.secretKey };
  const auth = `V2-HMAC-SHA256, Signature: ${V2_SIGNATURE}`;
  assert(await verifyDlocalNotification(c, { xDate: X_DATE, authorization: auth }, BODY));
  assert(await verifyDlocalNotification(c, { xDate: X_DATE, authorization: `V2-HMAC-SHA256,Signature: ${V2_SIGNATURE.toUpperCase()}` }, BODY));
  assertFalse(await verifyDlocalNotification(c, { xDate: X_DATE, authorization: auth }, BODY + ' '));
  assertFalse(await verifyDlocalNotification(c, { xDate: '2026-09-21T12:00:01.000Z', authorization: auth }, BODY));
  assertFalse(await verifyDlocalNotification(c, { xDate: X_DATE, authorization: 'V2-HMAC-SHA256, Signature: deadbeef' }, BODY));
  assertFalse(await verifyDlocalNotification(c, { xDate: X_DATE, authorization: V2_SIGNATURE }, BODY));
  assertFalse(await verifyDlocalNotification(c, { xDate: null, authorization: auth }, BODY));
  assertFalse(await verifyDlocalNotification({ login: CREDS.login, secretKey: '' }, { xDate: X_DATE, authorization: auth }, BODY));
  assertFalse(await verifyDlocalNotification({ login: 'other', secretKey: CREDS.secretKey }, { xDate: X_DATE, authorization: auth }, BODY));
});

// ---------------------------------------------------------------------------
// Payload builder
// ---------------------------------------------------------------------------

Deno.test('buildPayoutPayload: Paraguay bank transfer', () => {
  const r = buildPayoutPayload(due(), { notificationUrl: 'https://x.supabase.co/functions/v1/payout-webhook?provider=dlocal' });
  assert(r.ok);
  assertEquals(r.payload, {
    external_id: PAYOUT,
    payment_method_id: 'BANK_TRANSFER',
    flow_type: 'B2C',
    purpose: 'OTHER_SERVICES',
    country: 'PY',
    currency: 'PYG',
    amount: 150000,
    notification_url: 'https://x.supabase.co/functions/v1/payout-webhook?provider=dlocal',
    beneficiary: {
      first_name: 'María',
      last_name: 'José Benítez',
      email: 'creadora@example.com',
      document: { type: 'CI', id: '1234567' },
      bank_account: { code: '11', account: '0012345678', type: 'SAVINGS' },
    },
  });
});

Deno.test('buildPayoutPayload: Argentina (CBU only) and Brazil (code + branch + type)', () => {
  const ar = buildPayoutPayload(due({ country: 'AR', currency: 'ARS', amount: '431650', document_type: 'cuil', document_number: '20-37411529-5', bank_code: '072', branch: '001', account_number: '0000003100060931875108' }));
  assert(ar.ok);
  assertEquals(ar.payload.amount, 4316.5);
  assertEquals((ar.payload.beneficiary as Record<string, unknown>).bank_account, { account: '0000003100060931875108' });
  assertEquals((ar.payload.beneficiary as Record<string, unknown>).document, { type: 'CUIL', id: '20374115295' });

  const br = buildPayoutPayload(due({ country: 'BR', currency: 'BRL', amount: 100050, document_type: 'cpf', document_number: '817.359.610-78', bank_code: '341', branch: '3537', account_type: 'checking', account_number: '46757-6' }));
  assert(br.ok);
  assertEquals(br.payload.amount, 1000.5);
  assertEquals((br.payload.beneficiary as Record<string, unknown>).bank_account, { code: '341', branch: '3537', account: '467576', type: 'CHECKING' });
  assertEquals(buildPayoutPayload(due({ country: 'BR', currency: 'BRL', branch: null })), { ok: false, error: 'missing_bank_details' });
});

Deno.test('buildPayoutPayload never includes undefined, null or empty fields', () => {
  const sparse = due({ email: null, branch: '', account_type: null, bank_name: null });
  const r = buildPayoutPayload(sparse, { notificationUrl: null });
  assert(r.ok);
  assertFalse(hasEmpty(r.payload));
  assertFalse('notification_url' in r.payload);
  assertFalse('email' in (r.payload.beneficiary as Record<string, unknown>));
  assertFalse(JSON.stringify(r.payload).includes('null'));
  for (const variant of [due(), due({ country: 'AR', currency: 'ARS', document_type: 'cuit' }), due({ country: 'BR', currency: 'BRL', branch: '1', account_type: 'checking' })]) {
    const v = buildPayoutPayload(variant);
    assert(v.ok);
    assertFalse(hasEmpty(v.payload));
  }
});

Deno.test('buildPayoutPayload rejects data dLocal cannot pay', () => {
  const err = (o: Partial<DuePayout>) => {
    const r = buildPayoutPayload(due(o));
    return r.ok ? null : r.error;
  };
  assertEquals(err({ payout_id: 'nope' }), 'invalid_payout_id');
  assertEquals(err({ country: 'UY' }), 'unsupported_country');
  assertEquals(err({ currency: 'XXX' }), 'unsupported_currency');
  assertEquals(err({ amount: 0 }), 'invalid_amount');
  assertEquals(err({ amount: '12.5' }), 'invalid_amount');
  assertEquals(err({ holder_name: '  ' }), 'missing_holder_name');
  assertEquals(err({ document_number: null }), 'missing_document');
  assertEquals(err({ document_type: '' }), 'missing_document');
  assertEquals(err({ account_number: '' }), 'missing_account_number');
  assertEquals(err({ bank_code: null }), 'missing_bank_code');
});

Deno.test('formatAmount, splitName and stripEmpty', () => {
  assertEquals(formatAmount(150000n, 0), 150000);
  assertEquals(formatAmount(5n, 2), 0.05);
  assertEquals(formatAmount(123456789n, 2), 1234567.89);
  assertEquals(formatAmount(100n, 2), 1);
  assertEquals(splitName('Juan'), { first_name: 'Juan', last_name: 'Juan' });
  assertEquals(splitName(' Juan  Pérez '), { first_name: 'Juan', last_name: 'Pérez' });
  assertEquals(splitName('Juan Pérez Gómez'), { first_name: 'Juan', last_name: 'Pérez Gómez' });
  assertEquals(splitName('Juan Carlos Pérez Gómez'), { first_name: 'Juan Carlos', last_name: 'Pérez Gómez' });
  assertEquals(stripEmpty<Record<string, unknown>>({ a: 1, b: undefined, c: null, d: '', e: { f: undefined }, g: { h: 0 } }), { a: 1, g: { h: 0 } });
});

// ---------------------------------------------------------------------------
// Responses and notifications
// ---------------------------------------------------------------------------

Deno.test('classifyCreateResponse', () => {
  assertEquals(classifyCreateResponse(200, { id: 'PO-1', status: 'PENDING', status_code: '100' }), { kind: 'sent', ref: 'PO-1' });
  assertEquals(classifyCreateResponse(201, { id: 'PO-1', status: 'RECEIVED' }), { kind: 'sent', ref: 'PO-1' });
  assertEquals(classifyCreateResponse(200, { id: 'PO-1', status: 'PAID' }), { kind: 'paid', ref: 'PO-1' });
  assertEquals(classifyCreateResponse(200, { id: 'PO-1', status: 'REJECTED', status_code: '300', status_detail: 'Invalid account 0012345678' }), {
    kind: 'rejected',
    ref: 'PO-1',
    reason: '300: Invalid account ****',
  });
  assertEquals(classifyCreateResponse(400, { code: 5001, message: 'Invalid beneficiary document' }), { kind: 'rejected', ref: null, reason: '5001: Invalid beneficiary document' });
  assertEquals(classifyCreateResponse(400, { code: 5010, message: 'Duplicated external_id' }).kind, 'duplicate');
  assertEquals(classifyCreateResponse(409, null).kind, 'duplicate');
  assertEquals(classifyCreateResponse(401, { message: 'bad signature' }), { kind: 'halt', reason: 'auth' });
  assertEquals(classifyCreateResponse(404, null), { kind: 'halt', reason: 'endpoint' });
  assertEquals(classifyCreateResponse(429, null), { kind: 'halt', reason: 'rate_limited' });
  assertEquals(classifyCreateResponse(502, null), { kind: 'retry', reason: 'http_502' });
  assertEquals(classifyCreateResponse(500, 'oops'), { kind: 'retry', reason: 'http_500' });
});

Deno.test('mapDlocalStatus', () => {
  assertEquals(mapDlocalStatus('PAID'), 'PAID');
  assertEquals(mapDlocalStatus('paid'), 'PAID');
  for (const s of ['REJECTED', 'CANCELLED', 'CANCELED']) assertEquals(mapDlocalStatus(s), 'FAILED');
  assertEquals(mapDlocalStatus('RETURNED'), 'REVERSED');
  for (const s of ['PENDING', 'DELIVERED', 'ON_HOLD', 'RECEIVED', 'WHATEVER']) assertEquals(mapDlocalStatus(s), null);
  assertEquals(mapDlocalStatus(undefined, '200'), 'PAID');
  assertEquals(mapDlocalStatus('', 300), 'FAILED');
  assertEquals(mapDlocalStatus(null, '100'), null);
});

Deno.test('parseDlocalNotification: flat V3 body and platforms envelope', () => {
  assertEquals(parseDlocalNotification({ id: 'PO-9', external_id: PAYOUT.toUpperCase(), status: 'rejected', status_code: '300', status_detail: 'Account 12345678 closed' }), {
    payoutId: PAYOUT,
    providerRef: 'PO-9',
    status: 'REJECTED',
    statusCode: '300',
    reason: '300: Account **** closed',
  });
  const env = parseDlocalNotification({ event_type: 'PAYOUT_STATUS_UPDATE', payload: { id: 'PP-4', external_reference: PAYOUT, status: 'PAID', status_code: 200 } });
  assertEquals([env.payoutId, env.providerRef, env.status], [PAYOUT, 'PP-4', 'PAID']);
  assertEquals(parseDlocalNotification({ external_id: 'order-1', status: 'PAID' }).payoutId, null);
  assertEquals(parseDlocalNotification(null).payoutId, null);
});

Deno.test('sanitizeReason strips account numbers and emails', () => {
  assertEquals(sanitizeReason('Account 0000003100060931875108 of a@b.com rejected'), 'Account **** of [email] rejected');
  assertEquals(sanitizeReason('x'.repeat(500)).length, 300);
  assertEquals(sanitizeReason(undefined), '');
});

// ---------------------------------------------------------------------------
// processPayout (money flow)
// ---------------------------------------------------------------------------

function harness(response: { status: number; body: unknown } | Error) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const sent: Array<{ body: string; headers: Record<string, string> }> = [];
  const deps = {
    creds: CREDS,
    notificationUrl: 'https://x.supabase.co/functions/v1/payout-webhook?provider=dlocal',
    now: new Date(X_DATE),
    post: (body: string, headers: Record<string, string>) => {
      sent.push({ body, headers });
      return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
    },
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return Promise.resolve(null);
    },
  };
  return { calls, sent, deps };
}

Deno.test('processPayout: accepted → marked sent with the dLocal id; request is signed over the exact body', async () => {
  const h = harness({ status: 200, body: { id: 'PO-77', status: 'PENDING', status_code: '100' } });
  assertEquals(await processPayout(due(), h.deps), { outcome: 'sent' });
  assertEquals(h.calls, [{ fn: 'svc_mark_payout_sent', args: { p_payout: PAYOUT, p_provider_ref: 'PO-77' } }]);
  const { body, headers } = h.sent[0];
  assertEquals(JSON.parse(body).external_id, PAYOUT);
  assertEquals(headers.Authorization, `V2-HMAC-SHA256, Signature: ${await dlocalSignature(CREDS.secretKey, CREDS.login, X_DATE, body)}`);
});

Deno.test('processPayout: definitive rejection → FAILED (balance back to AVAILABLE)', async () => {
  const h = harness({ status: 400, body: { code: 5001, message: 'Invalid account 0012345678' } });
  assertEquals((await processPayout(due(), h.deps)).outcome, 'failed');
  assertEquals(h.calls, [{
    fn: 'svc_complete_payout',
    args: { p_payout: PAYOUT, p_status: 'FAILED', p_provider: 'dlocal', p_provider_ref: null, p_failure_reason: '5001: Invalid account ****' },
  }]);
});

Deno.test('processPayout: invalid beneficiary data fails without calling dLocal', async () => {
  const h = harness({ status: 200, body: {} });
  assertEquals(await processPayout(due({ bank_code: null }), h.deps), { outcome: 'failed', detail: 'missing_bank_code' });
  assertEquals(h.sent.length, 0);
  assertEquals(h.calls[0].args.p_status, 'FAILED');
});

Deno.test('processPayout: duplicate → sent; instant PAID → sent then PAID', async () => {
  const dup = harness({ status: 409, body: { message: 'external_id already exists' } });
  assertEquals(await processPayout(due(), dup.deps), { outcome: 'sent', detail: 'duplicate' });
  assertEquals(dup.calls, [{ fn: 'svc_mark_payout_sent', args: { p_payout: PAYOUT, p_provider_ref: `external:${PAYOUT}` } }]);

  const paid = harness({ status: 200, body: { id: 'PO-1', status: 'PAID' } });
  assertEquals(await processPayout(due(), paid.deps), { outcome: 'paid' });
  assertEquals(paid.calls.map((c) => [c.fn, c.args.p_status]), [['svc_mark_payout_sent', undefined], ['svc_complete_payout', 'PAID']]);
});

Deno.test('processPayout: network errors, 5xx and auth problems touch nothing', async () => {
  for (const [res, outcome] of [[new Error('timeout'), 'retry'], [{ status: 503, body: null }, 'retry'], [{ status: 401, body: null }, 'halted'], [{ status: 404, body: null }, 'halted']] as const) {
    const h = harness(res as { status: number; body: unknown } | Error);
    assertEquals((await processPayout(due(), h.deps)).outcome, outcome);
    assertEquals(h.calls.length, 0);
  }
});
