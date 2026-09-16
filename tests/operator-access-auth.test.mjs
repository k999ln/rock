import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AccessAuthError,
  authorizeOperator,
  resetAccessKeyCacheForTests,
} from '../services/operator-dock/src/access-auth.ts';

const encoder = new TextEncoder();
const teamDomain = 'https://avocado-ops.cloudflareaccess.com';
const audience = 'operator-dock-audience-2026';
const operatorSub = 'operator-subject-0001';
const now = Date.parse('2026-09-15T20:00:00Z');

function encoded(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

async function signer(kid = 'operator-test-key') {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  Object.assign(jwk, { alg: 'RS256', kid, use: 'sig' });
  return {
    jwk,
    async token(changes = {}) {
      const header = encoded({ alg: 'RS256', kid, typ: 'JWT' });
      const payload = encoded({
        aud: [audience],
        exp: Math.floor(now / 1000) + 300,
        iat: Math.floor(now / 1000) - 5,
        iss: teamDomain,
        nbf: Math.floor(now / 1000) - 5,
        sub: operatorSub,
        type: 'app',
        ...changes,
      });
      const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        pair.privateKey,
        encoder.encode(`${header}.${payload}`),
      );
      return `${header}.${payload}.${Buffer.from(signature).toString('base64url')}`;
    },
  };
}

const env = {
  CF_ACCESS_TEAM_DOMAIN: teamDomain,
  CF_ACCESS_AUD: audience,
  ROCK_OPERATOR_SUB: operatorSub,
};

function request(token) {
  return new Request('https://operator.example/api/devices', {
    headers: token ? { 'Cf-Access-Jwt-Assertion': token } : {},
  });
}

void test('Operator Dock accepts only a valid Access JWT for the exact app and operator', async () => {
  resetAccessKeyCacheForTests();
  const signed = await signer();
  let fetches = 0;
  const fetcher = async () => {
    fetches += 1;
    return Response.json({ keys: [signed.jwk] });
  };
  const token = await signed.token();
  assert.deepEqual(
    await authorizeOperator(request(token), env, {
      clock: () => now,
      fetcher,
    }),
    { operatorSub },
  );
  await authorizeOperator(request(token), env, {
    clock: () => now,
    fetcher,
  });
  assert.equal(fetches, 1);
});

void test('Operator Dock fails closed for missing config, token and mismatched claims', async () => {
  resetAccessKeyCacheForTests();
  const signed = await signer();
  const fetcher = async () => Response.json({ keys: [signed.jwk] });
  await assert.rejects(
    () => authorizeOperator(request(''), {}, { clock: () => now, fetcher }),
    (error) => error instanceof AccessAuthError && error.status === 503,
  );
  await assert.rejects(
    () => authorizeOperator(request(''), env, { clock: () => now, fetcher }),
    (error) => error instanceof AccessAuthError && error.status === 401,
  );
  for (const changes of [
    { aud: ['another-application'] },
    { iss: 'https://attacker.cloudflareaccess.com' },
    { sub: 'another-operator' },
    { exp: Math.floor(now / 1000) - 1 },
    { type: 'org' },
  ]) {
    await assert.rejects(
      async () =>
        authorizeOperator(request(await signed.token(changes)), env, {
          clock: () => now,
          fetcher,
        }),
      (error) => error instanceof AccessAuthError && error.status === 403,
    );
  }
});

void test('Operator Dock rejects a JWT whose bytes do not match the Access signing key', async () => {
  resetAccessKeyCacheForTests();
  const trusted = await signer('trusted-access-key');
  const attacker = await signer('trusted-access-key');
  await assert.rejects(
    async () =>
      authorizeOperator(request(await attacker.token()), env, {
        clock: () => now,
        fetcher: async () => Response.json({ keys: [trusted.jwk] }),
      }),
    (error) => error instanceof AccessAuthError && error.status === 403,
  );
});
