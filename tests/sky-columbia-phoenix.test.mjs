import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  resolve('app/sky/campus/[campusId]/columbia-feed.tsx'),
  'utf8',
);

void test('Columbia For you feed uses the shared Sky Phoenix model and history API', () => {
  assert.match(source, /rankSkyFeed\(campusTools, 'recommended'/u);
  assert.match(source, /SKY_PHOENIX_VERSION/u);
  assert.match(source, /\/api\/sky\/feed-history/u);
  assert.match(source, /Personalize recommendations/u);
  assert.match(source, /Turn on recommendation learning/u);
  assert.match(source, /Stop learning and delete history/u);
  assert.match(source, /Reset history/u);
});

void test('Columbia records only qualified visible impressions and bounded semantic events', () => {
  assert.match(source, /intersectionRatio >= 0\.55/u);
  assert.match(source, /duration < 1_000/u);
  assert.match(source, /dwellBucket\(duration\)/u);
  assert.match(source, /data-sky-tool-id/u);
  assert.match(source, /'detail'/u);
  assert.match(source, /'route'/u);
  assert.match(source, /'launch'/u);
  assert.match(source, /'save'/u);
  assert.match(source, /'unsave'/u);
});

void test('Columbia keeps anonymous learning in this tab and states the privacy boundary', () => {
  assert.match(source, /window\.sessionStorage/u);
  assert.match(source, /This tab only/u);
  assert.match(source, /never stores your request text/u);
  assert.match(source, /raw scrolling/u);
  assert.match(source, /cannot grant Tool access/u);
  assert.match(source, /create a Zema job/u);
  assert.match(source, /authorize payment/u);
});

void test('Columbia keeps the existing optional LinkedIn choice beside Phoenix learning', () => {
  assert.match(source, /Personalize this student feed with LinkedIn\?/u);
  assert.match(source, /I agree — enter Campus/u);
  assert.match(source, /Continue without LinkedIn/u);
  assert.match(source, /official connection is not enabled yet/u);
});
