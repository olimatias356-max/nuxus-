// Verifies an in-app purchase with the store and writes the Pro entitlement.
// POST { channel: 'google_play' | 'app_store' | 'sandbox', product_id?, purchase_token?, transaction_id?, plan_id? }
import { handler, HttpError, json, readJson } from '../_shared/http.ts';
import { sha256Hex } from '../_shared/crypto.ts';
import { verifyAppleTransaction, verifyGoogleSubscription } from '../_shared/stores.ts';
import { adminClient, requireUser, rpc } from '../_shared/supabase.ts';

type Body = { channel?: string; product_id?: string; purchase_token?: string; transaction_id?: string; plan_id?: string };

Deno.serve(
  handler(async (req) => {
    const user = await requireUser(req);
    const body = await readJson<Body>(req);
    const db = adminClient();

    if (body.channel === 'sandbox') {
      // Test purchases for development builds only. Never enable in production.
      if (Deno.env.get('ALLOW_SANDBOX_PURCHASES') !== 'true') throw new HttpError(403, 'Las compras de prueba están deshabilitadas');
      const { data: plan } = await db.from('plans').select('id').eq('id', body.plan_id ?? '').eq('active', true).maybeSingle();
      if (!plan) throw new HttpError(400, 'Plan inválido');
      const periodEnd = new Date(Date.now() + 30 * 86_400_000).toISOString();
      await rpc('svc_apply_subscription', {
        p_user: user.id,
        p_plan: plan.id,
        p_channel: 'sandbox',
        p_external_id: `sandbox:${user.id}`,
        p_status: 'active',
        p_period_end: periodEnd,
        p_auto_renew: true,
        p_event_id: `sandbox:${user.id}:${crypto.randomUUID()}`,
        p_event_type: 'purchase',
        p_payload: { plan: plan.id },
      });
      return json({ status: 'active', plan_id: plan.id, current_period_end: periodEnd });
    }

    if (body.channel !== 'google_play' && body.channel !== 'app_store') throw new HttpError(400, 'Canal inválido');
    if (!body.product_id || body.product_id.length > 200) throw new HttpError(400, 'Producto inválido');

    const column = body.channel === 'google_play' ? 'google_product_id' : 'apple_product_id';
    const { data: plan } = await db.from('plans').select('id').eq(column, body.product_id).eq('active', true).maybeSingle();
    if (!plan) throw new HttpError(400, 'Producto desconocido');

    let sub;
    if (body.channel === 'google_play') {
      if (!body.purchase_token || body.purchase_token.length > 1000) throw new HttpError(400, 'Falta el comprobante de compra');
      sub = await verifyGoogleSubscription(body.purchase_token);
      // The purchase must have been made from this account (obfuscated account id = sha256(user id)).
      if (sub.accountToken !== (await sha256Hex(user.id))) throw new HttpError(403, 'La compra pertenece a otra cuenta');
    } else {
      if (!body.transaction_id || body.transaction_id.length > 100) throw new HttpError(400, 'Falta la transacción');
      sub = await verifyAppleTransaction(body.transaction_id);
      if ((sub.accountToken ?? '').toLowerCase() !== user.id.toLowerCase()) throw new HttpError(403, 'La compra pertenece a otra cuenta');
    }
    if (sub.productId !== body.product_id) throw new HttpError(400, 'El producto no coincide con la compra');

    await rpc('svc_apply_subscription', {
      p_user: user.id,
      p_plan: plan.id,
      p_channel: body.channel,
      p_external_id: sub.externalId,
      p_status: sub.status,
      p_period_end: sub.periodEnd,
      p_auto_renew: sub.autoRenew,
      p_event_id: sub.eventId,
      p_event_type: 'purchase',
      p_payload: sub.raw,
    });
    if (!['active', 'grace', 'canceled'].includes(sub.status)) throw new HttpError(402, 'La suscripción no está activa');
    return json({ status: sub.status, plan_id: plan.id, current_period_end: sub.periodEnd });
  }),
);
