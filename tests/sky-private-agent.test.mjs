import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSkyPrivateAgentAdd, parseSkyPrivateAgentSpec, skyPrivateAgentDigest, skyPrivateAgentMatchesRequest } from '../lib/sky-private-agent.ts';

const fit = { surface: 'macos.zoom.chat', inputSource: 'manual.text', returnSlot: 'host.chat-draft' };
const recipe = { schema: 'sky.private-zoom-recipe/1', name: '会議メモ', purpose: '本人だけの会議から決定と担当を整理',
  outputs: ['summary', 'decisions', 'owners'], summaryLines: 2, decisionLabel: '決定', ownerLabel: '担当' };
const spec = { schema: 'sky.private-agent/1', recipe, fits: [fit], execution: 'bounded-text-adapter',
  declaredChargeMinor: 0, externalSend: false };

void test('private Agent keeps a fixed no-send, no-charge, bounded host contract', () => {
  const parsed = parseSkyPrivateAgentSpec(spec);
  assert.equal(parsed.fits[0].returnSlot, 'host.chat-draft');
  for (const mutation of [
    { externalSend: true }, { declaredChargeMinor: 1 }, { execution: 'shell' },
    { fits: [{ ...fit, returnSlot: 'host.chat-message' }] },
    { permissions: ['root'] },
  ]) assert.throws(() => parseSkyPrivateAgentSpec({ ...spec, ...mutation }));
});

void test('private Agent contract accepts Planner without Zoom recipe and rejects a mismatched host', () => {
  const browser = { surface: 'browser.preview', inputSource: 'manual.text', returnSlot: 'embedded.private' };
  const planner = parseSkyPrivateAgentSpec({ ...spec, appId: 'planner', recipe: undefined, fits: [browser] });
  assert.equal(planner.appId, 'planner');
  assert.equal(planner.recipe, undefined);
  assert.throws(() => parseSkyPrivateAgentSpec({ ...spec, appId: 'planner', fits: [browser] }));
  assert.throws(() => parseSkyPrivateAgentSpec({ ...spec, appId: 'planner', recipe: undefined, fits: [fit] }));
  const notes = parseSkyPrivateAgentSpec({ ...spec, appId: 'notes', fits: [browser] });
  assert.equal(notes.appId, 'notes');
  assert.throws(() => parseSkyPrivateAgentSpec({ ...spec, appId: 'notes', fits: [fit] }));
});

void test('an Add for manual notes cannot authorize Zoom or Planner jobs', () => {
  const browser = { surface: 'browser.preview', inputSource: 'manual.text', returnSlot: 'embedded.private' };
  const notesSpec = parseSkyPrivateAgentSpec({ ...spec, appId: 'notes', fits: [browser] });
  const request = { schema: 'sky.app-request/1', appId: 'notes', sourceId: 'memo-1', sourceRevision: '1',
    title: recipe.name, objective: recipe.purpose, input: '決定: 月曜', recipe };
  assert.equal(skyPrivateAgentMatchesRequest(notesSpec, request), true);
  assert.equal(skyPrivateAgentMatchesRequest(notesSpec, { ...request, appId: 'zoom' }), false);
  const { recipe: _recipe, ...plannerRequest } = request;
  assert.equal(skyPrivateAgentMatchesRequest(notesSpec, { ...plannerRequest, appId: 'planner' }), false);
  assert.equal(skyPrivateAgentMatchesRequest(notesSpec, { ...request, recipe: { ...recipe, summaryLines: 3 } }), false);
});

void test('Add is bound to owner, exact Agent revision and exact host fit', async () => {
  const parsed = parseSkyPrivateAgentSpec(spec), digest = await skyPrivateAgentDigest('owner-A', 'agent-1', 1, parsed);
  const agent = { id: 'agent-1', ownerUserId: 'owner-A', revision: 1, digest, spec: parsed, status: 'active', createdAt: 1, updatedAt: 1 };
  const add = { id: 'add-1', ownerUserId: 'owner-A', agentId: agent.id, agentRevision: 1, agentDigest: digest,
    fit, status: 'added', createdAt: 1, updatedAt: 1 };
  assert.equal(evaluateSkyPrivateAgentAdd('owner-A', agent, add, fit), 'candidate-only');
  assert.equal(evaluateSkyPrivateAgentAdd('owner-B', agent, add, fit), 'owner-mismatch');
  assert.equal(evaluateSkyPrivateAgentAdd('owner-A', { ...agent, revision: 2 }, add, fit), 'agent-version-changed');
  assert.equal(evaluateSkyPrivateAgentAdd('owner-A', agent, { ...add, status: 'removed' }, fit), 'add-removed');
  assert.equal(evaluateSkyPrivateAgentAdd('owner-A', agent, add,
    { surface: 'macos.zoom.chat', inputSource: 'manual.text', returnSlot: 'embedded.private' }), 'host-fit-changed');
  assert.equal(evaluateSkyPrivateAgentAdd('owner-A', { ...agent, status: 'revoked' }, add, fit), 'agent-unavailable');
  assert.notEqual(await skyPrivateAgentDigest('owner-B', 'agent-1', 1, parsed), digest);
});
