/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ageFrom, emailSchema, parseBirthDate, passwordSchema, usernameSchema } from '../validation.ts';

test('birth dates in DD/MM/AAAA', () => {
  assert.equal(parseBirthDate('12/05/1996'), '1996-05-12');
  assert.equal(parseBirthDate('1/2/2000'), '2000-02-01');
  assert.equal(parseBirthDate('31/02/2000'), null, 'impossible dates are rejected');
  assert.equal(parseBirthDate('2000-01-01'), null);
  assert.equal(parseBirthDate('01/01/2999'), null, 'future dates are rejected');
});

test('age is computed on the birthday', () => {
  const now = new Date(2026, 8, 24);
  assert.equal(ageFrom('2008-09-24', now), 18);
  assert.equal(ageFrom('2008-09-25', now), 17);
});

test('usernames follow the server rules', () => {
  for (const ok of ['lucia.py', 'dona_rosa', 'abc']) assert.ok(usernameSchema.safeParse(ok).success, ok);
  for (const bad of ['ab', '.lucia', 'lucia.', 'lu..cia', 'lucía', 'con espacio', 'a'.repeat(25)]) {
    assert.ok(!usernameSchema.safeParse(bad).success, bad);
  }
});

test('passwords need length, cases and a digit', () => {
  assert.ok(passwordSchema.safeParse('Mbarete2026').success);
  for (const bad of ['short1A', 'sinnumeros', 'SINMINUS1', 'sinmayus1']) assert.ok(!passwordSchema.safeParse(bad).success, bad);
});

test('emails are normalised', () => {
  const r = emailSchema.safeParse('  Vos@Ejemplo.COM ');
  assert.ok(r.success);
  assert.equal(r.data, 'vos@ejemplo.com');
});
