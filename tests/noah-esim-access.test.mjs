import assert from 'node:assert/strict';
import test from 'node:test';
import { createNoahSessionApi, noahEsimRequestScope } from '../lib/noah-esim-access.ts';
import { esimCloudRequestScope } from '../lib/esim-cloud-access.ts';
import { noahReturnPath } from '../lib/noah-navigation.ts';
import { screen } from './fixtures/noah/screen.mjs';
const request = (path, method = 'GET') => new Request(`https://avoado.si${path}`, { method });

void test('Noah eSIM scope grants only the explicit user workflow, never administration', () => {
  for (const [path, methods] of [
    ['/api/noah/session', ['GET']], ['/api/noah/connect', ['GET', 'POST']],
    ['/api/noah/connect/id/tools', ['GET']], ['/api/noah/ask/id', ['GET', 'POST']],
    ['/api/noah/profile', ['GET', 'POST']], ['/api/noah/profile/documents', ['POST']],
    ['/api/noah/profile/documents/id', ['GET']], ['/api/noah/registration', ['GET', 'POST']],
    ['/api/noah/registration/browser', ['GET', 'POST']], ['/api/noah/data', ['GET', 'POST']],
  ]) for (const method of methods) assert.equal(esimCloudRequestScope(request(path, method)), 'noah');
  for (const path of ['/api/os/access', '/api/noah/review', '/api/noah/publisher', '/api/noah/intake', '/api/noah/registration/worker', '/api/noah/session/other', '/api/esim/orders/id/cloud-access', '/api/noah/billing']) {
    for (const method of ['GET', 'POST', 'DELETE', 'PATCH']) assert.equal(noahEsimRequestScope(request(path, method)), null);
  }
  assert.equal(noahEsimRequestScope(request('/api/noah/session', 'POST')), null);
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

function accessScreen(fetch, search = '') {
  const listeners = new Map(), document = { hidden: false, addEventListener: (k, v) => listeners.set(k, v), removeEventListener: k => listeners.delete(k) };
  const s = screen({ fetch, document, modules: {
    'next/navigation': { useSearchParams: () => new URLSearchParams(search) },
    '@/lib/noah-navigation': { noahReturnPath },
    '@/components/rockstar-account': { default: () => 'Existing login' },
  } });
  return { ...s, listeners, document, page: s.mount('components/noah-access.tsx') };
}

void test('verified connection returns to the selected Agent without creating an account', async () => {
  const s = accessScreen(async () => ({ body: { connected: true } }), 'returnTo=%2Fnoah%2Fagents%2Fagentboard');
  await s.page.flush();
  assert.deepEqual(s.visits, ['/noah/agents/agentboard']);
  assert.deepEqual(s.calls.map(c => [c.method, c.url]), [['GET', '/api/noah/session']]);
});

void test('no signup form by default; missing configuration, missing credential and outage stay distinct', async () => {
  for (const [status, body, text] of [
    [401, { esimConfigured: false }, 'eSIM連携は準備中です。'],
    [401, { esimConfigured: true }, 'このブラウザに接続情報が届いていません。'],
    [503, {}, '接続を確認できませんでした。'],
  ]) {
    let connected = false;
    const s = accessScreen(async () => connected ? { body: { connected: true } } : { status, body }, 'returnTo=https%3A%2F%2Fevil.test');
    await s.page.flush(); assert.match(s.page.text(), new RegExp(text));
    assert.doesNotMatch(s.page.text(), /パスワード|ユーザーID/);
    assert.equal(s.page.find('form').length, 0);
    connected = true; await s.page.click('接続を再確認');
    assert.deepEqual(s.visits, ['/noah']);
  }
});

void test('existing login is optional and does not start a second connection request', async () => {
  const s = accessScreen(async () => { throw Error('unexpected'); }, 'method=existing');
  await s.page.flush(); assert.equal(s.page.text(), 'Existing login'); assert.equal(s.calls.length, 0);
});

void test('foreground resume checks once, ignores hidden tabs and prevents overlapping checks', async () => {
  let release;
  const s = accessScreen(() => new Promise(resolve => { release = resolve; }));
  s.listeners.get('visibilitychange')(); s.listeners.get('visibilitychange')();
  assert.equal(s.calls.length, 1);
  release({ status: 401, body: { esimConfigured: true } }); await s.page.flush();
  s.document.hidden = true; s.listeners.get('visibilitychange')(); assert.equal(s.calls.length, 1);
  s.document.hidden = false; s.listeners.get('visibilitychange')(); assert.equal(s.calls.length, 2);
  release({ body: { connected: true } }); await s.page.flush(); assert.deepEqual(s.visits, ['/noah']);
});
