import assert from 'node:assert/strict';
import test from 'node:test';
import { createNoahSessionApi, noahEsimRequestScope } from '../lib/noah-esim-access.ts';
import { esimCloudRequestScope } from '../lib/esim-cloud-access.ts';
import { noahReturnPath } from '../lib/noah-navigation.ts';
import { accountReturnNavigation } from '../lib/eve-noah-navigation.ts';
import { screen } from './fixtures/noah/screen.mjs';
const request = (path, method = 'GET') => new Request(`https://avoado.si${path}`, { method });

void test('Noah eSIM scope grants only the explicit user workflow, never administration', () => {
  for (const [path, methods] of [
    ['/api/noah/session', ['GET', 'POST']], ['/api/noah/connect', ['GET', 'POST']],
    ['/api/noah/connect/id/tools', ['GET']], ['/api/noah/ask/id', ['GET', 'POST']],
    ['/api/noah/profile', ['GET', 'POST']], ['/api/noah/profile/documents', ['POST']],
    ['/api/noah/profile/documents/id', ['GET']], ['/api/noah/registration', ['GET', 'POST']],
    ['/api/noah/registration/browser', ['GET', 'POST']], ['/api/noah/data', ['GET', 'POST']],
  ]) for (const method of methods) assert.equal(esimCloudRequestScope(request(path, method)), 'noah');
  for (const path of ['/api/os/access', '/api/noah/review', '/api/noah/publisher', '/api/noah/intake', '/api/noah/registration/worker', '/api/noah/session/other', '/api/esim/orders/id/cloud-access', '/api/noah/billing']) {
    for (const method of ['GET', 'POST', 'DELETE', 'PATCH']) assert.equal(noahEsimRequestScope(request(path, method)), null);
  }
  assert.equal(noahEsimRequestScope(request('/api/noah/session', 'DELETE')), null);
  assert.equal(noahEsimRequestScope(request('/api/noah/profile', 'DELETE')), null);
});

void test('session observation never exposes owner data or mistakes outages for a missing identity', async () => {
  for (const [authenticate, status, body] of [
    [async () => 'private-owner', 200, { connected: true }],
    [async () => { throw Error('UNAUTHORIZED'); }, 401, { connected: false, esimConfigured: false }],
    [async () => { throw Error('storage secrets must not escape'); }, 503, { error: 'CONNECTION_UNAVAILABLE' }],
  ]) {
    const api = createNoahSessionApi({ authenticate, esimConfigured: false });
    const response = await api(request('/api/noah/session'));
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), body);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal((await api(request('/api/noah/session', 'POST'))).status, 405);
  }
});

function accessScreen(search = '') {
  const s = screen({ passkeys: true, fetch: async () => ({ body: { signedIn: false } }), modules: {
    'next/navigation': { useSearchParams: () => new URLSearchParams(search) },
    '@/lib/noah-navigation': { noahReturnPath },
    '@/lib/eve-noah-navigation': { accountReturnNavigation },
    '@/lib/passkey-browser': {},
    '@/lib/account-handoff': {},
  } });
  return { ...s, page: s.mount('components/noah-access.tsx') };
}

void test('account and old login links keep the chosen Agent without initializing eSIM setup', async () => {
  for (const [prefix, label] of [['', 'パスキーで新しく始める'], ['method=existing&mode=login&', 'ログイン']]) {
    const s = accessScreen(`${prefix}returnTo=%2Fnoah%2Fready%2Fagent%3Fid%3Dagentboard`);
    await s.page.tick(0);
    assert.equal(s.page.find('a', '戻る')[0].props.href, '/noah/ready/agent?id=agentboard');
    assert.equal(s.page.find('button').filter(node => s.page.text(node) === label).length, 1);
    assert.deepEqual(s.visits, []);
    assert.deepEqual(s.calls.map(call => call.url), ['/api/os/access']);
    assert.doesNotMatch(s.page.text(), /eSIM/);
  }
});

void test('account links reject external return paths and open saved information by default', async () => {
  for (const [search, expected] of [['returnTo=https%3A%2F%2Fevil.test', '/noah'], ['', '/noah/profile'], ['returnTo=%2Fnoah%2Faccount', '/noah']]) {
    const s = accessScreen(search);
    await s.page.tick(0);
    assert.equal(s.page.find('a', '戻る')[0].props.href, expected);
  }
});
