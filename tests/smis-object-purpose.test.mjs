import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessSmisObjectPurpose, suggestSmisObjectNeeds, smisObjectPurposeRequest } from '../lib/smis-object-purpose.ts';
import { createSmisModuleSession, smisModuleRequestSuffix } from '../lib/smis-module-session.ts';
import { guardSmisModuleWorkPort, reviewSmisObjectPurpose } from '../lib/smis-module-work-port.ts';
import { createEveInteractionSession } from '../lib/rockstar-eve-interaction.ts';
import { runtimeEveTextExport } from '../lib/eve-runtime-export.ts';
import { purposeFixture } from './helpers/eve-purpose-fixture.mjs';

const ready = { motion: true, work: true };
const review = (request, needs = suggestSmisObjectNeeds(request)) => ({ request, needs, other: '', confirmed: true });
void test('a plant watering wish exposes the moisture part and continuous notification software, not a claimed capability', () => {
  const wish = review('この植物の水やり時期を知らせて'), plan = assessSmisObjectPurpose(wish, ready);
  assert.ok(wish.needs.includes('moisture')); assert.ok(wish.needs.includes('watch'));
  assert.equal(plan.ready, false); assert.equal(plan.status, 'needs-preparation');
  assert.match(plan.missingParts.join(), /水分センサー/); assert.match(plan.preparation.join(), /継続実行・通知/);
  assert.equal(plan.executionAuthorized, false); assert.equal(plan.physicalAcceptance, false);
  assert.throws(() => smisObjectPurposeRequest(wish, ready));
});
void test('parts, implementation and unconnected runtime are explained separately without downloading or buying', () => {
  const plan = assessSmisObjectPurpose(review('今の動きの値を文章で記録する'), { motion: false, work: false });
  assert.equal(plan.ready, false); assert.match(plan.missingParts.join(), /micro:bit V2/);
  assert.match(plan.preparation.join(), /基板を接続/); assert.match(plan.preparation.join(), /本人のEve/);
});
void test('built-in button and speaker are software gaps rather than an automatic shopping list', () => {
  const plan = assessSmisObjectPurpose(review('ボタンを押したら声で知らせて'), ready);
  assert.equal(plan.ready, false); assert.deepEqual(plan.missingParts, []);
  assert.match(plan.preparation.join(), /ボタンを読み取る処理/); assert.match(plan.preparation.join(), /スピーカー/);
});
void test('weight and actuation cannot be inferred from a connected accelerometer', () => {
  for (const request of ['このお皿の重さを量る', 'モーターでふたを開けて']) {
    const plan = assessSmisObjectPurpose(review(request), ready);
    assert.equal(plan.ready, false); assert.ok(plan.missingParts.length > 0); assert.ok(plan.preparation.length > 0);
  }
});
void test('open/close or detachment requires a contact adapter, not raw motion alone', () => {
  const plan = assessSmisObjectPurpose(review('この箱が開いたか記録して'), ready);
  assert.equal(plan.ready, false); assert.match(plan.missingParts.join(), /接点スイッチ/);
});
void test('an unrecognized wish stays unclear instead of silently falling back to text generation', () => {
  const plan = assessSmisObjectPurpose(review('この皿のカロリーを知りたい'), ready);
  assert.equal(plan.status, 'needs-clarification'); assert.equal(plan.ready, false);
  assert.match(plan.preparation.join(), /必要な情報や働き/);
});
void test('language matches are only proposed needs and must be corrected and confirmed', () => {
  const proposed = review('動きの値からメモを作る'); proposed.confirmed = false;
  assert.equal(assessSmisObjectPurpose(proposed, ready).status, 'needs-clarification');
  proposed.confirmed = true; proposed.other = 'この一覧にない働き';
  assert.equal(assessSmisObjectPurpose(proposed, ready).ready, false);
  proposed.other = ''; assert.equal(assessSmisObjectPurpose(proposed, ready).ready, true);
});
void test('free-form objects and text-only drafts use the same core; empty and unknown contracts fail closed', () => {
  const wish = review('この大事な物の使い方を説明する文章を作る', ['text']);
  assert.equal(assessSmisObjectPurpose(wish, { motion: false, work: true }).ready, true);
  assert.match(smisObjectPurposeRequest(wish, ready), /本人の確認を待って/);
  assert.equal(assessSmisObjectPurpose({ ...wish, needs: [] }, ready).ready, false);
  for (const needs of [['unknown'], ['motion', 'motion']]) assert.throws(() => assessSmisObjectPurpose({ ...wish, needs }, ready));
  assert.throws(() => assessSmisObjectPurpose({ ...wish, request: 'x'.repeat(301) }, ready));
});
void test('text execution remains a prerequisite even if a caller selects only sensor input', () => {
  const plan = assessSmisObjectPurpose(review('動きの記録', ['motion']), { motion: true, work: false });
  assert.equal(plan.ready, false); assert.match(plan.preparation.join(), /本人のEve/);
});
void test('the exact reviewed request is enforced before any role creation or runtime call', async () => {
  const input = smisObjectPurposeRequest(review('動きの記録'), ready); let prepares = 0;
  const work = guardSmisModuleWorkPort({ prepare: async () => { prepares++; return null; }, start: async () => null, read: async () => null, stop: async () => null }, () => ({ key: 'same', request: input, suffix: '\n観測', valid: () => true }));
  await assert.rejects(work.prepare('未確認の別依頼\n観測', () => true)); assert.equal(prepares, 0);
  await work.prepare(input + '\n観測', () => true); assert.equal(prepares, 1);
});
void test('changing request or observed values under the same key invalidates asynchronous preparation', async () => {
  for (const field of ['request', 'suffix']) {
    let release; const wait = new Promise(resolve => { release = resolve; });
    const context = { key: 'same', request: '確認した依頼', suffix: '\n観測', valid: () => true };
    const work = guardSmisModuleWorkPort({ prepare: async input => { await wait; return { agentId: 'a', agentSha256: 'ab'.repeat(32), modelSha256: 'cd'.repeat(32), input }; }, start: async () => assert.fail('stale dispatch'), read: async () => null, stop: async () => null }, () => context);
    const pending = work.prepare(context.request + context.suffix, () => true); context[field] += '変更'; release(); assert.equal(await pending, null);
  }
});
void test('reviewed object purpose reaches existing role/runtime/SQLite/export/stop; reconnect is never a new grant', async t => {
  const f = await purposeFixture(t), sensor = createSmisModuleSession({ owner: 'alice' });
  sensor.connect('synthetic-board'); sensor.observe({ x: 0, y: 0, z: 1024 }); sensor.attach('持ち物'); sensor.observe({ x: 1024, y: 0, z: 0 }); sensor.confirmMovement();
  const snapshot = sensor.snapshot(), goal = review('この持ち物の今の動きの値を短いメモにする');
  const request = smisObjectPurposeRequest(goal, ready), suffix = smisModuleRequestSuffix(snapshot);
  let context = { key: snapshot.scope, request, suffix, valid: () => sensor.current(snapshot) };
  const session = createEveInteractionSession({ work: guardSmisModuleWorkPort(f.port(), () => context), pendingKey: f.pendingKey, storage: f.storage, changed: () => {} });
  assert.equal(await reviewSmisObjectPurpose(session, context, () => true), true);
  assert.equal(session.state.phase, 'review'); assert.equal(f.counts.libraryWrites, 0); assert.equal(f.counts.runtimeStarts, 0);
  await session.confirm();
  assert.equal(session.state.phase, 'running'); const id = session.state.jobId;
  const entry = (await f.store().commands(f.device)).find(e => e.command.request.id === id);
  assert.ok(entry); assert.match(entry.command.request.input, /本人の目的/);
  const report = await f.report(entry); await f.store().publish(f.device, { report, revision: 0 }); await session.refresh();
  assert.equal(session.state.phase, 'result'); const saved = (await f.store().inspectOwnerRequest(id)).execution;
  const file = await runtimeEveTextExport(saved, saved); assert.match(file.name, /\.txt$/); assert.ok(file.text.includes(report.text));
  sensor.disconnect(); context = null; await session.stop(); assert.equal(session.state.phase, 'standby');
  assert.equal(f.counts.libraryWrites, 1); assert.equal(f.counts.runtimeStarts, 1);
  assert.equal((await f.store().inspectOwnerRequest(id)).execution.report.text, report.text);
});
void test('private UI exposes free purpose before hardware and routes approved input into the existing Eve review', () => {
  const panel = readFileSync(new URL('../components/smis-object-purpose-panel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /部品が届く前でも確認/); assert.match(panel, /部品以外に必要な準備/); assert.match(panel, /目的を「今の動きの記録」に変更/);
  const eve = readFileSync(new URL('../components/eve-interaction-panel.tsx', import.meta.url), 'utf8');
  assert.match(eve, /reviewSmisObjectPurpose/); assert.match(eve, /text.trim\(\)!==context.request/);
});

void test('cancelled or stale purpose handoff never creates a role or opens the microphone', async () => {
  let prepares = 0;
  const work = { prepare: async () => { prepares++; return null; }, start: async () => null, read: async () => null, stop: async () => null };
  const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  for (const [valid, continuing] of [[false, true], [true, false]]) {
    const session = createEveInteractionSession({ work, storage, changed: () => {} });
    assert.equal(await reviewSmisObjectPurpose(session, {key:'one', request:'依頼', suffix:'',valid:()=>valid},()=>continuing), false);
    assert.equal(session.state.phase, 'disabled');
  }
  assert.equal(prepares, 0);
});

void test('a bullet list is recognized as a text-only purpose after owner review',()=>{
 const plan=assessSmisObjectPurpose({request:'部品購入前の確認を3つの箇条書きにして',needs:['text'],other:'',confirmed:true},{motion:false,work:true});assert.equal(plan.ready,true);
});

void test('private module entry restores the same pinned role and conversation on reload',()=>{
 const page=readFileSync(new URL('../app/os/eve/module/page.tsx',import.meta.url),'utf8');
 assert.match(page,/initialSelection=\{readSkyEveSelection\(params\)\}/);assert.match(page,/initialThreadId=/);
 const workspace=readFileSync(new URL('../components/eve-sync-workspace.tsx',import.meta.url),'utf8');assert.match(workspace,/window.location.pathname === '\/os\/eve\/module'/);
});
