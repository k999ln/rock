import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { loadRouteFixture } from './route-fixture.mjs';
import { campusTagCsv, campusTagQrSvg, campusTagUrls } from '../lib/campus-tags.ts';
import { CampusError, campusTagId, safeRelativeCampusDestination } from '../lib/campus.ts';
import { buildEnglishPatentPacket } from '../lib/patent-assistant.ts';
import { formatCitations } from '../lib/mr-tools.ts';
import { isColumbiaCardEntry, SKY_CAMPUS_ENTRIES } from '../lib/sky-campus.ts';

void test('Columbia card URL exports include NFC, QR, CSV, and SVG artifacts', () => {
  const row = campusTagUrls('columbia-sky-0001');
  assert.equal(row.nfcUrl, 'https://avocadomini.si/t/columbia-sky-0001');
  assert.equal(row.qrUrl, 'https://avocadomini.si/t/columbia-sky-0001?source=qr');
  assert.match(campusTagCsv([row]), /tag_id,nfc_url,qr_url/);
  const svg = campusTagQrSvg(row.qrUrl);
  assert.match(svg, /^<svg /);
  assert.match(svg, /data-qr-url="https:\/\/avocadomini\.si\/t\/columbia-sky-0001\?source=qr"/);
  assert.match(svg, /viewBox="0 0 360 360"/);
  assert.ok((svg.match(/<rect /g) ?? []).length > 100);
});

void test('QR export encodes the longest valid tag ID before any batch mutation', () => {
  const tagId = `columbia-${'x'.repeat(55)}`;
  assert.equal(tagId.length, 64);
  const row = campusTagUrls(tagId);
  assert.ok(new TextEncoder().encode(row.qrUrl).length <= 106);
  const svg = campusTagQrSvg(row.qrUrl);
  assert.match(svg, /viewBox="0 0 360 360"/);
  assert.match(svg, new RegExp(`data-qr-url="https:\\/\\/avocadomini\\.si\\/t\\/${tagId}\\?source=qr"`));
  // Version 5 has the three 7-module finder patterns inside a four-module
  // quiet zone; checking the resulting SVG geometry catches a decorative
  // rectangle pattern or an accidental version/capacity downgrade.
  assert.ok((svg.match(/<rect /g) ?? []).length > 180);
});

void test('the Columbia landing catalog has three English card tools and the entry gate is explicit', () => {
  const entry = SKY_CAMPUS_ENTRIES.columbia;
  assert.equal(entry.heading, 'Sky for Columbia students');
  assert.deepEqual(entry.tools.map((tool) => tool.title), ['Citations', 'AMC', 'Patent Assistant']);
  assert.ok(entry.tools.every((tool) => tool.href.includes('lang=en&entry=columbia-card')));
  assert.equal(isColumbiaCardEntry('columbia-card'), true);
  assert.equal(isColumbiaCardEntry('other-entry'), false);
});

void test('English citation formatting outputs Sources', () => {
  const output = formatCitations('A claim (Source: [Official docs](https://example.com/docs)).', 'en');
  assert.match(output, /## Sources/);
  assert.doesNotMatch(output, /出典/);
});

void test('English patent packet has US guidance and does not copy Japanese assessment text', () => {
  const input = {
    inventionTitle: 'Safe restart system', problem: 'A system loses its safe restart point.', mechanism: 'It records approval and state transitions.', architecture: 'A client, gateway, worker, and evidence store.', technicalEffect: 'It prevents duplicate external actions.', differences: 'Approval is rechecked before each action.', knownPriorArt: '', inventor: 'Student', applicant: 'Student', disclosureStatus: 'not_disclosed', disclosureDate: undefined,
  };
  const packet = buildEnglishPatentPacket(input, { readiness: 'research_ready', score: 70, headline: 'x', strengths: [], gaps: ['日本語の技術課題'], warnings: ['日本語の公開警告'], nextActions: [] });
  assert.match(packet, /USPTO Patent Public Search/);
  assert.match(packet, /provisional application/);
  assert.match(packet, /Columbia Technology Ventures/);
  assert.match(packet, /## Abstract \(150 words max\)/);
  assert.doesNotMatch(packet, /日本語の技術課題|日本語の公開警告/);
});

void test('Columbia English entry source files do not render Japanese literals', () => {
  for (const path of [
    'components/english-citations-runner.tsx',
    'components/amc-english-workspace.tsx',
    'components/english-patent-assistant.tsx',
    'app/sky/campus/[campusId]/page.tsx',
    'components/sky-tool-workspace.tsx',
    'components/mr-tool-runner.tsx',
  ]) {
    const source = readFileSync(path, 'utf8');
    if (path.startsWith('components/english-') || path.includes('amc-english') || path.includes('campus/'))
      assert.doesNotMatch(source, /[ぁ-んァ-ヶ一-龯]/u, path);
  }
  assert.match(readFileSync('components/sky-tool-workspace.tsx', 'utf8'), /if \(language === 'en'\)/);
  assert.match(readFileSync('components/english-patent-assistant.tsx', 'utf8'), /patent-research\?lang=en/);
});

void test('tag redirect preserves a configured origin pathname and records one anonymous event', async () => {
  let events = 0;
  const route = loadRouteFixture(new URL('../app/t/[tagId]/route.ts', import.meta.url), new Map([
    ['@/lib/fund-store', { database: () => ({}) }],
    ['@/lib/campus', { CampusError, campusTagId, safeRelativeCampusDestination }],
    ['@/lib/campus-store', { campusStore: () => ({
      resolveTag: async () => ({ tagId: 'columbia-sky-0001', destination: '/sky/campus/columbia', active: 1 }),
      recordTagEvent: async () => { events += 1; return true; },
    }) }],
  ]));
  const response = await route.GET(new Request('https://fixture.invalid/t/columbia-sky-0001?source=qr'), { params: Promise.resolve({ tagId: 'columbia-sky-0001' }) });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://fixture.invalid/sky/campus/columbia?source=qr');
  assert.equal(events, 1);
});

void test('patent research rejects every Columbia card query marker before downstream calls', async () => {
  const calls = [];
  class FixtureLlmProviderError extends Error {}
  const route = loadRouteFixture(new URL('../app/api/patent-research/route.ts', import.meta.url), new Map([
    ['cloudflare:workers', { env: {} }],
    ['@/lib/llm-providers', { createOpenAiResponse: () => { calls.push('provider'); throw new Error('must not run'); }, LlmProviderError: FixtureLlmProviderError }],
    ['@/lib/fund-store', { database: () => { calls.push('database'); throw new Error('must not run'); } }],
    ['@/lib/patent-ai', { buildPatentAiRequest: () => { calls.push('build'); }, parsePatentAiResponse: () => { calls.push('parse'); }, validatePatentAiInput: () => { calls.push('validate'); } }],
    ['@/lib/remote-ai-guard', { authorizeRemoteAiRequest: async () => { calls.push('auth'); }, RemoteAiGuardError: class extends Error {} }],
    ['@/lib/rockstar-service-access', { missingRockstarServiceScope: () => { calls.push('scope'); }, rockstarServiceScopeAllowed: async () => { calls.push('entitlement'); return true; } }],
    ['@/lib/remote-ai-pricing-gate', { remoteAiPricingGateAccepted: () => { calls.push('pricing'); return true; }, remoteAiPricingUnavailable: () => { calls.push('pricing-unavailable'); } }],
    ['@/lib/sky-campus', { isColumbiaCardEntry: (value) => value === 'columbia-card' }],
  ]));
  for (const request of [
    new Request('https://fixture.invalid/api/patent-research?entry=columbia-card', { method: 'POST', body: JSON.stringify({}) }),
    new Request('https://fixture.invalid/api/patent-research?entry=other&entry=columbia-card', { method: 'POST', body: JSON.stringify({}) }),
  ]) {
    const response = await route.POST(request);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'card_entry_restricted');
  }
  assert.deepEqual(calls, []);
});
