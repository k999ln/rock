import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  signEsimCloudRequest, parseEsimCloudProof, verifyEsimCloudProof,
  esimCloudProofAuthorization, esimCloudProofSigningBytes,
} from '../lib/esim-cloud-proof.ts';
import { requestUsesEsimCloudIdentity } from '../lib/request-auth.ts';

const accessKeyId = randomUUID();
const now = Date.now();
const url = 'https://rock.test/api/work-jobs?view=mine';
const request = () => new Request(url, { method: 'POST', body: '{"title":"private text"}' });
function keys(algorithm) {
  const pair = algorithm === 'ES256' ? generateKeyPairSync('ec', { namedCurve: 'prime256v1' }) : generateKeyPairSync('ed25519');
  const jwk = pair.publicKey.export({ format: 'jwk' });
  const publicKey = algorithm === 'ES256'
    ? Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')])
    : Buffer.from(jwk.x, 'base64url');
  return { key: { algorithm, publicKey }, signer: async (bytes) => sign(algorithm === 'ES256' ? 'sha256' : null,
    bytes, { key: pair.privateKey, dsaEncoding: 'ieee-p1363' }) };
}

for (const algorithm of ['ES256', 'Ed25519']) {
  void test(`${algorithm}: client signs requests without exporting keys; server verifies and leaves body readable`, async () => {
    const { key, signer } = keys(algorithm);
    const signed = await signEsimCloudRequest(request(), accessKeyId, algorithm, signer, now);
    const proof = parseEsimCloudProof(signed.headers.get('authorization'));
    assert.ok(proof);
    assert.equal(signed.redirect, 'error');
    assert.equal(await verifyEsimCloudProof(signed, proof, key, now), true);
    assert.deepEqual(await signed.json(), { title: 'private text' });
    assert.equal(JSON.stringify(proof).includes('private text'), false);
    const second = await signEsimCloudRequest(request(), accessKeyId, algorithm, signer, now);
    assert.notEqual(parseEsimCloudProof(second.headers.get('authorization')).requestId, proof.requestId);
  });
}

void test('signed requests bind the origin, query, path, method, body and service key', async () => {
  const { key, signer } = keys('ES256');
  const signed = await signEsimCloudRequest(request(), accessKeyId, 'ES256', signer, now);
  const proof = parseEsimCloudProof(signed.headers.get('authorization'));
  for (const changed of [new Request(url), new Request(url, { method: 'POST', body: '{"title":"attacker"}' }),
    new Request(url.replace('rock.test', 'other.test'), { method: 'POST', body: '{"title":"private text"}' }),
    new Request(url.replace('mine', 'all'), { method: 'POST', body: '{"title":"private text"}' }),
    new Request(url.replace('work-jobs', 'admin'), { method: 'POST', body: '{"title":"private text"}' })])
    assert.equal(await verifyEsimCloudProof(changed, proof, key, now), false);
  assert.equal(await verifyEsimCloudProof(signed, { ...proof, accessKeyId: randomUUID() }, key, now), false);
  assert.equal(await verifyEsimCloudProof(signed, proof, keys('ES256').key, now), false);
  assert.equal(await verifyEsimCloudProof(signed, proof, keys('Ed25519').key, now), false);
});

void test('time window, TLS, body bound and exact proof encoding fail closed', async () => {
  const { key, signer } = keys('ES256');
  const signed = await signEsimCloudRequest(request(), accessKeyId, 'ES256', signer, now);
  const proof = parseEsimCloudProof(signed.headers.get('authorization'));
  for (const patch of [{ issuedAt: now + 5001 }, { expiresAt: now }, { expiresAt: now + 60001 },
    { expiresAt: now - 1, issuedAt: now - 1000 }]) {
    const modified = { ...proof, ...patch };
    modified.signature = Buffer.from(await signer(esimCloudProofSigningBytes(modified))).toString('base64url');
    assert.equal(await verifyEsimCloudProof(signed, modified, key, now), false);
  }
  for (const header of [null, '', 'RockEsimProof not-json', signed.headers.get('authorization') + '=',
    'RockEsimProof ' + 'a'.repeat(8192), esimCloudProofAuthorization({ ...proof, extra: true }),
    esimCloudProofAuthorization({ ...proof, issuedAt: -1 }), esimCloudProofAuthorization({ ...proof, signature: 'bad' })])
    assert.equal(parseEsimCloudProof(header), null);
  await assert.rejects(signEsimCloudRequest(new Request('http://rock.test/api/work-jobs'), accessKeyId, 'ES256', signer), /HTTPS_REQUIRED/);
  await assert.rejects(signEsimCloudRequest(new Request('https://rock.test/api/work-jobs#fragment'), accessKeyId, 'ES256', signer), /HTTPS_REQUIRED/);
  await assert.rejects(signEsimCloudRequest(new Request(url, { method: 'POST', body: 'a'.repeat(1_048_577) }), accessKeyId, 'ES256', signer), /UNAUTHORIZED/);
});

void test('explicit proof authentication cannot fall back to a cookie or broader account identity', () => {
  const req = new Request(url, { headers: { Authorization: 'RockEsimProof malformed', 'oai-authenticated-user-id': 'other-owner' } });
  assert.equal(requestUsesEsimCloudIdentity(req), true);
});
