// Payout provider results. Settlement is idempotent in SQL (svc_complete_payout).
//
// Generic mode (tests / other providers): HMAC-SHA256(PAYOUT_WEBHOOK_SECRET, timestamp + "." + body) in
// x-mbarete-signature, x-mbarete-timestamp within 5 minutes. Body: { payout_id, status, provider, provider_ref, failure_reason? }.
//
// ?provider=dlocal: dLocal notification signed with Authorization "V2-HMAC-SHA256, Signature: <hex>" over
// DLOCAL_LOGIN + X-Date + raw body (DLOCAL_SECRET_KEY). external_id = our payout id.
import { hmacSha256Hex, safeEqual } from '../_shared/crypto.ts';
import { mapDlocalStatus, parseDlocalNotification, verifyDlocalNotification } from '../_shared/dlocal.ts';
import { fail, handler, json } from '../_shared/http.ts';
import { rpc } from '../_shared/supabase.ts';

const STATUSES = ['PAID', 'FAILED', 'REVERSED'];

function parse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function generic(req: Request, raw: string): Promise<Response> {
  const secret = Deno.env.get('PAYOUT_WEBHOOK_SECRET') ?? '';
  const ts = req.headers.get('x-mbarete-timestamp') ?? '';
  const sig = req.headers.get('x-mbarete-signature') ?? '';
  if (!secret || !ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return fail(401, 'unauthorized');
  if (!safeEqual(sig, await hmacSha256Hex(secret, `${ts}.${raw}`))) return fail(401, 'unauthorized');

  const e = parse(raw) as { payout_id?: string; status?: string; provider?: string; provider_ref?: string; failure_reason?: string } | null;
  if (!e || !/^[0-9a-f-]{36}$/i.test(e.payout_id ?? '') || !STATUSES.includes(e.status ?? '')) return fail(400, 'invalid');
  const status = await rpc<string>('svc_complete_payout', {
    p_payout: e.payout_id,
    p_status: e.status,
    p_provider: String(e.provider ?? '').slice(0, 50),
    p_provider_ref: String(e.provider_ref ?? '').slice(0, 200),
    p_failure_reason: e.failure_reason ? String(e.failure_reason).slice(0, 300) : null,
  });
  return json({ status });
}

async function dlocal(req: Request, raw: string): Promise<Response> {
  const ok = await verifyDlocalNotification(
    { login: Deno.env.get('DLOCAL_LOGIN') ?? '', secretKey: Deno.env.get('DLOCAL_SECRET_KEY') ?? '' },
    { xDate: req.headers.get('x-date'), authorization: req.headers.get('authorization') },
    raw,
  );
  if (!ok) return fail(401, 'unauthorized');

  const body = parse(raw);
  if (!body || typeof body !== 'object') return fail(400, 'invalid');
  const n = parseDlocalNotification(body);
  // Answer 200 to what we cannot act on so dLocal stops retrying; the payload is signed, so it is genuine.
  if (!n.payoutId) return json({ ignored: 'unknown_external_id' });
  const mapped = mapDlocalStatus(n.status, n.statusCode);
  if (!mapped) return json({ ignored: 'not_final', provider_status: n.status || n.statusCode });

  const status = await rpc<string>('svc_complete_payout', {
    p_payout: n.payoutId,
    p_status: mapped,
    p_provider: 'dlocal',
    p_provider_ref: n.providerRef,
    p_failure_reason: mapped === 'PAID' ? null : n.reason || n.status,
  });
  console.log('payout-webhook dlocal', n.payoutId, n.status, '→', status);
  return json({ status });
}

Deno.serve(
  handler(async (req) => {
    const raw = await req.text();
    return new URL(req.url).searchParams.get('provider') === 'dlocal' ? await dlocal(req, raw) : await generic(req, raw);
  }),
);
