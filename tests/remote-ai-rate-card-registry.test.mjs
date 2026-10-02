import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import {
  trustedRemoteAiRateCardKeyResolver,
} from '../lib/remote-ai-rate-card-registry.ts';

const { publicKey } = generateKeyPairSync('ed25519');
const publicKeyHex = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');

void test('resolves only exact active trusted provider keys and rejects ambiguous config', async () => {
  const entries = [{ providerId: 'openai', keyId: 'key-1', publicKeyHex, status: 'active' }];
  const resolve = trustedRemoteAiRateCardKeyResolver(JSON.stringify(entries));
  assert.deepEqual(await resolve({ providerId: 'openai', keyId: 'key-1' }),
    Uint8Array.from(Buffer.from(publicKeyHex, 'hex')));
  assert.equal(await resolve({ providerId: 'other', keyId: 'key-1' }), null);
  assert.equal(await trustedRemoteAiRateCardKeyResolver(JSON.stringify([
    { ...entries[0], status: 'revoked' },
  ]))({ providerId: 'openai', keyId: 'key-1' }), null);
  assert.equal(await trustedRemoteAiRateCardKeyResolver(JSON.stringify([
    entries[0], entries[0],
  ]))({ providerId: 'openai', keyId: 'key-1' }), null);
  assert.equal(await trustedRemoteAiRateCardKeyResolver(`"${'x'.repeat(5_001)}"`)({
    providerId: 'openai', keyId: 'key-1',
  }), null);
});
