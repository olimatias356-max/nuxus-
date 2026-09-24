// AdMob rewarded-ad Server-Side Verification callback (public GET, verify_jwt = false).
// Configure in AdMob → ad unit → Server-side verification:
//   https://<project>.supabase.co/functions/v1/admob-ssv
// The app sets SSV options userId = Supabase user id and customData = post id.
// Trust comes only from Google's ECDSA signature; see ../_shared/admob_ssv.ts.
import { handler, json } from '../_shared/http.ts';
import { handleSsvRequest, SSV_KEYS_URL, SsvKeyStore } from '../_shared/admob_ssv.ts';
import { adminClient } from '../_shared/supabase.ts';

const keys = new SsvKeyStore(async () => {
  const res = await fetch(SSV_KEYS_URL, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`verifier-keys ${res.status}`);
  return await res.json();
});

Deno.serve(
  handler(
    async (req) => {
      const url = req.url;
      const q = url.indexOf('?');
      const { status, body } = await handleSsvRequest(q === -1 ? '' : url.slice(q + 1), {
        getKey: (id) => keys.get(id),
        record: async (r) => {
          const { data, error, status } = await adminClient().rpc('svc_record_ssv_reward', {
            p_transaction_id: r.transactionId,
            p_user: r.userId,
            p_post: r.postId,
            p_ad_unit: r.adUnit,
            p_reward_item: r.rewardItem,
            p_reward_amount: r.rewardAmount,
            p_timestamp_ms: r.timestampMs,
          });
          if (!error) return { id: (data as string | null) ?? null };
          // Deterministic data errors (unknown user, deleted post…) will not succeed on retry: answer 200.
          // PostgREST/infra errors (missing function, DB down) → throw so Google retries later.
          if (!status || status >= 500 || String(error.code ?? '').startsWith('PGRST')) throw new Error(`${error.code}: ${error.message}`);
          console.warn('admob-ssv: reward not recorded', error.code);
          return { id: null, ignored: String(error.code ?? 'rejected') };
        },
      });
      return json(body, status);
    },
    { methods: ['GET', 'HEAD'] },
  ),
);
