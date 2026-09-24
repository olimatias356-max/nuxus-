// Calendar helpers. Dates are plain `YYYY-MM-DD` strings (no time zone).

/** Paraguay has used UTC-3 all year since October 2024; a fixed offset avoids stale tzdata (old DST rules). */
export const PAYOUT_UTC_OFFSET_HOURS = -3;
/** Payout window (days of month, inclusive). Mirrors `payout.window_start_day` / `payout.window_end_day`; the SQL enforces it too. */
export const PAYOUT_WINDOW = { startDay: 21, endDay: 26 } as const;

export function isYmd(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Calendar date at `now` in the given IANA time zone. */
export function localYmd(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Calendar date at `now` in Paraguay (UTC-3). */
export function paraguayYmd(now: Date): string {
  return new Date(now.getTime() + PAYOUT_UTC_OFFSET_HOURS * 3_600_000).toISOString().slice(0, 10);
}

/** Whether payouts may be sent at `now` (days 21–26 in Paraguay time). */
export function payoutWindow(now: Date, window: { startDay: number; endDay: number } = PAYOUT_WINDOW) {
  const date = paraguayYmd(now);
  const day = Number(date.slice(8, 10));
  return { open: day >= window.startDay && day <= window.endDay, date };
}
