import { assertEquals, assertThrows } from 'jsr:@std/assert@1';

import {
  buildReportRequest,
  externalRef,
  microsToNumber,
  normalizePublisherId,
  parseFxRates,
  parseNetworkReport,
  ReportInputError,
  resolveRange,
} from './admob_report.ts';

// Shape from https://developers.google.com/admob/api/v1/reference/rest/v1/accounts.networkReport/generate
const STREAM = `[
  {"header": {"dateRange": {"startDate": {"year": 2026, "month": 9, "day": 1}, "endDate": {"year": 2026, "month": 9, "day": 2}},
              "localizationSettings": {"currencyCode": "USD", "languageCode": "en-US"}}},
  {"row": {"dimensionValues": {"DATE": {"value": "20260901"}}, "metricValues": {"ESTIMATED_EARNINGS": {"microsValue": "6500000"}}}},
  {"row": {"dimensionValues": {"DATE": {"value": "20260902"}}, "metricValues": {"ESTIMATED_EARNINGS": {"microsValue": 1250000}}}},
  {"row": {"dimensionValues": {"DATE": {"value": "20260902"}}, "metricValues": {"ESTIMATED_EARNINGS": {"microsValue": "9007199254740993"}}}},
  {"footer": {"matchingRowCount": "3"}}
]`;

Deno.test('parseNetworkReport sums micros exactly (strings and numbers) and groups by day', () => {
  const r = parseNetworkReport(JSON.parse(STREAM));
  assertEquals(r.currency, 'USD');
  assertEquals(r.rows, 3);
  assertEquals(r.matchingRowCount, 3);
  assertEquals(r.days, [
    { date: '2026-09-01', micros: 6500000n },
    { date: '2026-09-02', micros: 1250000n + 9007199254740993n },
  ]);
  assertEquals(r.grossMicros, 6500000n + 1250000n + 9007199254740993n);
});

Deno.test('parseNetworkReport handles empty reports, missing metrics and errors', () => {
  const empty = parseNetworkReport([{ header: { localizationSettings: { currencyCode: 'EUR' } } }, { footer: { matchingRowCount: '0' } }]);
  assertEquals([empty.currency, empty.grossMicros, empty.days.length], ['EUR', 0n, 0]);
  const noMetric = parseNetworkReport([{ header: { localizationSettings: { currencyCode: 'USD' } } }, { row: { dimensionValues: { DATE: { value: '20260901' } } } }]);
  assertEquals(noMetric.grossMicros, 0n);
  assertThrows(() => parseNetworkReport([{ row: {} }]), Error, 'moneda');
  assertThrows(() => parseNetworkReport([{ header: { localizationSettings: { currencyCode: 'USD' } } }, { error: { status: 'PERMISSION_DENIED', message: 'x' } }]), Error, 'PERMISSION_DENIED');
  assertThrows(() => parseNetworkReport([{ header: { localizationSettings: { currencyCode: 'USD' } } }, { row: { metricValues: { ESTIMATED_EARNINGS: { microsValue: '1.5' } } } }]));
  assertThrows(() => parseNetworkReport([null]));
});

Deno.test('resolveRange defaults to yesterday in the AdMob report time zone and validates input', () => {
  // 2026-09-24 05:00 UTC is still 2026-09-23 in Los Angeles → yesterday = 2026-09-22.
  assertEquals(resolveRange(null, null, new Date('2026-09-24T05:00:00Z')), { start: '2026-09-22', end: '2026-09-22' });
  assertEquals(resolveRange(null, null, new Date('2026-09-24T12:00:00Z')), { start: '2026-09-23', end: '2026-09-23' });
  const now = new Date('2026-09-24T12:00:00Z');
  assertEquals(resolveRange('2026-09-01', '2026-09-23', now), { start: '2026-09-01', end: '2026-09-23' });
  assertEquals(resolveRange('2026-09-10', null, now), { start: '2026-09-10', end: '2026-09-10' });
  for (const [s, e] of [['2026-09-31', null], ['2026-09-10', '2026-09-01'], ['2026-09-20', '2026-09-24'], ['2026-01-01', '2026-06-30'], ['20260901', null]]) {
    assertThrows(() => resolveRange(s, e, now), ReportInputError);
  }
});

Deno.test('buildReportRequest, publisher id and external ref', () => {
  assertEquals(buildReportRequest('2026-09-01', '2026-09-30'), {
    reportSpec: {
      dateRange: { startDate: { year: 2026, month: 9, day: 1 }, endDate: { year: 2026, month: 9, day: 30 } },
      dimensions: ['DATE'],
      metrics: ['ESTIMATED_EARNINGS'],
    },
  });
  assertEquals(normalizePublisherId('pub-1234567890123456'), 'pub-1234567890123456');
  assertEquals(normalizePublisherId(' 1234567890123456 '), 'pub-1234567890123456');
  assertThrows(() => normalizePublisherId('ca-app-pub-123~456'));
  assertEquals(externalRef('pub-1', '2026-09-01', '2026-09-01'), 'admob:pub-1:2026-09-01:2026-09-01');
});

Deno.test('parseFxRates and microsToNumber', () => {
  assertEquals(parseFxRates('{"PYG":7300,"ARS":1150.5,"BRL":5.4}'), { PYG: 7300, ARS: 1150.5, BRL: 5.4 });
  for (const bad of [undefined, '', 'nope', '[]', '{}', '{"PYG":0}', '{"PYG":"7300"}', '{"pyg":1}']) assertThrows(() => parseFxRates(bad));
  assertEquals(microsToNumber(6500000n), 6500000);
  assertThrows(() => microsToNumber(2n ** 60n));
});
