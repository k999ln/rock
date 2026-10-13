import assert from 'node:assert/strict';
import test from 'node:test';
import { GET, HEAD } from '../app/columbia/route.ts';

const destination =
  'https://rockstaros-kaiya.noellesugar1.chatgpt.site/campus?campus=columbia';

void test('Columbia short link opens the RockstarOS Columbia campus', () => {
  const response = GET(new Request('https://avoado.si/columbia'));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), destination);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

void test('Columbia short link preserves campaign parameters but keeps its campus fixed', () => {
  const response = GET(
    new Request('https://avoado.si/columbia?campus=nyu&source=nfc&utm_campaign=campus-poster'),
  );
  assert.equal(
    response.headers.get('location'),
    `${destination}&source=nfc&utm_campaign=campus-poster`,
  );
});

void test('Columbia short link supports NFC and browser HEAD requests', () => {
  const response = HEAD(new Request('https://avoado.si/columbia?source=nfc'));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), `${destination}&source=nfc`);
  assert.equal(response.body, null);
});
