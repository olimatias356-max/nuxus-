// Payout provider result. Signed with HMAC-SHA256(PAYOUT_WEBHOOK_SECRET, timestamp + "." + body)
// and replay-protected with a 5 minute window. Settlement is idempotent in SQL.
import { hmacSha256Hex, safeEqual } from '../_shared/crypto.ts';
import { fail, handler, json } from '../_shared/http.ts';
import { rpc } from '../_shared/supabase.ts';

Deno.serve(
  handler(async (req) => {
    const secret = Deno.env.get('PAYOUT_WEBHOOK_SECRET') ?? '';
    const ts = req.headers.get('x-mbarete-timestamp') ?? '';
    const sig = req.headers.get('x-mbarete-signature') ?? '';
    const raw = await req.text();
    if (!secret || !ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return fail(401, 'unauthorized');
    if (!safeEqual(sig, await hmacSha256Hex(secret, `${ts}.${raw}`))) return fail(401, 'unauthorized');

    const e = JSON.parse(raw) as { payout_id: string; status: 'PAID' | 'FAILED'; provider: string; provider_ref: string; failure_reason?: string };
    if (!/^[0-9a-f-]{36}$/i.test(e.payout_id ?? '') || !['PAID', 'FAILED'].includes(e.status)) return fail(400, 'invalid');
    const status = await rpc<string>('svc_complete_payout', {
      p_payout: e.payout_id,
      p_status: e.status,
      p_provider: String(e.provider ?? '').slice(0, 50),
      p_provider_ref: String(e.provider_ref ?? '').slice(0, 200),
      p_failure_reason: e.failure_reason ? String(e.failure_reason).slice(0, 300) : null,
    });
    return json({ status });
  }),
);
