import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { skyEveRuntimeStopStatus, skyEveRuntimeStopNotice } from '../lib/sky-eve-connections.ts';

const feedback = { owner: 'owner-a', id: 'job-a', threadId: 'thread-a', state: 'stop-requested' };
const notice = (state, f = feedback) => skyEveRuntimeStopNotice(f, [{ id: 'job-a', threadId: 'thread-a', state }], 'owner-a', 'thread-a');
for (const state of ['cancelled-before-start', 'stop-requested', 'stop-confirmed', 'stop-finished', 'stop-unknown']) {
  void test(`a live ${state} observation replaces the initial request notice`, () => {
    assert.equal(notice(state), skyEveRuntimeStopStatus(state));
  });
}
void test('ordinary receipt and unknown states cannot claim a confirmed stop', () => {
  assert.equal(skyEveRuntimeStopStatus('pending'), '');
  assert.equal(skyEveRuntimeStopStatus('received'), '');
  assert.equal(skyEveRuntimeStopStatus('invented-confirmation'), '');
  for (const state of ['constructor', '__proto__', 'toString']) assert.equal(skyEveRuntimeStopStatus(state), '');
  assert.match(notice('received'), /確認中/);
  assert.match(notice('received', { ...feedback, state: 'unconfirmed' }), /停止済みとは扱いません/);
});
void test('later exact-job confirmation resolves a lost stop response', () => {
  assert.equal(notice('stop-confirmed', { ...feedback, state: 'unconfirmed' }), skyEveRuntimeStopStatus('stop-confirmed'));
});
void test('other owners, signed-out state and other conversations receive no notice', () => {
  for (const [owner, threadId] of [['owner-b', 'thread-a'], ['', 'thread-a'], ['owner-a', 'thread-b']]) {
    assert.equal(skyEveRuntimeStopNotice(feedback, [], owner, threadId), '');
  }
  assert.equal(skyEveRuntimeStopNotice(null, [], 'owner-a', 'thread-a'), '');
});
void test('a different job or conversation cannot confirm this request', () => {
  for (const p of [{id:'job-b',threadId:'thread-a'}, {id:'job-a',threadId:'thread-b'}]) {
    assert.match(skyEveRuntimeStopNotice(feedback, [{ ...p, state: 'stop-confirmed' }], 'owner-a', 'thread-a'), /確認中/);
  }
});
void test('a saved result is retained rather than relabelled as stopped', () => {
  assert.equal(notice('stop-confirmed', { ...feedback, state: 'result-retained' }), 'すでに保存された成果を保持しました。');
});
void test('the component projects notices from current owner-bound observations', async () => {
  const source = await readFile(new URL('../components/eve-sync-workspace.tsx', import.meta.url), 'utf8');
  assert.match(source, /skyEveRuntimeStopStatus\(p\.state\)/);
  assert.match(source, /skyEveRuntimeStopNotice\(stopFeedback, runtimePending/);
  assert.match(source, /activeThread\.current !== p\.threadId/);
  assert.doesNotMatch(source, /setMessage\(r\.state === 'result-retained'/);
});
