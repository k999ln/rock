import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { beginPrivateZoomRun, cancelPrivateZoomRun, confirmPrivateZoomRun, executePrivateZoomRun,
  parsePrivateZoomAgent, privateZoomLabAllowed, privateZoomResultMarkdown } from '../lib/sky-private-zoom-lab.ts';
import { applyWorkCommand, createWorkJob } from '../lib/workflow.ts';

const base = () => ({ schema: 'sky.private-zoom-recipe/1', name: '自分の会議整理', purpose: '決定と担当を確認する',
  outputs: ['summary', 'decisions', 'owners'], summaryLines: 2, decisionLabel: '決定', ownerLabel: '担当' });
const notes = '会議: 今週\n決定: 自分で試す\n担当: Kai\n決定: 成果を持ち出す';
const options = () => ({ signal: new AbortController().signal, yieldStep: async () => {} });
const begin = (recipe = base(), input = notes) => beginPrivateZoomRun(parsePrivateZoomAgent(recipe), input, crypto.randomUUID());

void test('private lab is development AND exact loopback only', () => {
  for (const host of ['localhost', 'localhost:3000', '127.0.0.1:5173', '[::1]:3000']) {
    assert.equal(privateZoomLabAllowed('development', host), true);
    for (const mode of ['production', 'test', undefined]) assert.equal(privateZoomLabAllowed(mode, host), false);
  }
  for (const host of [null, '', 'localhost.example.com', '127.0.0.1.attacker', 'example.com', 'localhost@evil.com', 'localhost:3000/path', 'localhost, evil'])
    assert.equal(privateZoomLabAllowed('development', host), false);
  const page = readFileSync(new URL('../app/sky/add/zoom/lab/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /if \(!privateZoomLabAllowed.*notFound\(\)/);
  assert.match(page, /index: false, follow: false/);
});
void test('create recipe is bounded and rejects executable or host authority fields', () => {
  assert.deepEqual(parsePrivateZoomAgent(JSON.parse(JSON.stringify(base()))), base());
  for (const patch of [{ schema: 'other' }, { name: '' }, { purpose: 'x'.repeat(241) }, { outputs: [] },
    { outputs: ['summary', 'summary'] }, { outputs: ['send-chat'] }, { summaryLines: 0 }, { summaryLines: 6 },
    { summaryLines: 1.5 }, { decisionLabel: '担当' }, { decisionLabel: '決定:' }, { ownerLabel: 'a\nb' },
    { code: 'fetch(...)' }, { endpoint: 'https://example.com' }, { permission: 'Zoom.write' }])
    assert.throws(() => parsePrivateZoomAgent({ ...base(), ...patch }));
});
void test('real local lifecycle uses common workflow revisions and explicit owner review', async () => {
  const initial = begin();
  const progress = [];
  const run = await executePrivateZoomRun(initial, notes, { ...options(), onProgress: (v) => progress.push(v) });
  assert.equal(initial.job.revision, 0);
  assert.equal(run.job.status, 'review'); assert.equal(run.job.revision, 2);
  assert.deepEqual(run.artifact.decisions, ['自分で試す', '成果を持ち出す']);
  assert.deepEqual(run.artifact.owners, ['Kai']);
  assert.equal(run.artifact.environment, 'browser-private-manual-text');
  assert.equal(run.artifact.jobId, run.job.id);
  assert.equal(progress.length, 1);
  assert.throws(() => applyWorkCommand(run.job, { id: crypto.randomUUID(), action: 'cancel' }, 0), /更新/);
  const confirmed = confirmPrivateZoomRun(run);
  assert.equal(confirmed.job.status, 'completed'); assert.equal(confirmed.job.revision, 3);
  assert.throws(() => confirmPrivateZoomRun(confirmed), /終了/);
  assert.match(privateZoomResultMarkdown(confirmed), /自分で試す/);
  assert.equal(cancelPrivateZoomRun(confirmed), confirmed);
  // A local recipe never becomes an accepted template of the owner/server work API.
  assert.throws(() => createWorkJob({ id: initial.job.id, title: 'x', templateId: initial.job.templateId }), /種類/);
});
void test('different owner configurations change outputs; labels are literals and untrusted text stays text', async () => {
  const recipe = base(); recipe.outputs = ['decisions']; recipe.decisionLabel = 'D[1]';
  const input = '決定: 対象外\nD[1]: <script>alert(1)</script>\n担当: 対象外';
  const initial = begin(recipe, input);
  recipe.outputs.push('owners'); recipe.decisionLabel = '決定';
  const run = await executePrivateZoomRun(initial, input, options());
  assert.equal(run.artifact.summary, undefined); assert.equal(run.artifact.owners, undefined);
  assert.deepEqual(run.artifact.decisions, ['<script>alert(1)</script>']);
  assert.deepEqual(run.recipe.outputs, ['decisions']);
});
void test('input rejected without silent truncation; empty labels do not invent content', async () => {
  for (const input of ['', '  ', 'a'.repeat(6001), Array(122).fill('x').join('\n')]) assert.throws(() => begin(base(), input));
  const input = '決定:\n担当: \n普通のメモ';
  const run = await executePrivateZoomRun(begin(base(), input), input, options());
  assert.deepEqual(run.artifact.decisions, []); assert.deepEqual(run.artifact.owners, []);
  await assert.rejects(executePrivateZoomRun(run, notes, options()), /新しい実行/);
});
void test('stop before and during processing prevents result publication and allows a fresh run', async () => {
  for (const at of [0, 1, 2, 3]) {
    const initial = begin(), controller = new AbortController();
    let latest = initial, ticks = 0;
    if (at === 0) controller.abort();
    await assert.rejects(executePrivateZoomRun(initial, notes, { signal: controller.signal,
      onProgress: (v) => { latest = v; }, yieldStep: async () => { if (++ticks === at) controller.abort(); } }), /停止/);
    const stopped = cancelPrivateZoomRun(latest);
    assert.equal(stopped.job.status, 'cancelled'); assert.equal(stopped.artifact, null);
    assert.equal(cancelPrivateZoomRun(stopped), stopped);
    assert.throws(() => privateZoomResultMarkdown(stopped), /成果/);
    assert.throws(() => applyWorkCommand(stopped.job, { id: crypto.randomUUID(), action: 'record', stepId: 'extract',
      tool: 'sky-private-zoom-extract', transport: 'browser', outcome: 'passed', sample: false, durationMs: 0 }, stopped.job.revision), /終了/);
  }
  assert.equal((await executePrivateZoomRun(begin(), notes, options())).job.status, 'review');
});
void test('stop during pending yield and default abort-aware timer', async () => {
  const controller = new AbortController();
  const pending = executePrivateZoomRun(begin(), notes, { signal: controller.signal });
  controller.abort(); await assert.rejects(pending, /停止/);
  let release;
  const controller2 = new AbortController();
  const pending2 = executePrivateZoomRun(begin(), notes, { signal: controller2.signal,
    yieldStep: () => new Promise((resolve) => { release = resolve; }) });
  controller2.abort(); release(); await assert.rejects(pending2, /停止/);
});
void test('review may be stopped, result export is independent text and settings round-trip', async () => {
  const run = await executePrivateZoomRun(begin(), notes, options());
  const exported = JSON.stringify(run);
  assert.equal(JSON.parse(exported).artifact.jobId, run.job.id);
  assert.deepEqual(parsePrivateZoomAgent(JSON.parse(exported).recipe), run.recipe);
  const markdown = privateZoomResultMarkdown(run);
  assert.match(markdown, /実Zoom未接続/); assert.match(markdown, /Kai/);
  const stopped = cancelPrivateZoomRun(run);
  assert.equal(stopped.artifact, null); assert.throws(() => confirmPrivateZoomRun(stopped));
});
