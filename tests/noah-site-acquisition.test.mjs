import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  acquisitionSource,
  isAcquisitionNavigation,
  recordAcquisition,
  acquisitionReport,
  SITE_DESTINATIONS,
} from '../toolkits/noah-affiliate-agents/site-acquisition.mjs';

await test('acquisition excludes preview, prefetch, HEAD and API requests', () => {
  const headers = { 'sec-fetch-mode': 'navigate', 'sec-fetch-user': '?1' };
  assert.equal(
    isAcquisitionNavigation(new Request('https://example.com', { headers })),
    true,
  );
  for (const options of [
    {},
    { method: 'HEAD', headers },
    { headers: { ...headers, purpose: 'prefetch' } },
    { headers: { ...headers, 'sec-purpose': 'prefetch' } },
    { headers: { 'sec-fetch-mode': 'cors' } },
  ])
    assert.equal(
      isAcquisitionNavigation(new Request('https://example.com', options)),
      false,
    );
});
await test('acquisition holds only bounded aggregate counts and fixed destinations', () => {
  const now = Date.parse('2026-11-22T12:00:00Z');
  let rows = [];
  for (let day = 0; day < 40; day++) {
    for (const id of Object.keys(SITE_DESTINATIONS))
      for (const source of ['blog', 'x', 'untrusted'])
        rows = recordAcquisition(rows, id, source, now + day * 86400000);
  }
  assert.equal(rows.length, 180);
  rows = recordAcquisition(rows, 'ec-production', 'x', now + 39 * 86400000);
  assert.equal(rows.at(-2).navigationRequests, 2);
  assert.deepEqual(Object.keys(rows[0]), [
    'date',
    'schemeId',
    'source',
    'navigationRequests',
  ]);
  assert.equal(acquisitionSource('https://evil.example'), 'other');
  assert.throws(() => recordAcquisition(rows, '__proto__', 'x'));
  assert.equal(acquisitionReport(rows, now + 70 * 86400000).rows.length, 0);
  assert.match(
    acquisitionReport(rows).measurement,
    /not_unique_people_or_conversions/,
  );
  assert.ok(
    Object.values(SITE_DESTINATIONS).every(
      (url) => new URL(url).origin === 'https://avoado.si',
    ),
  );
});
