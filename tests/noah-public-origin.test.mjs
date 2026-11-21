import test from 'node:test';
import assert from 'node:assert/strict';
import { noahPublicOrigin } from '../lib/noah-public-origin.ts';

test('Noah uses the public domain for absent, hostname and HTTPS settings', () => {
  for (const value of [undefined, '', 'avoado.si', 'https://avoado.si', 'https://avoado.si/']) {
    assert.equal(noahPublicOrigin(value), 'https://avoado.si');
  }
});

test('Noah refuses local origins, credentials and non-origin configuration', () => {
  for (const value of ['localhost:3110', 'https://localhost', 'https://127.0.0.1', 'https://[::1]',
    'http://avoado.si', 'https://user:pass@avoado.si', 'https://avoado.si/noah',
    'https://avoado.si?token=secret', 'https://avoado.si/#x', 'https://box.local', 'https://box.internal',
    'https://0x7f000001', 'https://2130706433']) assert.throws(() => noahPublicOrigin(value));
});
