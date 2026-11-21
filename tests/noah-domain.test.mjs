import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNoahDomain } from '../scripts/check-noah-domain.mjs';

void test('public checks use only same-origin reads and distinguish pages, catalog and private APIs', async () => {
  const calls = [];
  const checks = await checkNoahDomain(undefined, async (url, options) => {
    calls.push([url, options]);
    if (url.endsWith('/noah/ready')) return new Response(null, { status: 307, headers: { location: '/noah/explore?tab=ready' } });
    if (url.endsWith('/noah/data')) return new Response(null, { status: 307, headers: { location: '/noah/saved?tab=results' } });
    if (url.endsWith('limit=0')) return Response.json({ items: [], counts: { ran: 1, new: 2 } });
    if (url.includes('/api/')) return Response.json({ error: 'sign in' }, { status: 401 });
    return new Response('<html></html>', { headers: { 'content-type': 'text/html' } });
  });
  assert.equal(checks.length, 12);
  assert(checks.every(c => c.ok));
  assert(calls.every(([url, options]) => url.startsWith('https://avoado.si/') &&
    options.redirect === 'manual' && !options.method && !options.headers.Authorization));
});

void test('retired pages must retain the intended category on the canonical origin', async () => {
  for (const location of ['/noah/saved', '/noah/saved?tab=agents', 'https://elsewhere.example/noah/saved?tab=results']) {
    const checks = await checkNoahDomain(undefined, async () => new Response(null, { status: 307, headers: { location } }));
    assert.equal(checks.find(c => c.path === '/noah/data').ok, false);
  }
});

void test('redirects, disabled catalog and leaked private API are not a healthy release', async () => {
  const checks = await checkNoahDomain(undefined, async (url) => {
    if (url.endsWith('limit=0')) return Response.json({ error: 'closed' }, { status: 404 });
    if (url.includes('/api/')) return Response.json({ records: [] });
    return Response.redirect('https://elsewhere.example', 302);
  });
  assert(checks.every(c => !c.ok));
});
