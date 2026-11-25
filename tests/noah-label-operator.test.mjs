import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { noahLabelCaptureBatch } from '../lib/noah-intake-capture.ts';
import {
  buildNoahFamilyLabelPrompt,
  labelNoahFamily,
  parseNoahFamilyLabelReply,
} from '../lib/noah-label-operator.ts';
import {
  preflightNoahLabelRun,
  prepareNoahFamilyWork,
  runNoahLabelOperator,
} from '../scripts/noah-label-agent-tools.mjs';

const HASH = (value) => createHash('sha256').update(value).digest('hex');
const csvTool = {
  name: 'clean_csv',
  description: 'Takes a CSV input and returns a cleaned CSV result.',
  inputSchema: { type: 'object', properties: { csv: { type: 'string', description: 'CSV input' } } },
  outputSchema: { type: 'object', properties: { cleaned_csv: { type: 'string', description: 'cleaned CSV result' } } },
};
const topicTool = {
  name: 'summarize_topic',
  description: 'Takes a topic and returns a summary.',
  inputSchema: { type: 'object', properties: { topic: { type: 'string', description: 'topic to search' } } },
  outputSchema: { type: 'object', properties: { summary: { type: 'string', description: 'summary result' } } },
};
const family = (tools = [csvTool]) => ({
  familyId: 'mcp-registry:example/labels',
  candidateId: 'mcp-registry:example/labels',
  toolsSha256: 'a'.repeat(64),
  tools,
});
const labelReply = (tools) => JSON.stringify({ schema: 'noah-label-family-reply/1', tools: tools.map((tool) => ({ toolName: tool.name, proposal: tool.name === 'clean_csv' ? { schema: 'noah-card/1', consumes: ['csv'], produces: ['cleaned-csv'] } : { schema: 'noah-card/1', consumes: ['topic'], produces: ['summary'] } })) });

void test('family prompt contains one redacted tools/list payload and exposes the fixed material keys', () => {
  const value = family([{ ...csvTool, description: 'Returns CSV. token sk-test-abcdef123456 endpoint https://provider.example/x', inputSchema: { ...csvTool.inputSchema, properties: { csv: { type: 'string', default: 'ghp_secret_value_123456789' } } } }]);
  const first = buildNoahFamilyLabelPrompt(value);
  const second = buildNoahFamilyLabelPrompt(value);
  assert.equal(first, second);
  assert.match(first, /<redacted-tools-list>/u);
  assert.match(first, /csv=CSV/u);
  assert.doesNotMatch(first, /sk-test-abcdef123456|ghp_secret_value_123456789|https:\/\/provider\.example/u);
  assert.equal((first.match(/<redacted-tools-list>/gu) ?? []).length, 1);
});

void test('family reply requires the canonical per-tool card wire', () => {
  assert.deepEqual(parseNoahFamilyLabelReply(labelReply([csvTool]), [csvTool])[0].proposal, { consumes: ['csv'], produces: 'cleaned-csv' });
  assert.throws(() => parseNoahFamilyLabelReply(JSON.stringify({ schema: 'noah-label-family-reply/1', tools: [{ toolName: 'clean_csv', proposal: { schema: 'noah-card/1', consumes: ['csv'], produces: 'cleaned-csv' } }] }), [csvTool]), /proposal_parse_invalid/u);
});

void test('family gate requires deterministic evidence and at least two verifier judgments', async () => {
  const tools = [csvTool, topicTool];
  const result = await labelNoahFamily(family(tools), {
    label: async () => labelReply(tools),
    verifier: async () => JSON.stringify({ schema: 'noah-label-verifier-reply/1', judgments: [
      { toolName: 'clean_csv', input: true, output: true, noInventedWords: false },
      { toolName: 'summarize_topic', input: false, output: false, noInventedWords: true },
    ] }),
  }, { now: () => 123 });
  assert.equal(result.status, 'partial');
  assert.equal(result.acceptedTools, 1);
  assert.equal(result.rejectCounts.verifier_input, 1);
  assert.equal(result.rejectCounts.verifier_output, 1);
  assert.equal(result.rejectCounts.verifier_insufficient_judgments, 1);
  assert.equal(result.rows.find((row) => row.toolName === 'clean_csv').status, 'accepted');
  assert.equal(result.rows.find((row) => row.toolName === 'summarize_topic').status, 'rejected');
});

void test('one malformed card does not erase a verified card in the same family', async () => {
  const example = family([csvTool, topicTool]);
  const reply = JSON.parse(labelReply(example.tools));
  reply.tools[1].proposal.produces = ['topic'];
  const receipt = await labelNoahFamily(example, {
    label: async () => JSON.stringify(reply),
    verifier: async () => JSON.stringify({ schema: 'noah-label-verifier-reply/1', judgments: [{ toolName: 'clean_csv', input: true, output: true, noInventedWords: true }] }),
  });
  assert.equal(receipt.status, 'partial');
  assert.equal(receipt.acceptedTools, 1);
  assert.deepEqual(receipt.rejects, [{ toolName: 'summarize_topic', code: 'proposal_parse_invalid' }]);
});

void test('preflight is reusable as definitions and family receipts resume atomically', async () => {
  const root = mkdtempSync(join(tmpdir(), 'noah-label-operator-'));
  try {
    const captureDirectory = join(root, 'captures');
    const stateDirectory = join(root, 'state');
    const familyId = family().familyId;
    mkdirSync(captureDirectory, { recursive: true });
    writeFileSync(join(captureDirectory, `series-${HASH(familyId)}.json`), JSON.stringify(noahLabelCaptureBatch({ familyId, candidateId: familyId, toolsSha256: family().toolsSha256, tools: [csvTool] })));
    const intake = { schema: 'noah-intake-import/1', families: [{ id: familyId, representative_id: familyId, listed: 1, level: 1 }], checks: [{ candidate_id: familyId, result: 'ok', tools_sha256: family().toolsSha256, tool_count: 1 }] };
    const preflight = preflightNoahLabelRun(intake, captureDirectory);
    assert.equal(preflight.run.schema, 'noah-label-export/1');
    assert.equal(preflight.capturedSeries, 1);
    const work = join(root, 'work');
    const prepared = await prepareNoahFamilyWork(preflight.run, work);
    assert.equal(prepared.families, 1);
    assert.equal(readdirSync(work).filter((file) => file.startsWith('family-')).length, 1);
    const models = {
      label: async () => labelReply([csvTool]),
      verifier: async () => JSON.stringify({ schema: 'noah-label-verifier-reply/1', judgments: [{ toolName: 'clean_csv', input: true, output: true, noInventedWords: true }] }),
    };
    const first = await runNoahLabelOperator(preflight.run, stateDirectory, { models, now: () => 10 });
    const second = await runNoahLabelOperator(preflight.run, stateDirectory, { models, now: () => 20 });
    assert.deepEqual([first.saved, first.accepted], [1, 1]);
    assert.deepEqual([second.saved, second.skipped], [0, 1]);
    const familyDirectory = join(stateDirectory, 'families', HASH(familyId));
    const files = readdirSync(familyDirectory);
    assert.equal(files.filter((file) => file.endsWith('.generation.json')).length, 1);
    assert.equal(files.filter((file) => file.endsWith('.receipt.json')).length, 1);
    assert.doesNotMatch(readFileSync(join(familyDirectory, files.find((file) => file.endsWith('.receipt.json'))), 'utf8'), /Takes a CSV/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('a model sees grounded choices and unsupported tools retain an empty result', async () => {
  const unsupported = { name: 'opaque_action', description: '', inputSchema: { type: 'object', examples: [{ csv: 'Example' }] } };
  const result = await labelNoahFamily(family([csvTool, unsupported]), {
    label: async (prompt) => {
      assert.match(prompt, /"materialChoices":\{"inputs":\["csv"\],"outputs":\["cleaned-csv"\]\}/u);
      assert.doesNotMatch(prompt, /opaque_action/u);
      return labelReply([csvTool]);
    },
    verifier: async (prompt) => {
      assert.doesNotMatch(prompt, /materialChoices|opaque_action/u);
      return JSON.stringify({ schema: 'noah-label-verifier-reply/1', judgments: [{ toolName: 'clean_csv', input: true, output: true, noInventedWords: true }] });
    },
  });
  assert.equal(result.acceptedTools, 1);
  assert.deepEqual(result.rejects, [{ toolName: 'opaque_action', code: 'evidence_empty_description' }]);
});

void test('duplicate cards are refused without skipping other independently verified tools', async () => {
  const example = family([csvTool, topicTool]);
  const reply = JSON.parse(labelReply(example.tools));
  reply.tools.push(reply.tools[1]);
  const result = await labelNoahFamily(example, {
    label: async () => JSON.stringify(reply),
    verifier: async () => JSON.stringify({ schema: 'noah-label-verifier-reply/1', judgments: [{ toolName: 'clean_csv', input: true, output: true, noInventedWords: true }] }),
  });
  assert.equal(result.acceptedTools, 1);
  assert.deepEqual(result.rejects, [{ toolName: 'summarize_topic', code: 'label_reply_duplicate_tool' }]);
});
