import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createSkyAppJob, executeSkyAppJob, confirmSkyAppJob, stopSkyAppJob, plannerSkyRequest, privateSkyOwnersAllowed } from '../lib/sky-app-foundation.ts';
import { parseSkyAppRequest, parseSkyAppResult } from '../lib/sky-app-contract.ts';
import { parsePlannerHandoff, plannerHandoffRequest, plannerResultMessage } from '../lib/sky-planner-bridge.ts';
import { normalizeWorkJob, createWorkJob, recordSkyAppResult } from '../lib/workflow.ts';

const opts = () => ({ signal: new AbortController().signal, yieldStep: async () => {} });
const planner = () => plannerSkyRequest({ taskId: 'amc-task-1', revision: 'rev-1', brief: '担当作業：確認用メモ。成果物：下書き。完了条件：本人確認。' });
const zoom = () => ({ schema: 'sky.app-request/1', appId: 'zoom', sourceId: 'meeting-1', sourceRevision: 'r1',
  title: '会議整理', objective: '決定だけ取り出す', input: '決定: 月曜に確認\n担当: Kai',
  recipe: { schema: 'sky.private-zoom-recipe/1', name: '会議整理', purpose: '決定だけ取り出す', outputs: ['decisions'], summaryLines: 1, decisionLabel: '決定', ownerLabel: '担当' } });

void test('notes, optional Zoom adapter and Planner retain one job contract and source revision', async () => {
  for (const request of [{ ...zoom(), appId: 'notes' }, zoom(), planner()]) {
    const initial = createSkyAppJob(request), run = await executeSkyAppJob(initial, opts());
    assert.equal(initial.templateId, 'sky-app'); assert.equal(run.job, undefined);
    assert.equal(run.status, 'review'); assert.equal(run.revision, 2);
    assert.equal(run.skyApp.result.jobId, run.id); assert.equal(run.skyApp.result.sourceRevision, request.sourceRevision);
    assert.equal(run.skyApp.result.provisional, true);
    assert.deepEqual(normalizeWorkJob(JSON.parse(JSON.stringify(run))), run);
    const confirmed = confirmSkyAppJob(run); assert.equal(confirmed.status, 'completed');
    assert.throws(() => stopSkyAppJob(confirmed), /終了/);
    assert.throws(() => createWorkJob({ id: initial.id, title: 'x', templateId: initial.templateId }));
  }
});
void test('known adapter results are data and do not claim external task completion', async () => {
  const run = await executeSkyAppJob(createSkyAppJob(planner()), opts());
  assert.match(run.skyApp.result.body, /実作業は未実行/);
  assert.match(run.skyApp.result.body, /確認用メモ/);
  const z = zoom(); z.input = '決定: <script>alert(1)</script>';
  const job = await executeSkyAppJob(createSkyAppJob(z), opts());
  assert.deepEqual(job.skyApp.result.notes.decisions, ['<script>alert(1)</script>']);
  assert.equal(job.skyApp.result.notes.owners, undefined);
  const notes = { ...zoom(), appId: 'notes' };
  const noteJob = await executeSkyAppJob(createSkyAppJob(notes), opts());
  assert.equal(noteJob.skyApp.result.appId, 'notes');
  assert.equal(noteJob.skyApp.result.kind, 'meeting.notes');
  assert.throws(() => parseSkyAppResult({ ...noteJob.skyApp.result, appId: 'zoom' }, noteJob.id, noteJob.skyApp.request));
});
void test('strict requests reject authority, endpoint, oversized and cross-adapter settings', () => {
  for (const patch of [{ appId: 'shell' }, { input: 'x'.repeat(6001) }, { sourceId: '../../other' }, { sourceRevision: 'a b' },
    { endpoint: 'https://evil.example' }, { approved: true }, { budget: 999 }, { recipe: zoom().recipe }])
    assert.throws(() => parseSkyAppRequest({ ...planner(), ...patch }));
});
void test('foreign source, stale revision and cancelled late results cannot be attached', async () => {
  const run = await executeSkyAppJob(createSkyAppJob(planner()), opts());
  for (const patch of [{ sourceId: 'other' }, { sourceRevision: 'r2' }, { jobId: crypto.randomUUID() }, { provisional: false }, { execution: 'provider_completed' }, { notes: {} }])
    assert.throws(() => parseSkyAppResult({ ...run.skyApp.result, ...patch }, run.id, run.skyApp.request));
  const initial = createSkyAppJob(planner()), stopped = stopSkyAppJob(initial);
  const foreignResult = { ...run.skyApp.result, jobId: initial.id };
  assert.throws(() => recordSkyAppResult(stopped, foreignResult, initial.revision, crypto.randomUUID()), /版|状態/);
  const controller = new AbortController();
  await assert.rejects(executeSkyAppJob(createSkyAppJob(planner()), { signal: controller.signal,
    yieldStep: async () => controller.abort() }), /停止/);
});
void test('same adapter result retries are idempotent; stop removes result and confirmation', async () => {
  const id = crypto.randomUUID(), initial = createSkyAppJob(planner());
  const run = await executeSkyAppJob(initial, { ...opts(), commandId: id });
  assert.equal(recordSkyAppResult(run, run.skyApp.result, 0, id), run);
  assert.throws(() => recordSkyAppResult(run, { ...run.skyApp.result, body: '違う成果' }, 0, id), /異な/);
  const stopped = stopSkyAppJob(run); assert.equal(stopped.skyApp.result, null);
  assert.throws(() => confirmSkyAppJob(stopped));
});
void test('private owner allowlist is closed by default and cannot be wildcarded', () => {
  for (const value of [undefined, '', '*', '{}', 'null', '["*"]', '[null]', '[" owner "]']) assert.equal(privateSkyOwnersAllowed('owner', value), false);
  assert.equal(privateSkyOwnersAllowed('owner', '["owner"]'), true);
  assert.equal(privateSkyOwnersAllowed('other', '["owner"]'), false);
});
void test('planner bridge binds task, token and revision and only returns reviewed provisional output', async () => {
  const token = crypto.randomUUID();
  const raw = { type: 'avocado.sky.brief.v1', taskId: 'amc-1', token, brief: planner().input, fingerprint: '{"goal":"test","id":"amc-1"}' };
  const handoff = parsePlannerHandoff(raw, 'http://localhost:5173'), request = await plannerHandoffRequest(handoff);
  assert.equal(request.sourceRevision.length, 64);
  const run = await executeSkyAppJob(createSkyAppJob(request), opts());
  assert.throws(() => plannerResultMessage(run, handoff, request.sourceRevision));
  const confirmed = confirmSkyAppJob(run), message = plannerResultMessage(confirmed, handoff, request.sourceRevision);
  assert.equal(message.token, token); assert.equal(message.taskId, raw.taskId);
  assert.equal(message.skyJobId, run.id); assert.equal(message.provisional, true);
  assert.throws(() => plannerResultMessage(confirmed, { ...handoff, taskId: 'other' }, request.sourceRevision));
  assert.throws(() => plannerResultMessage(confirmed, handoff, 'different'));
  for (const origin of ['https://attacker.example', 'http://localhost:5173.attacker', 'https://avoado.si']) assert.throws(() => parsePlannerHandoff(raw, origin));
  for (const patch of [{ taskId: undefined, monthId: undefined }, { monthId: 'y1m1' }, { token: '*' }, { brief: '' }, { endpoint: 'http://evil' }])
    assert.throws(() => parsePlannerHandoff({ ...raw, ...patch }, 'http://localhost:5173'));
  const month = parsePlannerHandoff({ type: raw.type, monthId: 'y1m1', token, brief: raw.brief }, 'http://127.0.0.1:5173');
  assert.equal((await plannerHandoffRequest(month)).sourceId, 'y1m1');
});
void test('browser adapter fixes opener, origin, expiry and uses no wildcard or result-in-URL transfer', () => {
  const source = readFileSync(new URL('../components/sky-planner-lab.tsx', import.meta.url), 'utf8');
  assert.match(source, /event.source !== opener/); assert.match(source, /expiresAt < Date.now\(\)/);
  assert.match(source, /plannerResultMessage\(j, b.handoff, b.revision\)/);
  assert.equal(source.includes("postMessage('*'"), false);
});
