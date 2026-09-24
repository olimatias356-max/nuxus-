import { Linking, Platform } from 'react-native';
import * as Crypto from 'expo-crypto';

import { env } from './env';
import { supabase } from './supabase';
import type { Plan } from './types';

// Pro is sold through the official store of each channel (Google Play Billing /
// StoreKit), as required by both stores for digital subscriptions. The app never
// grants Pro by itself: every purchase is verified by the `purchase-verify`
// Edge Function with Google/Apple before the entitlement is written.

export class PurchaseCancelled extends Error {}

type Iap = typeof import('expo-iap');

async function loadIap(): Promise<Iap> {
  try {
    return await import('expo-iap');
  } catch {
    throw new Error('Las compras necesitan la app instalada desde Google Play o App Store (no funcionan en Expo Go).');
  }
}

export const storeName = Platform.OS === 'ios' ? 'App Store' : 'Google Play';

async function verifyOnServer(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('purchase-verify', { body });
  if (error) {
    let message = 'No pudimos confirmar el pago. Si se cobró, tocá "Restaurar compras".';
    try {
      const ctx = await (error as any).context?.json?.();
      if (ctx?.error) message = ctx.error;
    } catch {}
    throw new Error(message);
  }
  return data as { status: string; plan_id: string; current_period_end: string };
}

async function accountToken(userId: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, userId);
}

export async function purchasePro(plan: Plan, userId: string) {
  if (env.billingMode === 'sandbox') {
    return verifyOnServer({ channel: 'sandbox', plan_id: plan.id });
  }
  if (Platform.OS === 'web') {
    throw new Error('En la web, Pro se activa desde el portal de pagos seguro.');
  }
  const sku = Platform.OS === 'ios' ? plan.apple_product_id : plan.google_product_id;
  if (!sku) throw new Error('Este plan todavía no está disponible en la tienda.');

  const IAP = await loadIap();
  await IAP.initConnection();
  const products = (await IAP.fetchProducts({ skus: [sku], type: 'subs' })) as any[];
  const product = products?.find((p) => p.id === sku);
  if (!product) throw new Error('Este plan todavía no está disponible en la tienda.');
  const offerToken: string | undefined = product.subscriptionOffers?.find((o: any) => o.offerTokenAndroid)?.offerTokenAndroid ?? undefined;
  const obfuscated = await accountToken(userId);

  return new Promise<Awaited<ReturnType<typeof verifyOnServer>>>((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      okSub.remove();
      errSub.remove();
      fn();
    };
    const okSub = IAP.purchaseUpdatedListener(async (purchase: any) => {
      if (purchase.productId !== sku) return;
      try {
        const result = await verifyOnServer({
          channel: Platform.OS === 'ios' ? 'app_store' : 'google_play',
          product_id: sku,
          purchase_token: purchase.purchaseToken ?? null,
          transaction_id: purchase.transactionId ?? purchase.id ?? null,
        });
        await IAP.finishTransaction({ purchase, isConsumable: false });
        done(() => resolve(result));
      } catch (e) {
        done(() => reject(e));
      }
    });
    const errSub = IAP.purchaseErrorListener((e: any) => {
      done(() => reject(IAP.isUserCancelledError?.(e) ? new PurchaseCancelled('Compra cancelada') : new Error(IAP.getUserFriendlyErrorMessage?.(e) ?? 'La compra no se completó.')));
    });
    IAP.requestPurchase({
      type: 'subs',
      request: {
        apple: { sku, appAccountToken: userId },
        google: { skus: [sku], obfuscatedAccountId: obfuscated, subscriptionOffers: offerToken ? [{ sku, offerToken }] : undefined },
      },
    } as any).catch((e: unknown) => done(() => reject(e)));
  });
}

/** Re-sends existing store purchases to the server (new device, reinstall). */
export async function restorePurchases() {
  if (env.billingMode === 'sandbox' || Platform.OS === 'web') return 0;
  const IAP = await loadIap();
  await IAP.initConnection();
  const purchases = ((await IAP.getAvailablePurchases()) ?? []) as any[];
  let restored = 0;
  for (const purchase of purchases) {
    try {
      await verifyOnServer({
        channel: Platform.OS === 'ios' ? 'app_store' : 'google_play',
        product_id: purchase.productId,
        purchase_token: purchase.purchaseToken ?? null,
        transaction_id: purchase.transactionId ?? purchase.id ?? null,
      });
      await IAP.finishTransaction({ purchase, isConsumable: false });
      restored++;
    } catch {
      // not ours / expired: ignore
    }
  }
  return restored;
}

export function openManageSubscriptions(channel: string | undefined) {
  if (channel === 'app_store' || (!channel && Platform.OS === 'ios')) {
    return Linking.openURL('https://apps.apple.com/account/subscriptions');
  }
  if (channel === 'google_play' || (!channel && Platform.OS === 'android')) {
    return Linking.openURL('https://play.google.com/store/account/subscriptions');
  }
  return Promise.resolve();
}
