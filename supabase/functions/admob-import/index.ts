// Imports real AdMob earnings (service role only; call daily from pg_cron + pg_net).
//   POST /admob-import                               → yesterday (AdMob report time zone)
//   POST /admob-import?start=YYYY-MM-DD&end=YYYY-MM-DD
//   POST /admob-import?dry_run=1                      → parsed totals, nothing is written
//   POST /admob-import?release=<import uuid>          → PENDING → AVAILABLE once AdMob has paid (21–26)
// Distribution among creators, the revenue share and idempotency live in svc_import_ad_revenue.
import {
  buildReportRequest,
  externalRef,
  microsToNumber,
  normalizePublisherId,
  parseFxRates,
  parseNetworkReport,
  ReportInputError,
  resolveRange,
} from '../_shared/admob_report.ts';
import { handler, HttpError, json } from '../_shared/http.ts';
import { adminClient, requireServiceRole, rpc } from '../_shared/supabase.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new HttpError(500, `${name} no configurado`);
  return v;
}

async function googleAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: env('ADMOB_CLIENT_ID'),
      client_secret: env('ADMOB_CLIENT_SECRET'),
      refresh_token: env('ADMOB_REFRESH_TOKEN'),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!res.ok || !body.access_token) {
    console.error('admob-import: token error', res.status, body.error ?? '');
    throw new HttpError(502, 'No se pudo autenticar con AdMob');
  }
  return body.access_token;
}

Deno.serve(
  handler(async (req) => {
    requireServiceRole(req);
    const params = new URL(req.url).searchParams;

    const release = params.get('release');
    if (release !== null) {
      if (!UUID.test(release)) throw new HttpError(400, 'release debe ser el id de la importación');
      const released = await rpc<number>('svc_release_ad_revenue', { p_import: release });
      return json({ import_id: release, released });
    }

    let range;
    try {
      range = resolveRange(params.get('start'), params.get('end'), new Date());
    } catch (e) {
      if (e instanceof ReportInputError) throw new HttpError(400, e.message);
      throw e;
    }
    const dryRun = ['1', 'true', 'yes'].includes((params.get('dry_run') ?? '').toLowerCase());
    let publisher: string;
    try {
      publisher = normalizePublisherId(env('ADMOB_PUBLISHER_ID'));
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(500, (e as Error).message);
    }

    const token = await googleAccessToken();
    const res = await fetch(`https://admob.googleapis.com/v1/accounts/${publisher}/networkReport:generate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildReportRequest(range.start, range.end)),
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || payload === null) {
      const err = (payload as { error?: { status?: string } } | null)?.error?.status ?? '';
      console.error('admob-import: report error', res.status, err);
      throw new HttpError(502, `AdMob API respondió ${res.status}`);
    }
    let report;
    try {
      report = parseNetworkReport(payload);
    } catch (e) {
      throw new HttpError(502, (e as Error).message);
    }

    const ref = externalRef(publisher, range.start, range.end);
    const summary = {
      period_start: range.start,
      period_end: range.end,
      currency: report.currency,
      gross_micros: microsToNumber(report.grossMicros),
      days: report.days.map((d) => ({ date: d.date, micros: microsToNumber(d.micros) })),
      external_ref: ref,
    };
    let fx: Record<string, number>;
    try {
      fx = parseFxRates(Deno.env.get('FX_RATES_JSON'));
    } catch (e) {
      if (dryRun) return json({ dry_run: true, ...summary, fx_rates: null, fx_error: (e as Error).message });
      throw new HttpError(500, (e as Error).message);
    }
    if (dryRun) return json({ dry_run: true, ...summary, fx_rates: fx });
    if (report.grossMicros <= 0n) return json({ imported: false, reason: 'no_earnings', ...summary });

    const { data, error } = await adminClient().rpc('svc_import_ad_revenue', {
      p_period_start: range.start,
      p_period_end: range.end,
      p_gross_micros: summary.gross_micros,
      p_currency: report.currency,
      p_fx_rates: fx,
      p_external_ref: ref,
    });
    if (error) {
      if (error.code === '23505' || error.code === 'PT409') return json({ imported: false, reason: 'already_imported', ...summary });
      console.error('admob-import: svc_import_ad_revenue failed', error.code, error.message);
      throw new HttpError(error.code === 'PT404' ? 404 : 400, error.message);
    }
    return json({ imported: true, import_id: data, ...summary, fx_rates: fx });
  }),
);
