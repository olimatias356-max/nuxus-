import { assertEquals } from 'jsr:@std/assert@1';

import { addDays, daysBetween, isYmd, localYmd, paraguayYmd, payoutWindow } from './dates.ts';

Deno.test('isYmd / addDays / daysBetween', () => {
  assertEquals([isYmd('2026-02-28'), isYmd('2028-02-29'), isYmd('2026-02-29'), isYmd('2026-9-1'), isYmd(20260901)], [true, true, false, false, false]);
  assertEquals(addDays('2026-03-01', -1), '2026-02-28');
  assertEquals(addDays('2026-12-31', 1), '2027-01-01');
  assertEquals(daysBetween('2026-09-01', '2026-09-30'), 29);
});

Deno.test('localYmd follows the time zone', () => {
  const t = new Date('2026-09-21T02:00:00Z');
  assertEquals(localYmd(t, 'UTC'), '2026-09-21');
  assertEquals(localYmd(t, 'America/Asuncion'), '2026-09-20');
});

// Paraguay moved to permanent UTC-3 in Oct 2024 (previously UTC-4 in winter): fixed offset, no tzdata.
Deno.test('paraguayYmd uses UTC-3 all year', () => {
  assertEquals(paraguayYmd(new Date('2026-07-21T02:59:00Z')), '2026-07-20');
  assertEquals(paraguayYmd(new Date('2026-07-21T03:00:00Z')), '2026-07-21');
  assertEquals(paraguayYmd(new Date('2027-01-01T02:00:00Z')), '2026-12-31');
});

Deno.test('payoutWindow: open on days 21–26 in Paraguay time only', () => {
  const at = (iso: string) => payoutWindow(new Date(iso));
  assertEquals(at('2026-09-20T12:00:00Z'), { open: false, date: '2026-09-20' });
  assertEquals(at('2026-09-21T01:00:00Z'), { open: false, date: '2026-09-20' }); // UTC already says 21
  assertEquals(at('2026-09-21T12:00:00Z'), { open: true, date: '2026-09-21' });
  assertEquals(at('2026-09-26T23:30:00Z'), { open: true, date: '2026-09-26' });
  assertEquals(at('2026-09-27T02:00:00Z'), { open: true, date: '2026-09-26' }); // UTC says 27, Asunción still 26
  assertEquals(at('2026-09-27T12:00:00Z'), { open: false, date: '2026-09-27' });
  assertEquals(at('2026-02-21T12:00:00Z').open, true);
  assertEquals(at('2026-12-31T12:00:00Z').open, false);
  assertEquals(payoutWindow(new Date('2026-09-20T12:00:00Z'), { startDay: 20, endDay: 20 }).open, true);
});
