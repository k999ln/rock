import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNoahDomain } from '../scripts/check-noah-domain.mjs';

void test('public checks use only same-origin reads and distinguish pages, catalog and private APIs', async () => {
  const calls = [];
  const checks = await checkNoahDomain(undefined, async (url, options) => {
    calls.push([url, options]);
    if (url.endsWith('limit=0')) return Response.json({ items: [], counts: { ran: 1, new: 2 } });
    if (url.includes('/api/')) return Response.json({ error: 'sign in' }, { status: 401 });
    return new Response('<html></html>', { headers: { 'content-type': 'text/html' } });
  });
  assert.equal(checks.length, 9);
  assert(checks.every(c => c.ok));
  assert(calls.every(([url, options]) => url.startsWith('https://avoado.si/') &&
    options.redirect === 'manual' && !options.method && !options.headers.Authorization));
});

void test('redirects, disabled catalog and leaked private API are not a healthy release', async () => {
  const checks = await checkNoahDomain(undefined, async (url) => {
    if (url.endsWith('limit=0')) return Response.json({ error: 'closed' }, { status: 404 });
    if (url.includes('/api/')) return Response.json({ records: [] });
    return Response.redirect('https://elsewhere.example', 302);
  });
  assert(checks.every(c => !c.ok));
});
