// Public runtime configuration. Only public values belong here: the Supabase
// URL and the publishable (anon) key are designed to ship inside the app;
// data is protected by Row Level Security on the server. Never put the
// service role key or any other secret in EXPO_PUBLIC_* variables.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';

/** `store` = Google Play Billing / StoreKit; `sandbox` = server-side test purchases (development only). */
const billingMode = process.env.EXPO_PUBLIC_BILLING_MODE === 'sandbox' ? 'sandbox' : 'store';

export const env = {
  supabaseUrl: supabaseUrl.replace(/\/+$/, ''),
  supabaseKey,
  billingMode,
  termsVersion: '2026-09',
} as const;

export const isConfigured = /^https?:\/\//.test(env.supabaseUrl) && env.supabaseKey.length > 20;
