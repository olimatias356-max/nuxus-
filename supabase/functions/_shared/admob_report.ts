// AdMob API network report helpers (pure).
// https://developers.google.com/admob/api/v1/reference/rest/v1/accounts.networkReport/generate
import { addDays, daysBetween, isYmd, localYmd } from './dates.ts';

/** AdMob reports use the account time zone; the API only accepts America/Los_Angeles today. */
export const ADMOB_REPORT_TIME_ZONE = 'America/Los_Angeles';
export const MAX_RANGE_DAYS = 93;

export class ReportInputError extends Error {}

/** Default = yesterday (report time zone). Custom ranges must be complete days in the past. */
export function resolveRange(start: string | null, end: string | null, now: Date): { start: string; end: string } {
  const today = localYmd(now, ADMOB_REPORT_TIME_ZONE);
  const s = start || end || addDays(today, -1);
  const e = end || s;
  if (!isYmd(s) || !isYmd(e)) throw new ReportInputError('Fechas inválidas (YYYY-MM-DD)');
  if (s > e) throw new ReportInputError('start debe ser anterior o igual a end');
  if (e >= today) throw new ReportInputError('Solo se pueden importar días completos (end < hoy)');
  if (daysBetween(s, e) + 1 > MAX_RANGE_DAYS) throw new ReportInputError(`Rango máximo: ${MAX_RANGE_DAYS} días`);
  return { start: s, end: e };
}

const ymdToDate = (ymd: string) => ({ year: Number(ymd.slice(0, 4)), month: Number(ymd.slice(5, 7)), day: Number(ymd.slice(8, 10)) });

export function buildReportRequest(start: string, end: string) {
  return {
    reportSpec: {
      dateRange: { startDate: ymdToDate(start), endDate: ymdToDate(end) },
      dimensions: ['DATE'],
      metrics: ['ESTIMATED_EARNINGS'],
    },
  };
}

export function normalizePublisherId(raw: string): string {
  const id = raw.trim().replace(/^pub-/, '');
  if (!/^\d{10,20}$/.test(id)) throw new Error('ADMOB_PUBLISHER_ID inválido (pub-XXXXXXXXXXXXXXXX)');
  return `pub-${id}`;
}

export function externalRef(publisherId: string, start: string, end: string): string {
  return `admob:${publisherId}:${start}:${end}`;
}

export type ParsedReport = {
  currency: string;
  grossMicros: bigint;
  days: Array<{ date: string; micros: bigint }>;
  rows: number;
  matchingRowCount: number | null;
};

type Msg = {
  header?: { localizationSettings?: { currencyCode?: string } };
  row?: { dimensionValues?: { DATE?: { value?: string } }; metricValues?: { ESTIMATED_EARNINGS?: { microsValue?: string | number } } };
  footer?: { matchingRowCount?: string | number };
  error?: { message?: string; status?: string };
};

/**
 * Parses the streamed response (a JSON array of `{header}`, `{row}`…, `{footer}` messages).
 * int64 values arrive as strings in proto3 JSON; both strings and numbers are accepted.
 */
export function parseNetworkReport(body: unknown): ParsedReport {
  const msgs = (Array.isArray(body) ? body : [body]) as Msg[];
  let currency = '';
  let matchingRowCount: number | null = null;
  const byDay = new Map<string, bigint>();
  let rows = 0;
  for (const m of msgs) {
    if (!m || typeof m !== 'object') throw new Error('Reporte de AdMob inválido');
    if (m.error) throw new Error(`AdMob: ${m.error.status ?? ''} ${m.error.message ?? ''}`.trim());
    if (m.header) currency = m.header.localizationSettings?.currencyCode ?? currency;
    if (m.footer?.matchingRowCount !== undefined) matchingRowCount = Number(m.footer.matchingRowCount);
    if (m.row) {
      rows++;
      const raw = m.row.metricValues?.ESTIMATED_EARNINGS?.microsValue ?? 0;
      const micros = typeof raw === 'number' ? BigInt(Math.round(raw)) : /^-?\d+$/.test(String(raw)) ? BigInt(String(raw)) : null;
      if (micros === null) throw new Error('ESTIMATED_EARNINGS inválido en el reporte');
      const v = m.row.dimensionValues?.DATE?.value ?? '';
      const date = /^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : 'unknown';
      byDay.set(date, (byDay.get(date) ?? 0n) + micros);
    }
  }
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('El reporte de AdMob no trae la moneda (localizationSettings.currencyCode)');
  const days = [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, micros]) => ({ date, micros }));
  const grossMicros = days.reduce((sum, d) => sum + d.micros, 0n);
  return { currency, grossMicros, days, rows, matchingRowCount };
}

/** FX_RATES_JSON: flat object of creator currency → units per 1 unit of the report currency, e.g. {"PYG":7300,"ARS":1150,"BRL":5.4}. */
export function parseFxRates(raw: string | undefined): Record<string, number> {
  if (!raw) throw new Error('FX_RATES_JSON no configurado');
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error('FX_RATES_JSON no es JSON válido');
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('FX_RATES_JSON debe ser un objeto');
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!/^[A-Z]{3}$/.test(k) || typeof v !== 'number' || !Number.isFinite(v) || v <= 0) throw new Error(`FX_RATES_JSON: tasa inválida para ${k}`);
    out[k] = v;
  }
  if (!Object.keys(out).length) throw new Error('FX_RATES_JSON vacío');
  return out;
}

/** bigint → JSON-safe number (throws if it would lose precision). */
export function microsToNumber(v: bigint): number {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new Error('Monto fuera de rango');
  return n;
}
