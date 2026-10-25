import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runCreatorFixture } from '../scripts/game-creator-fixture.mjs';
import { prepareGameWorkDraft } from '../lib/game-work-draft.ts';
// Reuse the existing actual Workbench + API + signed-scope + SQLite fixture.
// Only add the new lazy dependency and controlled test lifecycle hooks; leave
// its original production source, route, auth and persistence paths unchanged.
const legacyURL = new URL('./workbench-owner-recovery.test.mjs', import.meta.url);
let fixture = readFileSync(legacyURL, 'utf8').split('\nvoid test(')[0];
fixture = fixture.replace(/from (['"])(\.{1,2}\/[^'"]+)\1/g, (_all, _quote, path) => `from '${new URL(path, legacyURL).href}'`)
  .replace("from 'typescript'", `from '${import.meta.resolve('typescript')}'`)
  .replace("const root = new URL('../', import.meta.url);", `const root = new URL('${new URL('../', legacyURL).href}');`)
  .replace('componentProps = {} } = {})', 'componentProps = {}, gamePrepareOverride, componentSource } = {})')
  .replace('  const slots = [],', '  let isMounted = true, lateWrites = 0;\n  const slots = [],')
  .replace('(value) => {\n          slots[index] =', '(value) => {\n          if (!isMounted) lateWrites++;\n          slots[index] =')
  .replace('  const compiled = ts.transpileModule(', "  const gameModule = await import(new URL('lib/game-work-draft.ts', root));\n  modules['@/lib/game-work-draft'] = {...gameModule, prepareGameWorkDraft:gamePrepareOverride ?? gameModule.prepareGameWorkDraft};\n  const compiled = ts.transpileModule(")
  .replace("readFileSync(new URL('components/workbench.tsx', root), 'utf8'),", "componentSource ?? readFileSync(new URL('components/workbench.tsx', root), 'utf8'),")
  .replace('    checkExecutionAccess() {', '    unmount() {isMounted=false;slots.forEach(s=>s?.cleanup?.());}, get lateWrites(){return lateWrites;},\n    checkExecutionAccess() {');
const { setup } = await import('data:text/javascript;base64,' + Buffer.from(fixture + '\nexport {setup};\n//# sourceURL=game-work-draft-harness.mjs').toString('base64'));
let report;
async function source() {
  if (!report) {
    const directory = mkdtempSync(join(realpathSync(tmpdir()), 'rock-game-fixture-'));
    try { report = JSON.stringify(await runCreatorFixture({ operation: 'start', directory })); }
    finally { rmSync(directory, { recursive: true, force: true }); }
  }
  return report;
}
const deferred = () => Promise.withResolvers();
function field(h, name) { const found = h.nodes().find(n => n.props?.['aria-label'] === name); assert.ok(found, name); return found; }
function change(h, name, value) { field(h, name).props.onChange({ target: { value } }); h.render(); }
async function ready(t, options) { const h = await setup(t, options); h.render(); await h.flush(); return h; }
async function prepare(h, goal = '粒子の動きを説明する') {
  change(h, 'Game結果JSON', await source()); change(h, 'Gameからの依頼', goal);
  await h.click('仕事の下書きに入れる'); await h.waitFor(() => h.text().includes('Gameからの申告（未検証データ'));
}
void test('actual consumer explicit draft then existing owner-scoped create persists unchanged plan with no autoexecution', async t => {
  const h = await ready(t), before = h.count();
  change(h, 'Game結果JSON', await source()); change(h, 'Gameからの依頼', '粒子の動きを説明する');
  assert.equal(h.count(), before); assert.equal(h.requests.filter(r => r.method === 'POST').length, 0);
  await h.click('仕事の下書きに入れる'); await h.waitFor(() => h.text().includes('入力SHA256'));
  assert.equal(h.count(), 0); assert.match(h.text(), /未検証データ/); assert.equal(h.storageWrites, 0);
  await h.click('仕事を作成'); assert.equal(h.count(), 1);
  const post = h.requests.find(r => r.method === 'POST'); assert.equal(post.value.templateId, 'article');
  const expected = await prepareGameWorkDraft(await source(), '粒子の動きを説明する', post.headers['X-Rockstar-Owner-Scope'] ?? 'A');
  assert.equal(post.value.plan.objective, expected.plan.objective);
  const saved = JSON.parse(h.sqlite.prepare('SELECT payload FROM work_jobs').get().payload);
  assert.equal(saved.plan.objective, expected.plan.objective); assert.equal(saved.events.length, 0); assert.equal(saved.status, 'active');
  assert.ok(saved.steps.every(step => !step.passed));
  assert.equal(h.requests.some(r => r.method === 'PATCH'), false); assert.equal(h.storageWrites, 0);
});
void test('old main actual Workbench lacks the draft consumer, not accepted as a complete helper-only bridge', async t => {
  const componentSource = execFileSync('git', ['show', 'ee9b88010c4ccb20be1db46177e3805380995c4b:components/workbench.tsx'], { encoding: 'utf8' });
  const h = await ready(t, { componentSource });
  assert.equal(h.nodes().some(n => n.props?.['aria-label'] === 'Game結果JSON'), false);
  assert.throws(() => field(h, 'Game結果JSON'), /Game結果JSON/); assert.equal(h.count(), 0);
});
void test('forged Game flags and completion cannot create or alter existing jobs', async t => {
  const h = await ready(t), value = JSON.parse(await source()); value.executionAuthorized = true;
  change(h, 'Game結果JSON', JSON.stringify(value)); change(h, 'Gameからの依頼', '説明する');
  await h.click('仕事の下書きに入れる'); await h.waitFor(() => h.text().includes('Gameの結果と依頼を確認'));
  assert.equal(h.count(), 0); assert.equal(h.requests.some(r => r.method === 'POST' || r.method === 'PATCH'), false);
});
void test('source/goal/title editing and discard invalidate provenance; captured prior handlers cannot save old draft', async t => {
  for (const edit of ['source', 'goal', 'title', 'discard']) {
    const h = await ready(t); await prepare(h); const old = h.find('button', '仕事を作成').props.onClick;
    if (edit === 'source') change(h, 'Game結果JSON', (await source()) + ' ');
    if (edit === 'goal') change(h, 'Gameからの依頼', '新しい依頼');
    if (edit === 'title') h.input('変更した仕事名');
    if (edit === 'discard') await h.click('未保存の入力を破棄');
    old(); h.render(); await h.flush(); assert.equal(h.count(), 0, edit); assert.equal(h.text().includes('Gameからの申告（未検証データ'), false, edit);
  }
});
void test('owner switch during async draft and late result never moves source or authority to another owner', async t => {
  const gate = deferred(), h = await ready(t, { gamePrepareOverride: async (...args) => { const result = await prepareGameWorkDraft(...args); await gate.promise; return result; } });
  await h.grant('bob'); change(h, 'Game結果JSON', await source()); change(h, 'Gameからの依頼', 'Alice private request');
  const old = h.find('button', '仕事の下書きに入れる').props.onClick; old(); h.render(); await h.flush();
  h.owner('bob'); await h.click('再読込'); gate.resolve(); await h.flush();
  assert.equal(field(h, 'Game結果JSON').props.value, ''); assert.equal(field(h, 'Gameからの依頼').props.value, '');
  assert.equal(h.text().includes('Alice private request'), false); assert.equal(h.count(), 0);
  old(); await h.flush(); assert.equal(h.count(), 0);
});
void test('lost committed create response retains exact plan and original ID; explicit retry creates no duplicate', async t => {
  const h = await ready(t); await prepare(h); h.loseNextPost(); await h.click('仕事を作成');
  assert.equal(h.count(), 1); const first = h.requests.find(r => r.method === 'POST');
  assert.match(h.text(), /仕事の作成結果の確認|同じ作成内容/);
  await h.click('保存先の接続を確認'); await h.click('同じ作成内容で結果を確認');
  const posts = h.requests.filter(r => r.method === 'POST'); assert.equal(posts.length, 2);
  assert.deepEqual(posts[0].value, posts[1].value); assert.equal(posts[1].value.id, first.value.id); assert.equal(h.count(), 1);
});
void test('restoring view or reconnecting does not automatically import, save or execute', async t => {
  const h = await ready(t); await prepare(h); const count = h.requests.filter(r => r.method === 'POST').length;
  await h.click('再読込'); h.render(); await h.flush(); assert.equal(h.count(), 0);
  assert.equal(h.requests.filter(r => r.method === 'POST').length, count); assert.equal(h.requests.some(r => r.method === 'PATCH'), false);
});
void test('unmount before async preparation completes never writes a late draft', async t => {
  const gate = deferred(), h = await ready(t, { gamePrepareOverride: async (...args) => { const result = await prepareGameWorkDraft(...args); await gate.promise; return result; } });
  change(h, 'Game結果JSON', await source()); change(h, 'Gameからの依頼', '説明する');
  h.find('button', '仕事の下書きに入れる').props.onClick(); h.render(); await h.flush(); h.unmount();
  gate.resolve(); await new Promise(r => setTimeout(r, 10)); assert.equal(h.lateWrites, 0); assert.equal(h.count(), 0);
});
void test('actual late digest after input edit cannot reattach old provenance or create automatically', async t => {
  const h = await ready(t), raw = await source(), gate = deferred(), entered = deferred();
  const digest = crypto.subtle.digest.bind(crypto.subtle); let paused = false;
  t.mock.method(crypto.subtle, 'digest', async (algorithm, bytes) => {
    if (!paused && new TextDecoder().decode(bytes) === raw) { paused = true; entered.resolve(); await gate.promise; }
    return digest(algorithm, bytes);
  });
  change(h, 'Game結果JSON', raw); change(h, 'Gameからの依頼', '元の依頼');
  h.find('button', '仕事の下書きに入れる').props.onClick(); h.render(); await h.flush(); await entered.promise;
  change(h, 'Gameからの依頼', '編集後の依頼'); gate.resolve(); await h.flush();
  assert.equal(h.text().includes('Gameからの申告（未検証データ'), false); assert.equal(h.count(), 0);
  assert.equal(field(h, 'Gameからの依頼').props.value, '編集後の依頼');
});
void test('two same-frame explicit create clicks keep one job/plan and no extra work state transition', async t => {
  const h = await ready(t); await prepare(h); const click = h.find('button', '仕事を作成').props.onClick;
  click(); click(); h.render(); await h.flush(); assert.equal(h.count(), 1);
  assert.equal(h.requests.filter(r => r.method === 'POST').length, 1); assert.equal(h.requests.some(r => r.method === 'PATCH'), false);
});
void test('unknown creation retains original plan across owner change and only its owner can retry', async t => {
  const h = await ready(t); await h.grant('bob'); await prepare(h); h.loseNextPost(); await h.click('仕事を作成');
  const first = h.requests.find(r => r.method === 'POST'); h.owner('bob'); await h.click('保存先の接続を確認');
  assert.equal(h.find('button', '同じ作成内容で結果を確認').props.disabled, true); assert.equal(h.count(), 1);
  assert.equal(field(h, 'Game結果JSON').props.value, '');
  h.owner('alice'); await h.click('保存先の接続を確認'); await h.click('同じ作成内容で結果を確認');
  const posts = h.requests.filter(r => r.method === 'POST'); assert.equal(posts.length, 2); assert.deepEqual(posts[1].value, first.value); assert.equal(h.count(), 1);
});
void test('raw unprepared Game input has explicit discard and a retained old discard cannot erase a newer edit', async t => {
  const h = await ready(t); change(h, 'Game結果JSON', await source());
  const discard = h.find('button', '未保存の入力を破棄'); assert.ok(discard); const old = discard.props.onClick;
  change(h, 'Gameからの依頼', '新しい未保存入力'); old(); h.render(); await h.flush();
  assert.equal(field(h, 'Gameからの依頼').props.value, '新しい未保存入力');
  await h.click('未保存の入力を破棄'); assert.equal(field(h, 'Game結果JSON').props.value, '');
  assert.equal(field(h, 'Gameからの依頼').props.value, ''); assert.equal(h.count(), 0);
});
