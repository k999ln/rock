import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNoahPilot } from '../scripts/check-noah-pilot-production.mjs';

const options = { origin: 'https://noah.test', privateResult: '12345678-1234-1234-1234-123456789abc', people: 10, concurrency: 3 };
void test('pilot smoke bounds concurrency, keeps credentials in memory, and never calls external or mutation APIs', async () => {
  const calls = []; let issued = 0, active = 0, maximum = 0;
  const result = await checkNoahPilot(options, async (url, init) => {
    calls.push({ url, init }); active++; maximum = Math.max(maximum, active); await new Promise(setImmediate); active--;
    assert.ok(url.startsWith(options.origin)); assert.equal(init.redirect, 'manual');
    if (init.method === 'POST') {
      assert.equal(url, `${options.origin}/api/noah/session`);
      return Response.json({ connected: true, created: true }, { headers: { 'Set-Cookie': `__Host-noah_access=synthetic-${++issued}; Secure; HttpOnly` } });
    }
    assert.match(init.headers.Cookie, /^__Host-noah_access=synthetic-/);
    if (url.endsWith('/session')) return Response.json({ connected: true, created: false });
    if (url.endsWith('/ask')) return Response.json({ asks: [] });
    return Response.json({ error: 'missing' }, { status: 404 });
  });
  assert.equal(result.ok, true); assert.equal(result.requests, 40); assert.equal(result.otherOwnerDenied, 10); assert.equal(maximum, 3);
  assert.equal(calls.filter(c => c.init.method === 'POST').length, 10);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-|Cookie|12345678/);
});
void test('pilot smoke fails closed on shared access, leaks and network errors without logging response secrets', async () => {
  const result = await checkNoahPilot({ ...options, people: 2, concurrency: 1 }, async (url, init) => {
    if (init.method === 'POST') return Response.json({ created: true }, { headers: { 'Set-Cookie': '__Host-noah_access=secret; Secure' } });
    if (url.endsWith('/session')) throw Error('private exception');
    return Response.json({ asks: ['private content'], private: 'secret' });
  });
  assert.equal(result.ok, false); assert.equal(result.independentBrowsers, 1); assert.equal(result.otherOwnerDenied, 0);
  assert.doesNotMatch(JSON.stringify(result), /secret|private exception|private content/);
  for (const invalid of [{ people: 101 }, { concurrency: 6 }, { origin: 'http://noah.test' }, { privateResult: '../profile' }]) await assert.rejects(checkNoahPilot({ ...options, ...invalid }));
});
