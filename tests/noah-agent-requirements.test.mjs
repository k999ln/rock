import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_REQUIREMENTS, requirementsFor } from '../lib/noah-agent-requirements.mjs';
import { RECIPES, limitsFor, validArtifactName } from '../lib/noah-execution-contract.mjs';
import { catalogLoader } from '../scripts/noah-managed-installations.mjs';
import { sourcePlan } from '../scripts/noah-source-fetch.mjs';
import { containerArgs, validateResult } from '../scripts/noah-isolated-runtime.mjs';
import { createNoahWork, updateNoahWork, executionInputDigest, noahDigest } from '../lib/noah-execution.ts';

void test('all 85 requirement records resolve to the real catalog identity, not a similarly named product', async () => {
  const catalog = catalogLoader(process.cwd());
  assert.equal(Object.keys(AGENT_REQUIREMENTS).length, 85);
  for (const r of Object.values(AGENT_REQUIREMENTS)) {
    const entry = await catalog(r.id);
    assert.equal(entry.name, r.name);
    assert.ok(entry.sources.some(s => s.type === 'primary' && s.url === r.reference));
    assert.ok(r.requirements && r.note);
    assert.equal(requirementsFor(r.id).executable, Object.hasOwn(RECIPES, r.id));
  }
  for (const id of Object.keys(RECIPES)) assert.ok(AGENT_REQUIREMENTS[id]);
  assert.equal(requirementsFor('__proto__'), null);
});

void test('contract, resource and Android requirements never enable a substitute agent', async () => {
  for (const id of ['research-1b070c7b6e05fc3815df', 'research-9b00f109c8922c01ae75', 'research-a17476e9d79551521382']) {
    assert.equal(requirementsFor(id).executable, false);
    assert.notEqual(sourcePlan(await catalogLoader(process.cwd())(id)).adapter, 'isolated');
  }
  assert.equal(Object.values(AGENT_REQUIREMENTS).filter(r => r.mode === 'android').length, 2);
});

void test('official native agents get bounded scratch space without expanding artifact limits', () => {
  const recipe = Object.values(RECIPES).find(r => r.key === 'goose');
  const args = containerArgs('test', 'image', recipe);
  assert.equal(args[args.indexOf('--ulimit') + 1], 'fsize=4194304:4194304');
  assert.equal(limitsFor(recipe).fileBytes, 32768);
  assert.equal(limitsFor(recipe).resultBytes, 131072);
  assert.equal(args[args.indexOf('--network') + 1], 'none');
});

void test('Japanese/Chinese report names survive host and Work validation while traversal and controls are rejected', async () => {
  for (const name of ['reports/最终分析报告.md', 'レポート/売上集計.txt']) assert.equal(validArtifactName(name), true);
  for (const name of ['../秘密.txt', '/tmp/秘密.txt', 'a//b', 'a\\b', 'a\u202eb.txt', 'a\nb', 'a/./b', 'a/../b']) assert.equal(validArtifactName(name), false, name);
  const id = Object.keys(RECIPES).find(id => RECIPES[id].key === 'goose'), r = RECIPES[id], prompt = 'test', claim = 'a'.repeat(64);
  const job = await createNoahWork(crypto.randomUUID(), { agentId: id, recipe: r.key, version: r.version, model: 'qwen2.5:1.5b', prompt,
    image: `sha256:${'b'.repeat(64)}`, inputSha256: await executionInputDigest(id, prompt), claimSha256: await noahDigest(claim) });
  const file = { name: 'reports/最终分析报告.md', base64: Buffer.from('2000').toString('base64'), bytes: 4, sha256: await noahDigest('2000') };
  const result = validateResult({ type: 'result', exitCode: 0, text: 'report', files: [file] });
  const saved = await updateNoahWork(job, { action: 'finish', claim, state: 'returned', calls: 1, result });
  assert.equal(saved.noahExecution.result.files[0].name, file.name);
  assert.equal(saved.status, 'review'); assert.equal(saved.steps[0].passed, false);
});
