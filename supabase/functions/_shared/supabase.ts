import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

import { safeEqual } from './crypto.ts';
import { HttpError } from './http.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/** For cron / internal jobs: the caller must send `Authorization: Bearer <service role key>`. */
export function requireServiceRole(req: Request): void {
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!serviceKey || !bearer || !safeEqual(bearer, serviceKey)) throw new HttpError(401, 'unauthorized');
}

/** Service-role client: bypasses RLS. Only use after validating the caller. */
export function adminClient(): SupabaseClient {
  if (!url || !serviceKey) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no configurados');
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Validates the caller's JWT with the Auth server and returns the user. */
export async function requireUser(req: Request): Promise<User> {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Iniciá sesión');
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Sesión inválida o vencida');
  return data.user;
}

export async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await adminClient().rpc(fn, args);
  if (error) {
    const status = error.code === 'PT409' ? 409 : error.code === 'PT403' ? 403 : error.code === 'PT404' ? 404 : 400;
    throw new HttpError(status, error.message);
  }
  return data as T;
}
