import test from 'node:test';
import assert from 'node:assert/strict';
import { noahAgentToolListExplanation, noahToolFieldLabel, NOAH_TOOL_CHOICE_NOTE } from '../lib/noah-agent-explanation.ts';
import { noahCatalogTools } from '../lib/noah-tool-catalog.ts';
import { noahBlueprintLevels, noahBlueprintWaitProblem } from '../lib/noah-steps.ts';

const tools = [
  { name: 'search_cars', inputs: [{ field: 'query', type: 'string', required: true }, { field: 'page', type: 'integer', required: false }], outputs: null },
  { name: 'get_car', inputs: [{ field: 'car_id', type: 'string', required: true }], outputs: [{ field: 'price', type: 'number', required: true }] },
  { name: 'list_markets', inputs: [], outputs: null },
];

void test('labelless agents list every defined tool after the request, with no invented wires', () => {
  const flow = noahAgentToolListExplanation([], tools);
  assert.ok(flow);
  assert.equal(noahBlueprintWaitProblem(flow.steps), null);
  const levels = noahBlueprintLevels(flow.steps).map((level) => level.map((s) => s.label));
  assert.deepEqual(levels, [['接続'], ['依頼する'], ['search_cars', 'get_car', 'list_markets']]);
  const steps = flow.steps.filter((s) => s.id.startsWith('tool:'));
  for (const s of steps) {
    assert.equal(s.kind, 'auto');
    assert.deepEqual(s.after, ['usage:request']);
    assert.equal(s.flow?.dataFrom, undefined, 'no wire between tools without labels');
    assert.equal(s.waitNote, NOAH_TOOL_CHOICE_NOTE);
  }
  assert.deepEqual(steps[0].flow?.inputs, ['query（文字）', 'page（数・任意）']);
  assert.equal(steps[0].flow?.outputs, undefined, 'missing outputSchema stays unconfirmed');
  assert.deepEqual(steps[1].flow?.outputs, ['price（数）']);
  assert.deepEqual(steps[2].flow?.inputs, []);
  assert.equal(flow.ioSummary, false);
  assert.equal(flow.showMaterials, undefined, 'per-tool inputs are shown');
});

void test('field labels use only the schema name and type', () => {
  assert.equal(noahToolFieldLabel({ field: 'zip', type: null, required: false }), 'zip（任意）');
  assert.equal(noahToolFieldLabel({ field: 'tags', type: 'array', required: true }), 'tags（一覧）');
  assert.equal(noahToolFieldLabel({ field: 'x', type: 'weird', required: true }), 'x（weird）');
});

void test('duplicate or empty tool lists fall back to the connection steps', () => {
  assert.equal(noahAgentToolListExplanation([], []), null);
  assert.equal(noahAgentToolListExplanation([], [tools[0], tools[0]]), null);
});

void test('the catalog is used only when the live definition hash and count match', () => {
  const id = 'mcp-registry:ai.carfinity/marketplace';
  const sha = '061ada28fe167a55959d5dc222b007e0a7e008c6a9bf6d3307b91714cfc2820e';
  const listed = noahCatalogTools(id, { toolsSha256: sha, toolCount: 7 });
  assert.equal(listed?.length, 7);
  assert.ok(listed?.some((t) => t.name === 'search_cars'));
  assert.equal(noahCatalogTools(id, { toolsSha256: 'f'.repeat(64), toolCount: 7 }), null, 'changed definitions');
  assert.equal(noahCatalogTools(id, { toolsSha256: sha, toolCount: 8 }), null, 'changed count');
  assert.equal(noahCatalogTools(id, { toolsSha256: sha, toolCount: null }), null, 'missing live count');
  assert.equal(noahCatalogTools(id, { toolsSha256: null, toolCount: null }), null);
  assert.equal(noahCatalogTools('mcp-registry:unknown/agent', { toolsSha256: sha, toolCount: 7 }), null);
  assert.equal(noahCatalogTools('constructor', { toolsSha256: sha, toolCount: 7 }), null, 'no prototype keys');
});

void test('each level says in words what happens there, and tools carry the provider sentence', async () => {
  const { noahExplanationLevelTitle, NOAH_CONNECT_NOTE, NOAH_REQUEST_NOTE } = await import('../lib/noah-agent-explanation.ts');
  const flow = noahAgentToolListExplanation([], [
    { name: 'find', summary: 'Find things.', inputs: [{ field: 'b', type: 'string', required: false }, { field: 'a', type: 'string', required: true }], outputs: null },
    { name: 'list', inputs: [], outputs: null },
  ]);
  const levels = noahBlueprintLevels(flow.steps);
  assert.deepEqual(levels.map(noahExplanationLevelTitle), ['つなぐ', '頼む', 'Agent が道具を使う（2つから選ぶ）']);
  assert.equal(levels[0][0].note, NOAH_CONNECT_NOTE);
  assert.equal(levels[1][0].note, NOAH_REQUEST_NOTE);
  assert.equal(levels[2][0].note, 'Find things.');
  assert.equal(levels[2][1].note, undefined, 'no sentence is invented when the provider wrote none');
  assert.deepEqual(levels[2][0].flow?.inputs, ['a（文字）', 'b（文字・任意）'], 'required fields come first');
});

void test('owner setup before connecting is titled as preparation', async () => {
  const { noahExplanationLevelTitle } = await import('../lib/noah-agent-explanation.ts');
  assert.equal(noahExplanationLevelTitle([{ id: 'connect:0', kind: 'human', label: 'API_KEY を入力' }]), 'つなぐ前の準備');
  assert.equal(noahExplanationLevelTitle([{ id: 'other', kind: 'auto', label: 'x' }]), null);
});
