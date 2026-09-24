// Deletes the caller's account (App Store / Google Play requirement).
// Removes their files, then the auth user; database rows cascade. Financial
// ledger rows and audit logs are retained (pseudonymous) as required by law.
import { handler, HttpError, json, readJson } from '../_shared/http.ts';
import { adminClient, requireUser, rpc } from '../_shared/supabase.ts';

async function removeFolder(bucket: string, folder: string) {
  const storage = adminClient().storage.from(bucket);
  for (let round = 0; round < 50; round++) {
    const { data, error } = await storage.list(folder, { limit: 100 });
    if (error || !data?.length) return;
    const paths = data.filter((f) => f.name).map((f) => `${folder}/${f.name}`);
    if (!paths.length) return;
    await storage.remove(paths);
  }
}

Deno.serve(
  handler(async (req) => {
    const user = await requireUser(req);
    const { confirm } = await readJson<{ confirm?: string }>(req);
    if (confirm !== 'ELIMINAR') throw new HttpError(400, 'Confirmá escribiendo ELIMINAR');

    const db = adminClient();
    const { count } = await db.from('payouts').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'PROCESSING');
    if ((count ?? 0) > 0) throw new HttpError(409, 'Tenés un retiro en proceso. Esperá a que termine para eliminar la cuenta.');

    await rpc('svc_audit', { p_action: 'account.delete', p_target_table: 'auth.users', p_target_id: user.id, p_details: {} });
    for (const bucket of ['media', 'avatars', 'kyc']) await removeFolder(bucket, user.id);

    const { error } = await db.auth.admin.deleteUser(user.id);
    if (error) throw new HttpError(500, 'No pudimos eliminar la cuenta. Contactá a soporte.');
    return json({ deleted: true });
  }),
);
