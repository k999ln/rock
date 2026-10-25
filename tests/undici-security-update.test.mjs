import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { fetch } from 'undici';

const body = 'synthetic integrity fixture';
const url = `data:text/plain,${encodeURIComponent(body)}`;
const digest = (algorithm, value) => createHash(algorithm).update(value).digest('base64');

// GHSA-f72v-6w45-q472: algorithm casing must not bypass integrity checks.
void test('undici rejects a mismatched integrity digest for every supported algorithm casing', async () => {
  for (const algorithm of ['sha256', 'sha384', 'sha512']) {
    for (const token of [algorithm, algorithm.toUpperCase(), `Sha${algorithm.slice(3)}`]) {
      await assert.rejects(
        fetch(url, { integrity: `${token}-${digest(algorithm, 'different fixture')}` }),
        (error) => error.cause?.message === 'integrity mismatch',
        token,
      );
    }
  }
});

void test('undici accepts matching integrity digests regardless of algorithm casing', async () => {
  for (const algorithm of ['sha256', 'sha384', 'sha512']) {
    for (const token of [algorithm, algorithm.toUpperCase(), `Sha${algorithm.slice(3)}`]) {
      const response = await fetch(url, { integrity: `${token}-${digest(algorithm, body)}` });
      assert.equal(await response.text(), body, token);
    }
  }
});
