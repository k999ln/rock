import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { noahAgentExplanation, noahExplanationWithConnection, noahShelfExplanation } from '../lib/noah-agent-explanation.ts';
import { noahBlueprintLevels } from '../lib/noah-steps.ts';
import { planNoahConnection } from '../lib/noah-connect-plan.ts';
import { noahLaunchPlanState } from '../lib/noah-connect-source.ts';
import { createIntakeApi } from '../lib/noah-intake-api.ts';
import { readNoahAgentExplanation } from '../lib/noah-explanation-source.ts';
import { labelNoahBatch, prepareNoahLabelBatch } from '../lib/noah-agent-labels.ts';
import { parseNoahFlags } from '../lib/noah-flags.ts';
import { entry, fixture, markListed, page } from './fixtures/noah/intake.mjs';
import { renderNoahExplanationFixture, NOAH_EXPLANATION_FIXTURES } from './fixtures/noah/explanation-markup.mjs';

const chain = [
  { name: 'check_csv', consumes: ['cleaned-csv'], produces: 'checked-csv', inputs: [{ field: 'csv', material: 'cleaned-csv', type: 'string' }] },
  { name: 'clean_csv', consumes: ['csv'], produces: 'cleaned-csv', outputs: [{ field: 'csv', material: 'cleaned-csv', type: 'string' }] },
  { name: 'make_summary', consumes: ['notes'], produces: 'summary' },
];
const levelNames = (flow) => noahBlueprintLevels(flow.steps).map((level) => level.map(({ label }) => label));

void test('one tool describes its verified input and output, and absent or ambiguous labels do not produce an invented flow', () => {
  const flow = noahAgentExplanation([{ name: 'make_summary', consumes: ['notes'], produces: 'summary' }], []);
  assert.deepEqual(levelNames(flow), [['make_summary']]);
  assert.deepEqual(flow.consumes, ['notes']);
  assert.deepEqual(flow.produces, ['summary']);
  assert.equal(noahAgentExplanation([], []), null);
  assert.equal(noahAgentExplanation([chain[0], chain[0]], []), null);
  const cycle = [{ name: 'clean', consumes: ['checked-csv'], produces: 'cleaned-csv' }, { name: 'check', consumes: ['cleaned-csv'], produces: 'checked-csv' }];
  assert.equal(noahAgentExplanation(cycle, []), null);
});

void test('dependencies are ordered by evidence, leaving unrelated tools in the first stage', () => {
  const flow = noahAgentExplanation(chain, []);
  assert.deepEqual(levelNames(flow), [['clean_csv', 'make_summary'], ['check_csv']]);
  assert.deepEqual(flow.consumes, ['csv', 'notes']);
  assert.deepEqual(flow.produces, ['checked-csv', 'summary']);
  assert.match(flow.steps.at(-1).waitNote, /前の工程/);
  const generic = [{ name: 'write', consumes: ['notes'], produces: 'text' }, { name: 'review', consumes: ['text'], produces: 'feedback' }];
  assert.deepEqual(levelNames(noahAgentExplanation(generic, [])), [['write', 'review']]);
  generic[0].outputs = generic[1].inputs = [{ field: 'draft', material: 'text', type: 'string' }];
  assert.deepEqual(levelNames(noahAgentExplanation(generic, [])), [['write'], ['review']]);
});

void test('a required key comes from the connection plan and disappears after connecting', () => {
  const req = { surface: 'none', places: ['provider'], services: [], secrets: ['API_KEY'], model: { use: 'none' } };
  const state = noahLaunchPlanState({ signedIn: true, connectSha256: 'a'.repeat(64), level: 1, consentedSha256: null });
  const flow = noahAgentExplanation(chain.slice(0, 2), planNoahConnection(req, state).steps);
  assert.deepEqual(levelNames(flow), [['API_KEY を入力'], ['clean_csv'], ['check_csv']]);
  assert.equal(flow.steps[0].kind, 'human');
  const connected = noahExplanationWithConnection(flow, true);
  assert.deepEqual(levelNames(connected), [['clean_csv'], ['check_csv']]);
  assert.equal(connected.steps[0].waitNote, undefined);
  assert.ok(connected.steps[1].waitNote);
});

void test('a shelf package waits on its declared material flow and omits a missing work step', () => {
  const packageDefinition = { have: ['csv'], want: 'checked-csv', steps: [
    { ref: { kind: 'family', tool: 'clean_csv' }, consumes: ['csv'], produces: 'cleaned-csv' },
    { ref: { kind: 'owner', label: '同意を確かめる' }, consumes: ['cleaned-csv'], produces: 'checked-csv' },
  ] };
  const flow = noahShelfExplanation(packageDefinition);
  assert.deepEqual(levelNames(flow), [['clean_csv'], ['同意を確かめる']]);
  assert.equal(flow.steps.at(-1).kind, 'human');
  assert.ok(flow.steps.at(-1).reason);
  assert.equal(noahShelfExplanation({ ...packageDefinition, steps: [{ ...packageDefinition.steps[0], ref: { kind: 'gap', note: '未確定' } }] }), null);
});

void test('Agent detail only consults the explanation store for permitted viewers; store failure preserves detail', async (t) => {
  const f = fixture(t, async () => page([entry(1)]));
  await f.store.sync();
  markListed(f, 1);
  const request = new Request('https://noah.test/api/noah/intake?id=mcp-registry%3Atest.provider%2Fagent-1');
  const explanation = noahAgentExplanation([chain[2]], []);
  let reads = 0;
  const base = { ...f.deps, reviewers: ['reviewer'], flags: parseNoahFlags({ NOAH_INTAKE_PUBLIC: 'true' }),
    explainAgent: async () => { reads += 1; return { explanation, summaryJa: 'メモを要約します。' }; } };
  const guest = async () => { throw Error('UNAUTHORIZED'); };
  assert.equal((await (await createIntakeApi({ ...base, authenticate: guest })(request)).json()).explanation, undefined);
  assert.equal(reads, 0);
  const reviewer = createIntakeApi({ ...base, authenticate: async () => 'reviewer' });
  assert.deepEqual((await (await reviewer(request)).json()).explanation, explanation);
  assert.equal(reads, 1);
  const open = createIntakeApi({ ...base, explainPublic: true, authenticate: guest });
  assert.deepEqual((await (await open(request)).json()).explanation, explanation);
  const unavailable = createIntakeApi({ ...base, explainPublic: true, authenticate: guest, explainAgent: async () => { throw Error('no such table'); } });
  const response = await unavailable(request);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).explanation, undefined);
});

void test('the live detail read requires the representative, exact tools hash and a complete persisted generation', async (t) => {
  const f = fixture(t, async () => page([entry(1)]));
  await f.store.sync();
  markListed(f, 1);
  f.sql.exec(readFileSync(new URL('../docs/noah/drafts/0059_noah_intake_tool_labels.sql', import.meta.url), 'utf8'));
  const id = 'mcp-registry:test.provider/agent-1';
  const tool = {
    name: 'clean_csv', description: 'Takes a CSV input and returns a cleaned CSV result.',
    inputSchema: { type: 'object', properties: { csv: { type: 'string', description: 'CSV input' } } },
    outputSchema: { type: 'object', properties: { cleaned_csv: { type: 'string', description: 'cleaned CSV result' } } },
  };
  const batch = await prepareNoahLabelBatch({ schema: 'noah-label-batch/1', batchId: 'reader-fixture', series: [
    { familyId: id, candidateId: id, toolsSha256: 'a'.repeat(64), tools: [tool] },
  ] });
  const { rows: [row] } = await labelNoahBatch(batch, async () => '{"schema":"noah-card/1","consumes":["csv"],"produces":["cleaned-csv"]}');
  assert.equal(row.status, 'accepted');
  f.sql.prepare(`INSERT INTO noah_intake_tool_labels (schema,request_id,manifest_sha256,family_id,candidate_id,tools_sha256,tool_definition_sha256,
    tool_name,label_version,verifier_version,status,consumes_json,produces,inputs_json,outputs_json,evidence_json,reason,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(row.schema, row.requestId, row.manifestSha256, id, id, row.toolsSha256, row.toolDefinitionSha256,
    row.toolName, row.labelVersion, row.verifierVersion, row.status, JSON.stringify(row.consumes), row.produces, JSON.stringify(row.inputs),
    JSON.stringify(row.outputs), JSON.stringify(row.evidence), row.reason, row.createdAt);
  const read = () => readNoahAgentExplanation(f.db, { id, owner: null, reviewer: true });
  assert.equal(await read(), null, 'one of two definitions has labels');
  f.sql.prepare('UPDATE noah_intake_checks SET tool_count=1 WHERE candidate_id=?').run(id);
  f.sql.prepare('UPDATE noah_intake_candidates SET summary_ja=? WHERE id=?').run('CSV を整えます。', id);
  const current = await read();
  assert.deepEqual(current.explanation.produces, ['cleaned-csv']);
  assert.equal(current.summaryJa, 'CSV を整えます。');
  assert.deepEqual(levelNames(current.explanation), [['サインイン'], ['clean_csv']]);
  f.sql.prepare('UPDATE noah_intake_checks SET tools_sha256=? WHERE candidate_id=?').run('b'.repeat(64), id);
  assert.equal(await read(), null, 'old labels disappear after a different handshake hash');
});

void test('the ready detail renders the three scenarios after Connect with reasons and omits unlabelled diagrams', async () => {
  for (const sample of Object.keys(NOAH_EXPLANATION_FIXTURES)) {
    const body = await renderNoahExplanationFixture(sample);
    assert.match(body, /この Agent でできる事/);
    assert.ok(body.indexOf('>接続</button>') < body.indexOf('この Agent でできる事'));
    assert.ok(body.indexOf('この Agent でできる事') < body.indexOf('Agentの詳細'));
    assert.match(body, /渡す物.*返る物/);
    assert.match(body, /<details[^>]*class="step"/);
    assert.match(body, /待つ理由|本人が入る理由/);
  }
  const absent = await renderNoahExplanationFixture('single', { noLabels: true });
  assert.doesNotMatch(absent, /この Agent でできる事|工程の段/);
  assert.match(absent, /Agentの詳細/);
  const english = await renderNoahExplanationFixture('key', { locale: 'en' });
  assert.match(english, /What this Agent can do.*What you provide.*What you get back/);
  assert.match(english, /Enter API_KEY.*Why you’re needed/);
});

void test('the graph separates data links from setup waits and only joins genuine inputs', () => {
  const plan = [{ kind: 'secrets', state: 'needed', fill: 'typed', label: 'API_KEY を入力' }];
  const summary = { name: 'combine', consumes: ['checked-csv', 'summary'], produces: 'analysis' };
  const flow = noahAgentExplanation([...chain, summary], plan);
  const byName = new Map(flow.steps.map((step) => [step.label, step]));
  assert.deepEqual(byName.get('clean_csv').after, [byName.get('API_KEY を入力').id]);
  assert.deepEqual(byName.get('clean_csv').flow.dataFrom, []);
  assert.deepEqual(byName.get('check_csv').flow, {
    inputs: ['cleaned-csv'], outputs: ['checked-csv'],
    dataFrom: [{ from: byName.get('clean_csv').id, material: 'cleaned-csv' }], gate: true,
  });
  assert.deepEqual(byName.get('combine').flow.dataFrom, [
    { from: byName.get('check_csv').id, material: 'checked-csv' },
    { from: byName.get('make_summary').id, material: 'summary' },
  ]);
  assert.deepEqual(levelNames(noahExplanationWithConnection(flow, true)), [['clean_csv', 'make_summary'], ['check_csv'], ['combine']]);
});

void test('the detail exposes material labels and review wires before expanding a step', async () => {
  const body = await renderNoahExplanationFixture('chain');
  assert.match(body, /class="parallel">並行/);
  assert.match(body, /class="wire">整えた CSV<\/span><span class="gate">確認の関所/);
  assert.match(body, /class="portLabel">受け取る物<\/span>整えた CSV/);
  assert.match(body, /class="portLabel">返る物<\/span>検査を通った CSV/);
  assert.doesNotMatch(body, /分かれる条件|繰り返す条件|class="tag">まとめる/);
  const key = await renderNoahExplanationFixture('key', { locale: 'en' });
  assert.match(key, /class="portLabel">Input<\/span>Access key/);
  assert.doesNotMatch(key, /class="wire"/);
});
