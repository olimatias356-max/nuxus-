// Scheduled maintenance (call hourly with the service role key, e.g. pg_cron + pg_net):
// expires stories, trims rate-limit/view logs and deletes orphaned uploads.
import { fail, handler, json } from '../_shared/http.ts';
import { adminClient, rpc } from '../_shared/supabase.ts';
import { safeEqual } from '../_shared/crypto.ts';

Deno.serve(
  handler(async (req) => {
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const auth = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!key || !safeEqual(auth, key)) return fail(401, 'unauthorized');

    const cleanup = await rpc('svc_cleanup', {});
    const orphans = await rpc<Array<{ bucket_id: string; name: string }>>('svc_orphan_objects', { p_limit: 500 });
    const byBucket = new Map<string, string[]>();
    for (const o of orphans ?? []) byBucket.set(o.bucket_id, [...(byBucket.get(o.bucket_id) ?? []), o.name]);
    let removed = 0;
    for (const [bucket, names] of byBucket) {
      const { data } = await adminClient().storage.from(bucket).remove(names);
      removed += data?.length ?? 0;
    }
    return json({ cleanup, orphans_removed: removed });
  }),
);
