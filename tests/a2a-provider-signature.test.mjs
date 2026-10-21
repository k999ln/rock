import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { verifyA2AProviderSignature } from '../lib/a2a-provider-signature.ts';

const pair = generateKeyPairSync('ed25519');
// An offset view catches accidental import of the entire underlying buffer.
const publicKey = pair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
const bytes = new TextEncoder().encode('synthetic-a2a-signature-boundary\0{}');
const signature = sign(null, bytes, pair.privateKey).toString('base64url');

void test('A2A signature verification preserves exact bytes and offset public key views', async () => {
  assert.equal(await verifyA2AProviderSignature(publicKey, { signature }, () => bytes), true);
  assert.equal(await verifyA2AProviderSignature(publicKey, { signature },
    () => new TextEncoder().encode('another-domain\0{}')), false);
  const other = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  assert.equal(await verifyA2AProviderSignature(other, { signature }, () => bytes), false);
});

void test('A2A rejects noncanonical signatures before generating contract signing bytes', async () => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const alternate = signature.slice(0, -1) + alphabet[alphabet.indexOf(signature.at(-1)) + 1];
  assert.deepEqual(Buffer.from(alternate, 'base64url'), Buffer.from(signature, 'base64url'),
    'the rejected form differs only in unused base64 padding bits');
  for (const value of [alternate, `${signature}==`, signature.slice(0, -2), '!'.repeat(86)]) {
    let generated = 0;
    assert.equal(await verifyA2AProviderSignature(publicKey, { signature: value },
      () => { generated++; return bytes; }), false);
    assert.equal(generated, 0, 'noncanonical signature must not reach byte generation');
  }
});

void test('A2A key import and signing-byte failures remain false results', async () => {
  let generated = 0;
  assert.equal(await verifyA2AProviderSignature(publicKey.subarray(1), { signature },
    () => { generated++; return bytes; }), false);
  assert.equal(generated, 0);
  assert.equal(await verifyA2AProviderSignature(publicKey, { signature },
    () => { generated++; throw Error('synthetic serialization failure'); }), false);
  assert.equal(generated, 1);
});
