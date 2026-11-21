import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, test } from 'node:test';
import { exportSPKI, generateKeyPair, SignJWT } from 'jose';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { handleSimProof } from '../lib/sim-proof-http.ts';
import { verifySimProof } from '../lib/sim-proof.ts';

const imsi = '001010000000102';
const imei = '004400000000102';
const hashSecret = 'synthetic-sim-proof-hmac-key-102';
const kid = 'synthetic-key-x509.pem';
const now = Math.floor(Date.now() / 1_000) * 1_000;
const issuedAt = now - 10_000;
const expiresAt = now + 120_000;
const key = await generateKeyPair('RS256', { extractable: true });
const otherKey = await generateKeyPair('RS256');
const publicPem = await exportSPKI(key.publicKey);
const options = { publicKeys: new Map([[kid, publicPem]]), hashSecret, now, maxAgeMs: 600_000 };

const worker = new Miniflare(convertV4MiniflareOptions({
  modules: true,
  script: 'export default { fetch() { return new Response("SIM proof fixture") } }',
  compatibilityDate: '2026-08-18',
  d1Databases: ['DB'], host: '127.0.0.1', port: 0,
}));
after(() => worker.dispose());
const db = await worker.getD1Database('DB');
const migration = readFileSync(new URL('../drizzle/0054_sim_bindings.sql', import.meta.url), 'utf8');
assert.equal(migration, readFileSync(new URL('../drizzle-main/0054_sim_bindings.sql', import.meta.url), 'utf8'));
for (const sql of migration.split('--> statement-breakpoint')) await db.prepare(sql).run();

function endorse({ imsiValue = imsi, imeiValue = imei, claims = {}, signingKey = key.privateKey, keyId = kid } = {}) {
  return new SignJWT({
    iss: 'https://soracom.io',
    aud: 'soracom-endorse-audience',
    sub: 'soracom-endorse',
    iat: issuedAt / 1_000,
    nbf: issuedAt / 1_000,
    exp: expiresAt / 1_000,
    jti: 'synthetic-endorse-proof',
    'soracom-endorse-claim': { imsi: imsiValue, imei: imeiValue },
    ...claims,
  }).setProtectedHeader({ alg: 'RS256', kid: keyId }).sign(signingKey);
}

void test('Endorse JWT yields only domain-separated digests and times', async () => {
  const hmac = (field, value) => createHmac('sha256', hashSecret).update(`rock-sim-proof:${field}\0${value}`).digest('hex');
  assert.deepEqual(await verifySimProof(await endorse(), options), {
    simDigest: hmac('imsi', imsi), deviceDigest: hmac('imei', imei), issuedAt, expiresAt,
  });
  const rotated = 'next-test-key.pem';
  const publicKeys = new Map([...options.publicKeys, [rotated, otherKey.publicKey]]);
  assert.ok(await verifySimProof(await endorse({ keyId: rotated, signingKey: otherKey.privateKey }), { ...options, publicKeys }));
  assert.ok(await verifySimProof(await endorse(), { ...options, publicKeys }));
});

const invalidTokens = {
  'expired proof': () => endorse({ claims: { exp: now / 1_000 } }),
  'different signing key': () => endorse({ signingKey: otherKey.privateKey }),
  'wrong issuer': () => endorse({ claims: { iss: 'https://issuer.invalid' } }),
  'wrong audience': () => endorse({ claims: { aud: 'other-audience' } }),
  'wrong subject': () => endorse({ claims: { sub: 'other-subject' } }),
  'unknown kid': () => endorse({ keyId: 'unknown-test-key' }),
  'future iat': () => endorse({ claims: { iat: now / 1_000 + 1 } }),
  'future nbf': () => endorse({ claims: { nbf: now / 1_000 + 1 } }),
  'stale proof before exp': () => endorse({ claims: { iat: now / 1_000 - 601 } }),
  'missing IMEI': () => endorse({ claims: { 'soracom-endorse-claim': { imsi } } }),
  'missing expiry': () => endorse({ claims: { exp: undefined } }),
  'one edited character': async () => {
    const [header, payload, signature] = (await endorse()).split('.');
    const first = signature[0] === 'A' ? 'B' : 'A';
    return `${header}.${payload}.${first}${signature.slice(1)}`;
  },
  'signature recoded with nonzero unused bits': async () => {
    const [header, payload, signature] = (await endorse()).split('.');
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const last = alphabet.indexOf(signature.at(-1));
    const recoded = signature.slice(0, -1) + alphabet[last + 1];
    assert.deepEqual(Buffer.from(recoded, 'base64url'), Buffer.from(signature, 'base64url'));
    return `${header}.${payload}.${recoded}`;
  },
  'algorithm substitution': () => new SignJWT({ iss: 'https://soracom.io' })
    .setProtectedHeader({ alg: 'HS256', kid }).sign(new TextEncoder().encode(hashSecret)),
};

for (const [name, token] of Object.entries(invalidTokens)) {
  void test(`rejects ${name}`, async () => assert.equal(await verifySimProof(await token(), options), null));
}

const env = { DB: db, SIM_PROOF_HASH_SECRET: hashSecret, SIM_PROOF_PUBLIC_KEYS_JSON: JSON.stringify({ [kid]: publicPem }) };
const base = 'https://sim-proof.invalid';
const route = (action, body, owner, headers = {}, config = env) => handleSimProof(new Request(`${base}/api/devices/sim-proof`, {
  method: 'POST',
  headers: { origin: base, ...(owner ? { 'oai-authenticated-user-id': owner } : {}), ...headers },
  body: JSON.stringify(body),
}), action, config);

void test('account, origin and separate secret are required before any write', async () => {
  const token = await endorse();
  assert.equal((await route('bind', { token })).status, 401);
  assert.equal((await route('bind', { token }, 'owner-1', { origin: 'https://elsewhere.invalid' })).status, 403);
  assert.equal((await route('bind', { token }, 'owner-1', { authorization: 'Bearer rock_esim_fixture' })).status, 401);
  assert.equal((await route('bind', { token }, 'owner-1', { authorization: 'Bearer rock_session_fixture' })).status, 401);
  assert.equal((await route('revoke', {}, 'owner-1', { authorization: 'Bearer rock_session_fixture' })).status, 401);
  assert.equal((await route('bind', { token }, null, { cookie: 'rock_esim_access=fixture' })).status, 401);
  assert.equal((await route('bind', { token }, 'owner-1', {}, { ...env, ESIMGO_PROFILE_HASH_SECRET: hashSecret })).status, 503);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM sim_bindings').first('n'), 0);
});

void test('bind, repeat, verify, revoke, and rebind use an owner-scoped digest pair', async (t) => {
  const responses = [];
  const logs = ['log', 'warn', 'error', 'info', 'debug'].map((name) => t.mock.method(console, name, () => {}));
  async function request(action, body, owner, status = 200) {
    const response = await route(action, body, owner);
    assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const result = await response.json();
    responses.push(result);
    return result;
  }

  const token = await endorse();
  const owner = 'owner-1';
  const other = 'owner-2';
  const { binding } = await request('bind', { token }, owner);
  assert.deepEqual(await request('bind', { token }, owner), { binding });
  await request('bind', { token }, other, 409);
  const movedToken = await endorse({ imeiValue: '004400000000103' });
  await request('bind', { token: movedToken }, owner, 409);
  await request('bind', { token: await invalidTokens['wrong issuer']() }, owner, 401);
  assert.deepEqual(await request('verify', { token }, owner), { verification: 'sim_verified' });
  assert.deepEqual(await request('verify', { token }, other), { verification: 'passkey_required' });
  assert.deepEqual(await request('verify', { token: movedToken }, owner), { verification: 'passkey_required' });
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM sim_bindings').first('n'), 1);

  const id = { bindingId: binding.id };
  await request('revoke', id, other, 404);
  const revoked = await request('revoke', id, owner);
  assert.ok(revoked.binding.revokedAt >= binding.boundAt);
  assert.deepEqual(await request('revoke', id, owner), revoked);
  assert.deepEqual(await request('verify', { token }, owner), { verification: 'passkey_required' });
  await request('bind', { token }, owner, 409);

  const freshIssuedAt = Math.floor(revoked.binding.revokedAt / 1_000) + 1;
  t.mock.method(Date, 'now', () => freshIssuedAt * 1_000);
  const freshToken = await endorse({ claims: { iat: freshIssuedAt } });
  await request('bind', { token: freshToken }, owner);
  assert.deepEqual(await request('verify', { token: freshToken }, owner), { verification: 'sim_verified' });
  assert.deepEqual(await request('verify', { token }, owner), { verification: 'passkey_required' });
  await request('bind', { token }, owner, 409);

  const rows = (await db.prepare('SELECT * FROM sim_bindings ORDER BY bound_at').all()).results;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].revoked_at, revoked.binding.revokedAt);
  assert.equal(rows[1].revoked_at, null);
  const observed = JSON.stringify({ responses, rows, logs: logs.map((log) => log.mock.calls.map((call) => call.arguments)) });
  for (const secret of [imsi, imei, token, freshToken, hashSecret]) assert.ok(!observed.includes(secret));
});

void test('simultaneous claims by two account owners leave exactly one active row', async () => {
  const token = await endorse({ imsiValue: '001010000000103' });
  const results = await Promise.all([
    route('bind', { token }, 'owner-3'),
    route('bind', { token }, 'owner-4'),
  ]);
  assert.deepEqual(results.map((response) => response.status).sort((a, b) => a - b), [200, 409]);
  const proof = await verifySimProof(token, options);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM sim_bindings WHERE sim_digest = ?')
    .bind(proof.simDigest).first('n'), 1);
});
