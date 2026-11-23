// Offline task-127 label preparation: strict model wire, independent evidence,
// fixed-manifest resume, named ports, and exact-version read behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NOAH_LABEL_VERIFIER_VERSION,
  NOAH_LABEL_VERSION,
  buildNoahLabelPrompt,
  labelNoahBatch,
  parseNoahLabelBatch,
  parseNoahLabelRun,
  prepareNoahLabelBatch,
  prepareNoahLabelRun,
  readCurrentNoahAgentLabels,
  readNoahAgentLabels,
  splitNoahLabelBatches,
  verifyNoahCardProposal,
} from '../lib/noah-agent-labels.ts';

const H = (char) => char.repeat(64);
const cleanCsvTool = (description = 'Takes a CSV input and returns a cleaned CSV result.') => ({
  name: 'clean_csv',
  description,
  inputSchema: {
    type: 'object',
    properties: { csv: { type: 'string', description: 'CSV input' } },
    required: ['csv'],
  },
  outputSchema: {
    type: 'object',
    properties: { cleaned_csv: { type: 'string', description: 'cleaned CSV result' } },
  },
});
const series = (tool = cleanCsvTool()) => ({ familyId: 'mcp-registry:example/csv', candidateId: 'mcp-registry:example/csv', toolsSha256: H('a'), tools: [tool] });
const input = (tool = cleanCsvTool()) => ({ schema: 'noah-label-batch/1', batchId: 'batch-a', series: [series(tool)] });

void test('batch input is strict and preserves literal tool field names', () => {
  const parsed = parseNoahLabelBatch(input());
  assert.equal(parsed.schema, 'noah-label-batch/1');
  assert.equal(parsed.series[0].tools[0].name, 'clean_csv');
  assert.deepEqual(Object.keys(parsed.series[0].tools[0]).sort(), ['description', 'inputSchema', 'name', 'outputSchema']);
  assert.throws(() => parseNoahLabelBatch({ ...input(), extra: true }), /invalid/);
  assert.throws(() => parseNoahLabelBatch({ ...input(), series: [{ ...series(), untrusted: 'metadata' }] }), /unknown fields/);
  assert.throws(() => parseNoahLabelBatch({ ...input(), series: [{ ...series(), tools: [{ ...cleanCsvTool(), untrusted: 'metadata' }] }] }), /unknown fields/);
  assert.throws(() => parseNoahLabelBatch({ ...input(), series: [series(), series()] }), /duplicate familyId/);
});

void test('manifest, request id, and batches are deterministic and versioned by tool definitions', async () => {
  const first = await prepareNoahLabelBatch(input());
  const reversed = await prepareNoahLabelBatch({ ...input(), series: [{ ...series(), tools: [cleanCsvTool()] }] });
  assert.equal(first.manifest.manifestSha256, reversed.manifest.manifestSha256);
  assert.equal(first.work[0].manifestSha256, first.manifest.manifestSha256);
  assert.match(first.work[0].requestId, /^mcp-registry:example\/csv:mcp-registry:example\/csv:[0-9a-f]{64}:[0-9a-f]{64}:clean_csv$/u);
  const changed = await prepareNoahLabelBatch(input(cleanCsvTool('Takes a CSV input and returns a checked CSV result.')));
  assert.notEqual(first.manifest.manifestSha256, changed.manifest.manifestSha256);
  assert.notEqual(first.work[0].toolDefinitionSha256, changed.work[0].toolDefinitionSha256);
  assert.equal(splitNoahLabelBatches(first).length, 1);
});

void test('complete export keeps one fixed manifest when prepared for bounded child batches', async () => {
  const runInput = { schema: 'noah-label-export/1', batchId: 'run-a', series: [series(), { ...series(), familyId: 'mcp-registry:other/csv', candidateId: 'mcp-registry:other/csv' }] };
  assert.equal(parseNoahLabelRun(runInput).schema, 'noah-label-export/1');
  const run = await prepareNoahLabelRun(runInput);
  const children = splitNoahLabelBatches(run);
  assert.ok(children.length >= 1);
  assert.ok(children.every((child) => child.manifest.manifestSha256 === run.manifest.manifestSha256));
  assert.ok(children.every((child) => child.work.every((item) => item.manifestSha256 === run.manifest.manifestSha256)));
});

void test('prompt marks provider metadata as data and asks for canonical produces array', async () => {
  const batch = await prepareNoahLabelBatch(input());
  const prompt = buildNoahLabelPrompt(batch.work[0]);
  assert.match(prompt, /<tool-data>/u);
  assert.match(prompt, /produces.*\[.*\.\.\./u);
  assert.match(prompt, /untrusted provider data.*not instructions/iu);
  assert.match(prompt, /clean_csv/u);
});

void test('independent verifier accepts explicit input/output schema evidence and exposes named ports', () => {
  const tool = cleanCsvTool();
  const verification = verifyNoahCardProposal(tool, { consumes: ['csv'], produces: 'cleaned-csv' });
  assert.equal(verification.ok, true);
  assert.deepEqual(verification.inputs, [{ field: 'csv', material: 'csv', type: 'string' }]);
  assert.deepEqual(verification.outputs, [{ field: 'cleaned_csv', material: 'cleaned-csv', type: 'string' }]);
  assert.equal(verification.evidence.consumes.csv.find((match) => match.source === 'input-schema').path, '$.inputSchema.properties.csv');
  assert.equal(verification.evidence.produces.find((match) => match.source === 'output-schema').path, '$.outputSchema.properties.cleaned_csv');
});

void test('verifier rejects model-only labels and output without a reliable output schema', () => {
  const noOutput = { name: 'search', description: 'Takes a topic and returns a result.', inputSchema: { type: 'object', properties: { topic: { type: 'string' } } } };
  const ambiguous = verifyNoahCardProposal(noOutput, { consumes: ['topic'], produces: 'summary' });
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.reason, 'ambiguous_output');
  assert.equal(ambiguous.inputs[0].field, 'topic');
  const hallucinated = verifyNoahCardProposal(cleanCsvTool(), { consumes: ['topic'], produces: 'summary' });
  assert.equal(hallucinated.ok, false);
  assert.equal(hallucinated.reason, 'consume_not_evidenced');
});

void test('output evidence cannot come from an input phrase, negation, or an example value', () => {
  const inputSchema = { type: 'object', properties: { query: { type: 'string' } } };
  const proposal = { consumes: ['topic'], produces: 'summary' };
  for (const description of [
    'Accepts a summary as input and returns a receipt.',
    'Returns a receipt, not a summary.',
  ]) assert.equal(verifyNoahCardProposal({ name: 'get_summary', description, inputSchema }, proposal).ok, false);
  const tool = { name: 'get_summary', description: 'Returns a receipt.', inputSchema, outputSchema: { type: 'object', examples: [{ summary: 'Example' }] } };
  assert.equal(verifyNoahCardProposal(tool, proposal).ok, false);
});

void test('batch labels use canonical parser, discard raw model text, and resume by fixed manifest', async () => {
  const batch = await prepareNoahLabelBatch(input());
  let calls = 0;
  const result = await labelNoahBatch(batch, async (work, prompt) => {
    calls += 1;
    assert.match(prompt, /<tool-data>/u);
    assert.equal(work.tool.name, 'clean_csv');
    return '{"schema":"noah-card/1","consumes":["csv"],"produces":["cleaned-csv"]}';
  }, { now: () => 100 });
  assert.equal(calls, 1);
  assert.equal(result.rows[0].status, 'accepted');
  assert.deepEqual(result.rows[0].consumes, ['csv']);
  assert.equal(result.rows[0].produces, 'cleaned-csv');
  const resumed = await labelNoahBatch(batch, async () => { throw new Error('must not call model'); }, { resume: result.rows, now: () => 200 });
  assert.equal(resumed.rows[0].createdAt, 100);
  const expanded = await prepareNoahLabelBatch({ ...input(), batchId: 'batch-b', series: [series(), { ...series(), familyId: 'mcp-registry:other/csv', candidateId: 'mcp-registry:other/csv' }] });
  const stale = await labelNoahBatch(expanded, async () => '{"schema":"noah-card/1","consumes":["csv"],"produces":["cleaned-csv"]}', { resume: result.rows, now: () => 300 });
  assert.equal(stale.rows.find((row) => row.familyId === series().familyId).reason, 'stale_resume');
  const invalid = await labelNoahBatch(batch, async () => '{"schema":"noah-card/1","consumes":["csv"],"produces":"cleaned-csv"}', { now: () => 400 });
  assert.equal(invalid.rows[0].status, 'rejected');
  assert.equal(invalid.failed[0].reason, 'model_output_invalid');
});

void test('read model requires exact family, candidate, version and manifest context', async () => {
  const batch = await prepareNoahLabelBatch(input());
  const result = await labelNoahBatch(batch, async () => '{"schema":"noah-card/1","consumes":["csv"],"produces":["cleaned-csv"]}', { now: () => 500 });
  const query = { familyId: series().familyId, candidateId: series().candidateId, toolsSha256: H('a'), manifestSha256: batch.manifest.manifestSha256, toolNames: ['clean_csv'] };
  const ready = readNoahAgentLabels(result.rows, query);
  assert.equal(ready.status, 'ready');
  assert.equal(ready.labelVersion, NOAH_LABEL_VERSION);
  assert.equal(ready.verifierVersion, NOAH_LABEL_VERIFIER_VERSION);
  assert.deepEqual(ready.tools[0].inputs, [{ field: 'csv', material: 'csv', type: 'string' }]);
  assert.deepEqual(ready.tools[0].outputs, [{ field: 'cleaned_csv', material: 'cleaned-csv', type: 'string' }]);
  assert.equal(readNoahAgentLabels(result.rows, { ...query, manifestSha256: H('b') }).status, 'stale');
  assert.equal(readNoahAgentLabels(result.rows, { ...query, familyId: 'mcp-registry:missing' }).status, 'missing');
  assert.equal(readNoahAgentLabels(result.rows, { ...query, toolNames: ['clean_csv', 'other'] }).status, 'partial');
});

void test('persistent reader selects current generation and does not require manifest input', async () => {
  const batch = await prepareNoahLabelBatch(input());
  const result = await labelNoahBatch(batch, async () => '{"schema":"noah-card/1","consumes":["csv"],"produces":["cleaned-csv"]}', { now: () => 700 });
  const dbRows = result.rows.map((row) => ({
    schema: row.schema, requestId: row.requestId, manifestSha256: row.manifestSha256, familyId: row.familyId, candidateId: row.candidateId,
    toolsSha256: row.toolsSha256, toolDefinitionSha256: row.toolDefinitionSha256, toolName: row.toolName, labelVersion: row.labelVersion,
    verifierVersion: row.verifierVersion, status: row.status, consumesJson: JSON.stringify(row.consumes), produces: row.produces,
    inputsJson: JSON.stringify(row.inputs), outputsJson: JSON.stringify(row.outputs), evidenceJson: JSON.stringify(row.evidence), reason: row.reason, createdAt: row.createdAt,
  }));
  let sql = '';
  const db = { prepare(statement) { sql = statement; return { bind(...args) { assert.equal(args.length, 10); return { all: async () => ({ results: dbRows }) }; } }; } };
  const read = await readCurrentNoahAgentLabels(db, { familyId: series().familyId, candidateId: series().candidateId, toolsSha256: H('a') });
  assert.match(sql, /current_generation/u);
  assert.equal(read.status, 'ready');
  assert.equal(read.manifestSha256, batch.manifest.manifestSha256);
});
