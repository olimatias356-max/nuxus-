// Server-side verification against Google Play and the App Store.
// Entitlements are always derived from what the store API returns, never from
// what the app or a webhook body claims.
import { decodeJwsPayload, sha256Hex, signJwt } from './crypto.ts';
import { HttpError } from './http.ts';

export type StoreSubscription = {
  status: 'active' | 'grace' | 'on_hold' | 'canceled' | 'expired' | 'revoked';
  periodEnd: string;
  autoRenew: boolean;
  productId: string;
  externalId: string;
  eventId: string;
  accountToken: string | null;
  raw: Record<string, unknown>;
};

// ---------------------------------------------------------------- Google Play
let googleToken: { value: string; exp: number } | null = null;

async function googleAccessToken(): Promise<string> {
  if (googleToken && googleToken.exp > Date.now() + 60_000) return googleToken.value;
  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!raw) throw new HttpError(503, 'Google Play Billing no está configurado en el servidor');
  const sa = JSON.parse(raw) as { client_email: string; private_key: string; token_uri?: string };
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: sa.token_uri ?? 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    sa.private_key,
  );
  const res = await fetch(sa.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new HttpError(502, 'No se pudo autenticar con Google Play');
  const data = await res.json();
  googleToken = { value: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return googleToken.value;
}

export async function verifyGoogleSubscription(purchaseToken: string): Promise<StoreSubscription> {
  const pkg = Deno.env.get('GOOGLE_PLAY_PACKAGE_NAME');
  if (!pkg) throw new HttpError(503, 'Falta GOOGLE_PLAY_PACKAGE_NAME');
  const token = await googleAccessToken();
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(pkg)}/purchases`;
  const res = await fetch(`${base}/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404 || res.status === 410) throw new HttpError(400, 'Compra inexistente en Google Play');
  if (!res.ok) throw new HttpError(502, 'Google Play no respondió');
  const sub = await res.json();

  const item = (sub.lineItems ?? [])[0] ?? {};
  const productId: string = item.productId ?? '';
  const stateMap: Record<string, StoreSubscription['status']> = {
    SUBSCRIPTION_STATE_ACTIVE: 'active',
    SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'grace',
    SUBSCRIPTION_STATE_ON_HOLD: 'on_hold',
    SUBSCRIPTION_STATE_PAUSED: 'on_hold',
    SUBSCRIPTION_STATE_CANCELED: 'canceled',
    SUBSCRIPTION_STATE_EXPIRED: 'expired',
    SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED: 'expired',
  };
  const status = stateMap[sub.subscriptionState] ?? 'expired';

  // Acknowledge within 3 days or Google refunds automatically.
  if (sub.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING' && (status === 'active' || status === 'grace') && productId) {
    await fetch(`${base}/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
  }

  return {
    status,
    periodEnd: item.expiryTime ?? new Date().toISOString(),
    autoRenew: !!item.autoRenewingPlan?.autoRenewEnabled,
    productId,
    externalId: await sha256Hex(purchaseToken),
    eventId: `${sub.latestOrderId ?? 'order'}:${sub.subscriptionState}:${item.expiryTime ?? ''}`,
    accountToken: sub.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
    raw: { subscriptionState: sub.subscriptionState, latestOrderId: sub.latestOrderId, productId },
  };
}

// ------------------------------------------------------------------ App Store
function appleBase() {
  return Deno.env.get('APPLE_ENVIRONMENT') === 'Production'
    ? 'https://api.storekit.itunes.apple.com'
    : 'https://api.storekit-sandbox.itunes.apple.com';
}

async function appleJwt(): Promise<string> {
  const issuer = Deno.env.get('APPLE_ISSUER_ID');
  const keyId = Deno.env.get('APPLE_KEY_ID');
  const key = Deno.env.get('APPLE_PRIVATE_KEY');
  const bundleId = Deno.env.get('APPLE_BUNDLE_ID');
  if (!issuer || !keyId || !key || !bundleId) throw new HttpError(503, 'App Store Server API no está configurada en el servidor');
  const now = Math.floor(Date.now() / 1000);
  return signJwt({ alg: 'ES256', kid: keyId, typ: 'JWT' }, { iss: issuer, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1', bid: bundleId }, key);
}

type AppleTransaction = {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  bundleId: string;
  expiresDate?: number;
  revocationDate?: number;
  appAccountToken?: string;
};

export async function verifyAppleTransaction(transactionId: string): Promise<StoreSubscription> {
  const res = await fetch(`${appleBase()}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, {
    headers: { Authorization: `Bearer ${await appleJwt()}` },
  });
  if (res.status === 404) throw new HttpError(400, 'Transacción inexistente en App Store');
  if (!res.ok) throw new HttpError(502, 'App Store no respondió');
  const { signedTransactionInfo } = await res.json();
  // Fetched directly from Apple over TLS with our credentials.
  const tx = decodeJwsPayload<AppleTransaction>(signedTransactionInfo);
  if (tx.bundleId !== Deno.env.get('APPLE_BUNDLE_ID')) throw new HttpError(400, 'La compra no pertenece a esta app');
  return appleToSubscription(tx, await appleAutoRenew(tx.originalTransactionId));
}

async function appleAutoRenew(originalTransactionId: string): Promise<{ autoRenew: boolean; status: number | null }> {
  const res = await fetch(`${appleBase()}/inApps/v1/subscriptions/${encodeURIComponent(originalTransactionId)}`, {
    headers: { Authorization: `Bearer ${await appleJwt()}` },
  });
  if (!res.ok) return { autoRenew: true, status: null };
  const data = await res.json();
  const last = data.data?.[0]?.lastTransactions?.find((t: any) => t.originalTransactionId === originalTransactionId);
  if (!last) return { autoRenew: true, status: null };
  const renewal = last.signedRenewalInfo ? decodeJwsPayload<{ autoRenewStatus?: number }>(last.signedRenewalInfo) : {};
  return { autoRenew: renewal.autoRenewStatus === 1, status: last.status ?? null };
}

function appleToSubscription(tx: AppleTransaction, info: { autoRenew: boolean; status: number | null }): StoreSubscription {
  const expires = tx.expiresDate ? new Date(tx.expiresDate) : new Date();
  let status: StoreSubscription['status'];
  if (tx.revocationDate || info.status === 5) status = 'revoked';
  else if (info.status === 4) status = 'grace';
  else if (info.status === 3) status = 'on_hold';
  else if (expires.getTime() <= Date.now() || info.status === 2) status = 'expired';
  else status = info.autoRenew ? 'active' : 'canceled';
  return {
    status,
    periodEnd: expires.toISOString(),
    autoRenew: info.autoRenew,
    productId: tx.productId,
    externalId: tx.originalTransactionId,
    eventId: `${tx.transactionId}:${status}`,
    accountToken: tx.appAccountToken ?? null,
    raw: { transactionId: tx.transactionId, productId: tx.productId },
  };
}

export async function refreshAppleSubscription(originalTransactionId: string): Promise<StoreSubscription | null> {
  const res = await fetch(`${appleBase()}/inApps/v1/subscriptions/${encodeURIComponent(originalTransactionId)}`, {
    headers: { Authorization: `Bearer ${await appleJwt()}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const last = data.data?.[0]?.lastTransactions?.find((t: any) => t.originalTransactionId === originalTransactionId);
  if (!last?.signedTransactionInfo) return null;
  const tx = decodeJwsPayload<AppleTransaction>(last.signedTransactionInfo);
  const renewal = last.signedRenewalInfo ? decodeJwsPayload<{ autoRenewStatus?: number }>(last.signedRenewalInfo) : {};
  return appleToSubscription(tx, { autoRenew: renewal.autoRenewStatus === 1, status: last.status ?? null });
}
