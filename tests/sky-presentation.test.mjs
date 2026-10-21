import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catalog } from '../lib/catalog.ts';
import { skyToolDescription, skyToolEnvironment } from '../lib/sky-tool-ui.ts';
import { skyError, skyProgress, skySystemWords } from '../lib/sky-presentation.ts';
import { skyAppSections } from '../lib/sky-output-presenter.ts';
import { buildSkyOwnerExport } from '../lib/sky-owner-export.ts';
import { createSkyAppJob, executeSkyAppJob, skyAppExport, plannerSkyRequest } from '../lib/sky-app-foundation.ts';

void test('progress preserves review, provider completion, failure, stop and uncertainty', () => {
  assert.match(skyProgress('review').label, /確認待ち/);
  assert.match(skyProgress('completed').label, /確認済み/);
  assert.match(skyProgress('completed', 'execution').detail, /別に確認/);
  assert.match(skyProgress('remote_completed').detail, /保存.*確認は別/);
  for (const state of ['unrecognized', 'constructor', '__proto__', 'remote_unknown']) {
    assert.equal(skyProgress(state).label, '結果を確認できません');
    assert.match(skyProgress(state).next, /同じ操作を重ねず/);
  }
  assert.doesNotMatch(skyProgress('failed').label, /確認済み/);
  assert.match(skyProgress('cancelled').next, /費用/);
});
void test('errors give plain recovery without echoing payloads, paths, secrets or arbitrary server messages', () => {
  for (const error of ['READ_FAILED', 'ECONNRESET', 'SECRET_VALUE', 'privateSecret123',
    '失敗: {"token":"sensitive"}', '/Users/private/source.txt', 'https://private.example/?token=secret',
    'Error: Bearer supersecret', '送信エラー: private@example.com', '接続失敗: lease_invalid', '失敗: sk-secret', '不具合: <script>alert(1)</script>', '失敗 '+ 'a'.repeat(64)]) {
    const result = skyError(new Error(error));
    assert.doesNotMatch(result.message + result.next, /ECONNRESET|SECRET|private|sensitive|token|sk-secret|<script>|[a-f0-9]{32}/);
    if (error !== 'READ_FAILED') assert.equal(result.reference, undefined);
  }
  assert.match(skyError(Object.assign(new Error('bad'), {status:401})).next, /サインイン/);
  assert.match(skyError('REVISION_CONFLICT').next, /最新/);
  assert.match(skyError('accessibility_permission_required').next, /システム設定/);
  assert.match(skyError(new TypeError('Failed to fetch')).next, /同じ操作を重ねず/);
  assert.match(skyError('素材は120行までです。分けて実行してください。').message, /120行/);
  assert.equal(skySystemWords('Providerのusage receiptを確認'), '提供元の利用明細を確認');
});
void test('result sections preserve source text and do not infer facts, authority or missing fields', () => {
  const request = { appId:'zoom', input:'予算は未決定\n「予算は未決定」と言ったかも\n次回の日程は未定' };
  const before = structuredClone(request);
  const result = { notes: { decisions:['本人が書いたProviderという文字'], owners:[] } };
  const sections = skyAppSections(request,result);
  assert.deepEqual(request,before);
  assert.equal(sections[0].lines[0], '本人が書いたProviderという文字');
  assert.equal(sections.find(s=>s.title==='概要'), undefined);
  assert.deepEqual(sections.at(-1).lines, ['予算はまだ決まっていません。','次回の日程はまだ決まっていません。']);
});
void test('non-Zoom export has readable results, costs and limitations before optional technical records', async () => {
  const job = await executeSkyAppJob(createSkyAppJob(plannerSkyRequest({taskId:'private-task-id',revision:'rev-1',brief:'担当作業：案内文を用意。成果物：下書き。'})), {signal:new AbortController().signal,yieldStep:async()=>{}});
  const snapshot = {job,agents:[],cloud:[],budget:null,reservations:[]};
  const original = structuredClone(snapshot);
  const {html,manifest} = await buildSkyOwnerExport(snapshot);
  assert.deepEqual(snapshot,original);
  const first = html.split('<details class="technical">')[0];
  for (const label of ['できたもの','次にすること','利用額','保存できた範囲','案内文を用意','確認待ち','無料だったとは限りません']) assert.ok(first.includes(label),label);
  assert.doesNotMatch(first, /private-task-id|rev-1|schemaVersion|更新番号|revision|<pre|[a-f0-9]{32}/);
  assert.match(html, /data-export-file="work.json"/);
  assert.equal(manifest.scope.jobId,job.id);
  assert.doesNotMatch(skyAppExport(job), /private-task-id|rev-1|revision/);
  snapshot.budget={currency:'USD',budgetLimitMinor:1000,reservedMinor:250,settledMinor:125,revision:1};
  const withCost=(await buildSkyOwnerExport(snapshot)).html.split('<details class="technical">')[0];
  assert.match(withCost, /\$10\.00/);assert.match(withCost, /\$2\.50/);assert.match(withCost, /\$1\.25/);
  assert.match(withCost, /支払いの完了は別/);
});
void test('Sky dynamic error surfaces use the common presentation boundary', () => {
  const names=['sky-output-center.tsx','sky-linux-service.tsx','sky-linux-local-lab.tsx','sky-private-zoom-lab.tsx','sky-app-server-panel.tsx'];
  const connected=names.filter(n=>readFileSync(new URL('../components/'+n,import.meta.url),'utf8').includes('<SkyNotice'));
  assert.ok(connected.length === names.length, connected.join(','));
  for (const name of names) {
    const code=readFileSync(new URL('../components/'+name,import.meta.url),'utf8');
    assert.doesNotMatch(code, /<p[^>]*role="alert"[^>]*>\s*\{(?:error|serverError|inspectionError|connectionError|artifactError)\}\s*<\/p>/,name);
  }
  assert.match(readFileSync(new URL('../app/sky/error.tsx',import.meta.url),'utf8'), /SkyNotice/);
});

void test('every catalog tool uses readable discovery copy without changing execution contracts', () => {
  const original=structuredClone(catalog);
  for (const tool of catalog) {
    assert.ok(skyToolDescription(tool).length>5,tool.id);
    assert.ok(skyToolEnvironment(tool).length>5,tool.id);
    if(tool.status==='candidate')assert.match(skyToolEnvironment(tool),/本体の実行は準備中/);
  }
  assert.deepEqual(catalog,original);
  assert.match(skyToolDescription(catalog.find(t=>t.id==='fashion-brand-ops')),/投稿.*接続と確認/);
});
