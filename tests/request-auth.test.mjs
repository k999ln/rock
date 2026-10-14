import assert from 'node:assert/strict';
import test from 'node:test';
import { configuredLocalDevelopmentUser, requestGatewayUser } from '../lib/request-auth.ts';

void test('local preview identity is explicit and loopback-only', () => {
  assert.equal(
    configuredLocalDevelopmentUser(
      new Request('http://localhost:8787/api/jobs'),
      'local-preview:rockstar-owner',
    ),
    'local-preview:rockstar-owner',
  );
  assert.equal(
    configuredLocalDevelopmentUser(
      new Request('https://rockstaros-kaiya.noellesugar1.chatgpt.site/api/jobs'),
      'local-preview:rockstar-owner',
    ),
    null,
  );
  assert.equal(
    configuredLocalDevelopmentUser(
      new Request('http://localhost:8787/api/jobs'),
      'owner-without-preview-prefix',
    ),
    null,
  );
});

void test('request auth prefers the stable gateway user id', async () => {
  const request = new Request('https://columbia.avoado.si/api/jobs', {
    headers: { 'oai-authenticated-user-id': ' owner-1 ', 'x-dispatched-app': 'site---verified-project' },
  });
  assert.equal(await requestGatewayUser(request), 'owner-1');
});

void test('the platform-owned generated Sites host keeps its stable gateway id', async () => {
  const request = new Request('https://rockstaros-kaiya.noellesugar1.chatgpt.site/api/jobs', {
    headers: { 'oai-authenticated-user-id': 'owner-1' },
  });
  assert.equal(await requestGatewayUser(request), 'owner-1');
});

void test('loopback fixtures can supply a local gateway id without weakening production hosts', async () => {
  assert.equal(await requestGatewayUser(new Request('http://127.0.0.1:8787/api/jobs', {
    headers: { 'oai-authenticated-user-id': 'fixture-owner' },
  })), 'fixture-owner');
  assert.equal(await requestGatewayUser(new Request('https://route-fixture.invalid/api/jobs', {
    headers: { 'oai-authenticated-user-id': 'fixture-owner' },
  })), 'fixture-owner');
});

void test('Sites email fallback is gateway-bound, stable, and pseudonymous', async () => {
  const request = (email, overrides = {}) =>
    new Request('https://rockstaros-kaiya.noellesugar1.chatgpt.site/api/jobs', {
      headers: {
        'oai-authenticated-user-email': email,
        'x-dispatched-app': 'site---verified-project',
        ...overrides,
      },
    });
  const first = await requestGatewayUser(request('Owner@Example.com'));
  const second = await requestGatewayUser(request('owner@example.com'));
  assert.equal(first, second);
  assert.match(first, /^sites-email-sha256:[a-f0-9]{64}$/);
  assert.doesNotMatch(first, /owner|example/i);
});

void test('email fallback fails closed away from the Sites gateway', async () => {
  await assert.rejects(
    requestGatewayUser(
      new Request('https://example.test/api/jobs', {
        headers: {
          'oai-authenticated-user-email': 'owner@example.com',
          'x-dispatched-app': 'site---verified-project',
        },
      }),
    ),
    /UNAUTHORIZED/,
  );
  await assert.rejects(
    requestGatewayUser(
      new Request('https://example.chatgpt.site/api/jobs', {
        headers: { 'oai-authenticated-user-email': 'owner@example.com' },
      }),
    ),
    /UNAUTHORIZED/,
  );
});

void test('mutations still require same origin before identity is accepted', async () => {
  await assert.rejects(
    requestGatewayUser(
      new Request('https://example.chatgpt.site/api/jobs', {
        method: 'POST',
        headers: {
          origin: 'https://attacker.invalid',
          'oai-authenticated-user-id': 'owner-1',
        },
      }),
    ),
    /ORIGIN/,
  );
});

void test('gateway user id is rejected without a trusted Sites dispatch boundary', async () => {
  await assert.rejects(
    requestGatewayUser(new Request('https://columbia.avoado.si/api/jobs', {
      headers: { 'oai-authenticated-user-id': 'forged-owner' },
    })),
    /UNAUTHORIZED/,
  );
  await assert.rejects(
    requestGatewayUser(new Request('https://direct-worker.example/api/jobs', {
      headers: {
        'oai-authenticated-user-id': 'forged-owner',
        'x-dispatched-app': 'site---forged',
      },
    })),
    /UNAUTHORIZED/,
  );
});
