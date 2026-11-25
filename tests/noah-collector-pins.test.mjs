import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openCollectorStore } from '../scripts/noah-collector-store.mjs';
import { addCollectorPins, collectorPinFilter, createNoahPinWriter, NOAH_PIN_LIMITS, NOAH_PIN_MODEL, prepareCollectorPins, writeCollectorPins } from '../scripts/noah-collector-pins.mjs';
import { validateNoahPinGrounding } from '../lib/noah-pin-writing.ts';
import { noahIntakeExport, noahIntakeImport } from '../lib/noah-intake-import.ts';
import { world, familyId, hostOf } from './fixtures/noah/connect-world.mjs';
import { mcpServer, tool } from './fixtures/noah/mcp-server.mjs';

const NOW = Date.UTC(2026, 10, 25);
const pin = { title: '天気を調べる', give: '都市名', get: '天気予報', scene: { template: 'concentric', labels: ['都市', '天気予報'], parts: [], variant: null } };
const collection = (summary = '都市の天気予報を返します。') => [{ items: [{ id: 'weather', source: 'github', name: 'Weather', summary, expiresAt: NOW + 1000 }] }];

function setup(t) {
  const directory = mkdtempSync(join(tmpdir(), 'noah-pin-writer-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

void test('a writer receives a strict projection and the approved 17 examples, retries malformed output once and deduplicates after restart', async (t) => {
  const directory = setup(t), clock = () => NOW;
  let local = openCollectorStore(directory, { now: clock });
  let attempts = 0;
  const snapshots = collection();
  const writer = async ({ instructions, source, error }) => {
    assert.equal(instructions.match(/"reason":/gu).length, 17);
    assert.match(instructions, /札の字の上限/u);
    assert.deepEqual(source, { name: 'Weather', summary: snapshots[0].items[0].summary, tools: [] });
    attempts++;
    if (attempts === 1) return '{"title":"壊れた形"}';
    if (attempts === 2) assert.match(error, /形式/u);
    return JSON.stringify(pin);
  };
  const run = () => writeCollectorPins({ local, snapshots, writer, now: clock });
  prepareCollectorPins(local);
  assert.equal((await run()).written, 1);
  local.close();
  local = openCollectorStore(directory, { now: clock });
  t.after(() => local.close());
  prepareCollectorPins(local);
  assert.equal((await run()).attempts, 0);
  addCollectorPins(local, snapshots, { candidates: [] });
  assert.deepEqual(snapshots[0].items[0].pin, pin);
  snapshots[0].items[0].summary = '京都の天気を確認できます。';
  assert.equal((await run()).attempts, 1);
  assert.equal(attempts, 3);
});

void test('the monthly reservation survives restart, and invalid labels cannot introduce numbers', async (t) => {
  const directory = setup(t);
  const local = openCollectorStore(directory, { now: () => NOW });
  t.after(() => local.close());
  prepareCollectorPins(local);
  const bad = { ...pin, get: '120件の予報', scene: { ...pin.scene, labels: ['都市', '120件'] } };
  assert.match(validateNoahPinGrounding(bad, { name: 'Weather', summary: '都市の天気予報', tools: [] }), /数や日付/u);
  const snapshots = collection();
  const writer = async () => JSON.stringify(bad);
  const result = await writeCollectorPins({ local, snapshots, writer, now: () => NOW });
  assert.equal(result.attempts, 2);
  assert.equal(result.invalid, 1);
  const after = await writeCollectorPins({ local, snapshots: collection('都市の最新の天気予報'), writer, now: () => NOW,
    limits: { ...NOAH_PIN_LIMITS, monthMicroUsd: result.reservedMicroUsd } });
  assert.equal(after.monthStopped, 1);
  assert.equal(after.attempts, 0);
  assert.equal((await writeCollectorPins({ local, snapshots: collection('別の説明'), writer, now: () => NOW,
    limits: { ...NOAH_PIN_LIMITS, perRun: 0 } })).perRunStopped, 1);
});

void test('a listed registry candidate waits for the matching handshake and a tool edit invalidates its export', async (t) => {
  const source = await world(t, { [hostOf(1)]: mcpServer({ tools: [tool('weather')] }) });
  const now = source.f.time;
  const local = openCollectorStore(setup(t), { now });
  t.after(() => local.close());
  const capture = prepareCollectorPins(local);
  const original = await noahIntakeExport(source.f.db, now());
  await noahIntakeImport(local.db, original, now());
  let observed;
  const writer = async ({ source }) => { observed = source; return JSON.stringify(pin); };
  const run = () => writeCollectorPins({ local, snapshots: [], writer, now });
  assert.equal((await run()).waitingForTools, 1);
  const tags = Array.from({ length: 22 }, (_, index) => ({ name: `weather_${index}`, description: '都市の天気予報', inputSchema: { excluded: true } }));
  await capture({ candidateId: familyId(1), toolsSha256: original.checks[0].tools_sha256, tools: tags });
  assert.equal((await run()).written, 1);
  assert.equal(observed.tools.length, 20);
  assert.deepEqual(Object.keys(observed.tools[0]), ['name', 'description']);
  const exportPins = () => noahIntakeExport(local.db, now(), { includePinFor: collectorPinFilter(local) });
  assert.equal((await exportPins()).candidates[0].pin_json, JSON.stringify(pin));
  await capture({ candidateId: familyId(1), toolsSha256: original.checks[0].tools_sha256, tools: [{ ...tags[0], description: '都市の天気予報を検索します。' }] });
  assert.equal((await exportPins()).candidates[0].pin_json, undefined);
  assert.equal((await run()).written, 1);
  assert.equal((await run()).attempts, 0);
});

void test('the API request has no tools and sends a single projected source to the fixed HTTPS endpoint', async () => {
  const fakeKey = 'test-model-key';
  const source = { name: 'Weather', summary: '天気予報', tools: [] };
  const writer = createNoahPinWriter(fakeKey, async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, `Bearer ${fakeKey}`);
    const body = JSON.parse(options.body);
    assert.equal(body.model, NOAH_PIN_MODEL);
    assert.equal(body.store, false);
    assert.equal(body.tools, undefined);
    assert.deepEqual(JSON.parse(body.input), source);
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(pin) }] }] });
  });
  assert.deepEqual(JSON.parse(await writer({ instructions: 'JSON を返してください。', source })), pin);
});
