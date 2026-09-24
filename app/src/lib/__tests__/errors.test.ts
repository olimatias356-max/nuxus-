/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { errorMessage } from '../errors.ts';

test('maps auth errors to Spanish', () => {
  assert.equal(errorMessage({ message: 'Invalid login credentials' }), 'Email o contraseña incorrectos.');
  assert.match(errorMessage({ message: 'Database error saving new user' }), /No pudimos crear la cuenta/);
  assert.match(errorMessage({ message: 'Failed to fetch' }), /Sin conexión/);
});

test('shows server validation messages but hides internals', () => {
  assert.equal(errorMessage({ code: 'PT409', message: 'Ya tenés un retiro en proceso' }), 'Ya tenés un retiro en proceso');
  assert.equal(errorMessage({ code: '42501', message: 'new row violates row-level security policy for table "posts"' }), 'No tenés permiso para hacer esto.');
  assert.equal(errorMessage({ message: 'relation "private.secrets" does not exist' }), 'Algo salió mal. Probá de nuevo.');
});
