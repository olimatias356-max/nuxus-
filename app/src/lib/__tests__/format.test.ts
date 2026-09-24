/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatCount, formatDuration, formatMoney, initials, timeAgo } from '../format.ts';

test('formats guaraníes without decimals', () => {
  assert.equal(formatMoney(100000, 'PYG'), '100.000 Gs');
  assert.equal(formatMoney(0, 'PYG'), '0 Gs');
  assert.equal(formatMoney(1234567, 'PYG'), '1.234.567 Gs');
});

test('formats pesos and reales from minor units', () => {
  assert.equal(formatMoney(1500000, 'ARS'), '$ 15.000,00');
  assert.equal(formatMoney(6990, 'BRL'), 'R$ 69,90');
  assert.equal(formatMoney(-2505, 'BRL'), '−R$ 25,05');
});

test('compacts counts', () => {
  assert.equal(formatCount(999), '999');
  assert.equal(formatCount(1200), '1,2K');
  assert.equal(formatCount(21900), '22K');
  assert.equal(formatCount(3_400_000), '3,4M');
});

test('relative times in Spanish', () => {
  const now = Date.parse('2026-09-24T12:00:00Z');
  assert.equal(timeAgo('2026-09-24T11:59:40Z', now), 'ahora');
  assert.equal(timeAgo('2026-09-24T11:45:00Z', now), 'hace 15 min');
  assert.equal(timeAgo('2026-09-24T09:00:00Z', now), 'hace 3 h');
  assert.equal(timeAgo('2026-09-22T12:00:00Z', now), 'hace 2 d');
});

test('durations and initials', () => {
  assert.equal(formatDuration(65_000), '1:05');
  assert.equal(formatDuration(null), '0:00');
  assert.equal(initials('Lucía Benítez'), 'LB');
  assert.equal(initials('dona.rosa'), 'DR');
  assert.equal(initials('x'), 'X');
});
