// Store notifications (Google Play RTDN via Pub/Sub push, App Store Server
// Notifications V2) and web checkout events. The body is only used to know WHICH
// subscription changed: its state is re-fetched from the store API before
// anything is written. Processing is idempotent (unique channel + event id).
import { decodeJwsPayload, hmacSha256Hex, safeEqual, sha256Hex } from '../_shared/crypto.ts';
import { fail, handler, HttpError, json } from '../_shared/http.ts';
import { refreshAppleSubscription, verifyGoogleSubscription, type StoreSubscription } from '../_shared/stores.ts';
import { adminClient, rpc } from '../_shared/supabase.ts';

async function apply(channel: 'google_play' | 'app_store' | 'web', sub: StoreSubscription, eventType: string) {
  const db = adminClient();
  const { data: existing } = await db.from('subscriptions').select('user_id, plan_id').eq('channel', channel).eq('external_id', sub.externalId).maybeSingle();
  if (!existing) return { ignored: 'unknown subscription' }; // first purchase arrives through purchase-verify
  const column = channel === 'google_play' ? 'google_product_id' : 'apple_product_id';
  const { data: plan } = await db.from('plans').select('id').eq(column, sub.productId).maybeSingle();
  await rpc('svc_apply_subscription', {
    p_user: existing.user_id,
    p_plan: plan?.id ?? existing.plan_id,
    p_channel: channel,
    p_external_id: sub.externalId,
    p_status: sub.status,
    p_period_end: sub.periodEnd,
    p_auto_renew: sub.autoRenew,
    p_event_id: sub.eventId,
    p_event_type: eventType,
    p_payload: sub.raw,
  });
  return { ok: true };
}

Deno.serve(
  handler(
    async (req) => {
      const url = new URL(req.url);
      const source = url.searchParams.get('source');
      const raw = await req.text();

      if (source === 'google') {
        // Pub/Sub push subscription configured with ?source=google&token=<GOOGLE_RTDN_TOKEN>
        const expected = Deno.env.get('GOOGLE_RTDN_TOKEN') ?? '';
        if (!expected || !safeEqual(url.searchParams.get('token') ?? '', expected)) return fail(401, 'unauthorized');
        const envelope = JSON.parse(raw);
        const data = JSON.parse(atob(envelope?.message?.data ?? '') || '{}');
        if (data.packageName !== Deno.env.get('GOOGLE_PLAY_PACKAGE_NAME')) return json({ ignored: 'package' });
        const token = data.subscriptionNotification?.purchaseToken;
        if (!token) return json({ ignored: 'not a subscription notification' });
        const sub = await verifyGoogleSubscription(token);
        return json(await apply('google_play', sub, `rtdn_${data.subscriptionNotification.notificationType}`));
      }

      if (source === 'apple') {
        const { signedPayload } = JSON.parse(raw);
        if (typeof signedPayload !== 'string') throw new HttpError(400, 'payload');
        // Unverified hint only; the state is re-fetched from Apple below.
        const note = decodeJwsPayload<{ notificationType: string; data?: { signedTransactionInfo?: string; bundleId?: string } }>(signedPayload);
        if (note.data?.bundleId && note.data.bundleId !== Deno.env.get('APPLE_BUNDLE_ID')) return json({ ignored: 'bundle' });
        const hint = note.data?.signedTransactionInfo ? decodeJwsPayload<{ originalTransactionId: string }>(note.data.signedTransactionInfo) : null;
        if (!hint?.originalTransactionId) return json({ ignored: 'no transaction' });
        const sub = await refreshAppleSubscription(hint.originalTransactionId);
        if (!sub) return json({ ignored: 'not found' });
        return json(await apply('app_store', sub, `asn_${note.notificationType}`));
      }

      if (source === 'web') {
        // Web checkout backend: body signed with HMAC-SHA256(WEB_BILLING_SECRET, timestamp + "." + body).
        const secret = Deno.env.get('WEB_BILLING_SECRET') ?? '';
        const ts = req.headers.get('x-mbarete-timestamp') ?? '';
        const sig = req.headers.get('x-mbarete-signature') ?? '';
        if (!secret || !ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return fail(401, 'unauthorized');
        if (!safeEqual(sig, await hmacSha256Hex(secret, `${ts}.${raw}`))) return fail(401, 'unauthorized');
        const e = JSON.parse(raw) as { event_id: string; user_id: string; plan_id: string; subscription_id: string; status: StoreSubscription['status']; period_end: string; auto_renew: boolean };
        await rpc('svc_apply_subscription', {
          p_user: e.user_id,
          p_plan: e.plan_id,
          p_channel: 'web',
          p_external_id: await sha256Hex(e.subscription_id),
          p_status: e.status,
          p_period_end: e.period_end,
          p_auto_renew: e.auto_renew,
          p_event_id: e.event_id,
          p_event_type: 'web',
          p_payload: { status: e.status },
        });
        return json({ ok: true });
      }

      return fail(400, 'source');
    },
    { maxBody: 256 * 1024 },
  ),
);
