// Scheduled maintenance (call hourly with the service role key, e.g. pg_cron + pg_net):
// expires stories, trims rate-limit/view logs, runs the anti-fraud checks and deletes orphaned uploads.
// Each step runs even if another fails; any failure answers 500 with the partial results.
import { handler, json } from '../_shared/http.ts';
import { adminClient, requireServiceRole, rpc } from '../_shared/supabase.ts';

Deno.serve(
  handler(async (req) => {
    requireServiceRole(req);

    const errors: Record<string, string> = {};
    const step = async <T>(name: string, fn: () => Promise<T>): Promise<T | null> => {
      try {
        return await fn();
      } catch (e) {
        console.error(`maintenance: ${name} failed`, e);
        errors[name] = e instanceof Error ? e.message : String(e);
        return null;
      }
    };

    const cleanup = await step('cleanup', () => rpc('svc_cleanup', {}));
    const fraud = await step('fraud_checks', () => rpc<Record<string, unknown>>('svc_run_fraud_checks', {}));
    const removed = await step('orphans', async () => {
      const orphans = await rpc<Array<{ bucket_id: string; name: string }>>('svc_orphan_objects', { p_limit: 500 });
      const byBucket = new Map<string, string[]>();
      for (const o of orphans ?? []) byBucket.set(o.bucket_id, [...(byBucket.get(o.bucket_id) ?? []), o.name]);
      let n = 0;
      for (const [bucket, names] of byBucket) {
        const { data } = await adminClient().storage.from(bucket).remove(names);
        n += data?.length ?? 0;
      }
      return n;
    });

    const failed = Object.keys(errors).length > 0;
    return json({ cleanup, fraud_checks: fraud, orphans_removed: removed ?? 0, ...(failed ? { errors } : {}) }, failed ? 500 : 200);
  }),
);
