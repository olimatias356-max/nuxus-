// Sends requested withdrawals to dLocal (service role only; cron daily around midday, e.g. 15:00 UTC).
// Does nothing outside days 21–26 (America/Asuncion). For each due payout:
//   create at dLocal (external_id = payout id) → svc_mark_payout_sent → the final result arrives
//   at payout-webhook?provider=dlocal. Definitive rejections → svc_complete_payout(FAILED), which
//   returns the balance to AVAILABLE. Beneficiary data is decrypted by svc_payouts_due and never logged.
import { payoutWindow } from '../_shared/dates.ts';
import { DLOCAL_DEFAULT_PAYOUTS_PATH, type DlocalCredentials, type DuePayout, type PayoutOutcome, processPayout } from '../_shared/dlocal.ts';
import { handler, HttpError, json } from '../_shared/http.ts';
import { requireServiceRole, rpc } from '../_shared/supabase.ts';

type Outcome = PayoutOutcome | 'error';

function config() {
  const apiUrl = Deno.env.get('DLOCAL_API_URL') ?? '';
  const creds: DlocalCredentials = {
    login: Deno.env.get('DLOCAL_LOGIN') ?? '',
    transKey: Deno.env.get('DLOCAL_TRANS_KEY') ?? '',
    secretKey: Deno.env.get('DLOCAL_SECRET_KEY') ?? '',
  };
  if (!/^https?:\/\//.test(apiUrl) || !creds.login || !creds.transKey || !creds.secretKey) {
    throw new HttpError(500, 'dLocal no configurado (DLOCAL_API_URL, DLOCAL_LOGIN, DLOCAL_TRANS_KEY, DLOCAL_SECRET_KEY)');
  }
  const endpoint = new URL(Deno.env.get('DLOCAL_PAYOUTS_PATH') || DLOCAL_DEFAULT_PAYOUTS_PATH, apiUrl).toString();
  const base = Deno.env.get('SUPABASE_URL') ?? '';
  const notificationUrl = Deno.env.get('DLOCAL_NOTIFICATION_URL') ||
    (base.startsWith('https://') ? `${base}/functions/v1/payout-webhook?provider=dlocal` : null);
  return { endpoint, creds, notificationUrl };
}

Deno.serve(
  handler(async (req) => {
    requireServiceRole(req);
    const window = payoutWindow(new Date());
    if (!window.open) return json({ skipped: 'outside_window', date: window.date });

    const cfg = config();
    const post = async (body: string, headers: Record<string, string>) => {
      const res = await fetch(cfg.endpoint, { method: 'POST', headers, body, signal: AbortSignal.timeout(20_000) });
      return { status: res.status, body: await res.json().catch(() => null) };
    };
    const due = (await rpc<DuePayout[]>('svc_payouts_due', { p_limit: 100 })) ?? [];
    const results: Array<{ payout_id: string; outcome: Outcome; detail?: string }> = [];
    for (const p of due) {
      let r: { outcome: Outcome; detail?: string };
      try {
        r = await processPayout(p, { creds: cfg.creds, notificationUrl: cfg.notificationUrl, post, rpc });
      } catch (e) {
        // A DB call failed after dLocal answered; the next run resends with the same external_id.
        r = { outcome: 'error', detail: e instanceof Error ? e.message.slice(0, 200) : 'error' };
      }
      results.push({ payout_id: p.payout_id, ...r });
      console.log('dlocal-payouts', p.payout_id, r.outcome, r.detail ?? '');
      if (r.outcome === 'halted') break;
    }
    const count = (o: Outcome) => results.filter((r) => r.outcome === o).length;
    return json({
      date: window.date,
      due: due.length,
      sent: count('sent'),
      paid: count('paid'),
      failed: count('failed'),
      retry: count('retry') + count('error'),
      halted: results.find((r) => r.outcome === 'halted')?.detail ?? null,
      results,
    });
  }),
);
