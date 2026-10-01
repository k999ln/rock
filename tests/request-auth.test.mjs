import assert from 'node:assert/strict';
import test from 'node:test';
import { requestUser } from '../lib/request-auth.ts';

void test('request auth prefers the stable gateway user id', async () => {
  const request = new Request('https://example.test/api/jobs', {
    headers: { 'oai-authenticated-user-id': ' owner-1 ' },
  });
  assert.equal(await requestUser(request), 'owner-1');
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
  const first = await requestUser(request('Owner@Example.com'));
  const second = await requestUser(request('owner@example.com'));
  assert.equal(first, second);
  assert.match(first, /^sites-email-sha256:[a-f0-9]{64}$/);
  assert.doesNotMatch(first, /owner|example/i);
});

void test('email fallback fails closed away from the Sites gateway', async () => {
  await assert.rejects(
    requestUser(
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
    requestUser(
      new Request('https://example.chatgpt.site/api/jobs', {
        headers: { 'oai-authenticated-user-email': 'owner@example.com' },
      }),
    ),
    /UNAUTHORIZED/,
  );
});

void test('mutations still require same origin before identity is accepted', async () => {
  await assert.rejects(
    requestUser(
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
