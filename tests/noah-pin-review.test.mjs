import assert from 'node:assert/strict';
import test from 'node:test';
import { createNoahPinReviewApi, loadNoahPinReviewCandidates, noahGeneratedPinsPublic, sampleNoahPinReviews } from '../lib/noah-pin-review.ts';
import { NOAH_PIN_REVIEW_API, noahPinReviewCounts } from '../lib/noah-pin-review-model.ts';
import { OWNER_SCOPE_HEADER, ownerScopeFor } from '../lib/owner-intent.ts';
import { fixture } from './fixtures/noah/intake.mjs';

const now = 1795550000000;
const pin = { title: '天気を調べる', give: '都市名', get: '天気予報', scene: { template: 'concentric', labels: ['都市', '天気予報'], parts: [], variant: null } };
const candidates = Array.from({ length: 205 }, (_, index) => ({ id: `agent:${index}`, name: `Weather ${index}`, original: 'Weather forecasts by city.', pin }));

function bucket() {
  const items = new Map();
  return {
    items,
    async get(key) { return items.get(key) ?? null; },
    async put(key, body, { onlyIf } = {}) {
      const previous = items.get(key);
      if (onlyIf?.etagMatches && previous?.etag !== onlyIf.etagMatches || onlyIf?.etagDoesNotMatch === '*' && previous) return null;
      const value = { etag: crypto.randomUUID(), json: async () => JSON.parse(body) };
      items.set(key, value);
      return value;
    },
  };
}

void test('samples exactly 200 distinct candidates and denies public use with partial votes or 189 matches', async () => {
  assert.deepEqual(sampleNoahPinReviews(candidates.slice(0, 199)), []);
  const sample = sampleNoahPinReviews([...candidates, candidates[0]]);
  assert.equal(new Set(sample.map(({ id }) => id)).size, 200);
  assert.ok(sample.every((entry) => candidates.includes(entry)));
  const storage = bucket();
  let votes = Object.fromEntries(sample.slice(0, 190).map(({ id }) => [id, 'match']));
  const payload = () => JSON.stringify({ id: 'sample', createdAt: now, entries: sample, votes });
  const key = 'noah/pin-review/v1/current.json';
  await storage.put(key, payload());
  assert.equal(await noahGeneratedPinsPublic(storage, { NOAH_PINS_PUBLIC: 'true' }), false);
  votes = Object.fromEntries(sample.map(({ id }, index) => [id, index < 189 ? 'match' : 'diagram']));
  await storage.put(key, payload());
  assert.equal(await noahGeneratedPinsPublic(storage, { NOAH_PINS_PUBLIC: 'true' }), false);
  votes[sample[189].id] = 'match';
  await storage.put(key, payload());
  assert.equal(await noahGeneratedPinsPublic(storage, { NOAH_PINS_PUBLIC: 'true' }), true);
  assert.equal(await noahGeneratedPinsPublic(storage, { NOAH_PINS_PUBLIC: 'false' }), false);
  assert.equal(await noahGeneratedPinsPublic(undefined, { NOAH_PINS_PUBLIC: 'true' }), false);
});

void test('the reviewer API protects the sample, validates reasons and persists votes across a reload', async () => {
  const storage = bucket();
  const api = createNoahPinReviewApi({ bucket: storage, reviewers: ['reviewer'], now: () => now, load: async () => candidates,
    authenticate: async (request) => request.headers.get('x-test-owner') || 'viewer' });
  const endpoint = 'https://avoado.si' + NOAH_PIN_REVIEW_API;
  const send = async (data, { owner = 'reviewer', origin = 'https://avoado.si', scope } = {}) => api(new Request(endpoint, data
    ? { method: 'POST', headers: { 'x-test-owner': owner, origin, 'content-type': 'application/json', [OWNER_SCOPE_HEADER]: scope ?? await ownerScopeFor(owner) }, body: JSON.stringify(data) }
    : { headers: { 'x-test-owner': owner } }));
  assert.equal((await send(null, { owner: 'viewer' })).status, 403);
  assert.equal((await send({ action: 'sample' }, { origin: 'https://other.example' })).status, 403);
  assert.equal((await send({ action: 'sample' }, { scope: 'stale' })).status, 409);
  const { batch } = await (await send({ action: 'sample' })).json();
  assert.equal(batch.entries.length, 200);
  assert.equal((await send({ action: 'sample', batchId: batch.id })).status, 409);
  const { id } = batch.entries[0];
  assert.equal((await send({ action: 'vote', batchId: 'old', id, vote: 'match' })).status, 409);
  assert.equal((await send({ action: 'vote', batchId: batch.id, id, vote: 'invalid' })).status, 400);
  assert.equal((await send({ action: 'vote', batchId: batch.id, id, vote: 'diagram' })).status, 200);
  const response = await send();
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const refreshed = (await response.json()).batch;
  assert.deepEqual(refreshed.entries, batch.entries);
  assert.equal(noahPinReviewCounts(refreshed).reasons.diagram, 1);
  assert.equal(noahPinReviewCounts(refreshed).passed, false);
});

void test('valid pins from R2 are available for review before the D1 migration', async (t) => {
  const f = fixture(t, async () => new Response(null, { status: 404 }));
  const storage = bucket();
  const item = { source: 'github', name: 'Weather', summary: 'Weather forecasts by city.', author: 'maker', observedAt: now, expiresAt: now + 1000 };
  await storage.put('noah/collection/v1/github.json', JSON.stringify({ schema: 'noah-collection/1', source: 'github', collectedAt: now,
    items: [
      { ...item, id: 'good', url: 'https://github.com/maker/good', sourceUrl: 'https://github.com/maker/good', pin },
      { ...item, id: 'bad', url: 'https://github.com/maker/bad', sourceUrl: 'https://github.com/maker/bad', pin: { ...pin, scene: {} } },
    ] }));
  assert.deepEqual(await loadNoahPinReviewCandidates(f.db, storage, now), [{ id: 'https://github.com/maker/good', name: 'Weather', original: item.summary, pin }]);
});
