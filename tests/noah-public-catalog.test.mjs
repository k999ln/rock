import test from 'node:test';
import assert from 'node:assert/strict';
import { createResearchCatalog } from '../lib/noah-research-query.ts';
import { createNoahPublicCatalogApi } from '../lib/noah-public-catalog-api.ts';

const index = { revision: '0123456789abcdef', asOf: '2026-11-15', threadId: 'research',
  stats: { total: 2, kinds: { agent: 2 }, primaryReviewed: 2, nameGroups: 0 },
  rows: [['anicca', 'Anicca', 'agent', 'primary', 'Work helper', 'Author', []],
    ['research-0123456789', 'Other', 'agent', 'primary', 'Code helper', 'Author', []]] };
const api = createNoahPublicCatalogApi(createResearchCatalog(index));
const request = (query = '', method = 'GET') => new Request('https://avoado.si/api/noah/public-catalog' + query, { method });

void test('anonymous and signed requests return the same bounded public catalog without owner data', async () => {
  const first = await api(request('?limit=1')).json();
  const signed = new Request(request('?limit=1'), { headers: { cookie: 'private=value', 'oai-authenticated-user-id': 'private-owner' } });
  assert.deepEqual(await api(signed).json(), first);
  assert.equal(first.ownerScope, null); assert.equal(first.entries.length, 1);
  const second = await api(request('?limit=1&cursor=' + encodeURIComponent(first.nextCursor))).json();
  assert.equal(second.entries[0].name, 'Other'); assert.equal(second.nextCursor, null);
  assert.equal(JSON.stringify(first).includes('private-owner'), false);
});
void test('public API refuses writes and rejects malformed or mismatched pagination', () => {
  for (const method of ['POST', 'PUT', 'DELETE']) assert.equal(api(request('', method)).status, 405);
  for (const query of ['?limit=51', '?cursor=invalid', '?kind=private', '?q=' + 'x'.repeat(201)]) assert.equal(api(request(query)).status, 400);
});
void test('details resolve exact catalog IDs and never accept arbitrary source paths', async () => {
  assert.equal((await api(request(), 'anicca').json()).entry.name, 'Anicca');
  for (const id of ['missing', '../../private', 'https://localhost/private']) assert.equal(api(request(), id).status, 404);
  assert.equal(api(request()).headers.get('Cache-Control'), 'no-store');
});
