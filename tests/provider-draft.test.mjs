import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderDraft } from '../lib/provider-draft.ts';
const tick = () => new Promise((resolve) => setImmediate(resolve));
const row = (revision, account = 'server', provider = 'instagram') => ({ provider, revision, config: { account }, status: 'setup_required', secretRef: null, connectedAt: null, updatedAt: 1 });
const failure = (status) => Object.assign(new Error('fixture ' + status), { status });
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
function fixture() {
  const calls = [], replies = [];
  const session = new ProviderDraft('instagram', {}, async (...args) => { calls.push(args); const reply = replies.shift(); if (reply instanceof Error) throw reply; return reply; });
  return { session, calls, replies };
}
void test('dirty refresh preserves baseline; conflict requires latest display, explicit confirmation, then separate save', async () => {
  const {session:s, calls, replies} = fixture(); replies.push([row(1)]); s.activate(); await tick();
  s.edit({ account: 'my draft' }); replies.push([row(2)]); await s.refresh();
  assert.equal(s.snapshot().revision,1); assert.equal(s.snapshot().config.account,'my draft');
  replies.push(failure(409)); await s.save('setup_required'); assert.equal(calls.at(-1)[2].expectedRevision,1);
  const count=calls.length; await s.save('ready'); s.confirmLatest(); assert.equal(calls.length,count); assert.equal(s.snapshot().conflict,true);
  replies.push(failure(503)); await s.refresh(); assert.equal(s.snapshot().available,false); assert.equal(s.snapshot().config.account,'my draft');
  replies.push([row(2,'external')]); await s.refresh(); assert.equal(s.snapshot().latest.config.account,'external'); assert.equal(s.snapshot().revision,1);
  s.confirmLatest(); assert.equal(s.snapshot().revision,2); assert.equal(s.snapshot().manualSave,true); assert.equal(calls.length,count+2);
  replies.push(failure(409)); await s.save('ready'); assert.equal(s.snapshot().latest,null); assert.equal(s.snapshot().config.account,'my draft');
  replies.push([row(3)]); await s.refresh(); s.confirmLatest(); replies.push(row(4,'my draft')); await s.save('setup_required');
  assert.equal(s.snapshot().revision,4); assert.equal(s.snapshot().dirty,false); assert.match(s.snapshot().message,/OAuth・実接続はまだ/);
  s.deactivate();
});
void test('pending requests are single-flight and cannot save newer edits or signal success after close', async () => {
  const {session:s,calls,replies}=fixture(); replies.push([]);s.activate();await tick();s.edit({account:'first'});
  const pending=deferred(); replies.push(pending.promise);const save=s.save('setup_required');
  await s.save('setup_required');s.edit({account:'second'});await s.refresh(); assert.equal(calls.length,2);assert.equal(s.snapshot().config.account,'first');
  s.deactivate(); pending.resolve(row(1,'first')); await save;assert.equal(s.snapshot().message,'');
  replies.push([row(1,'first')]);s.activate();await tick();assert.equal(s.snapshot().saving,false);assert.equal(s.snapshot().revision,0); // ambiguous closed write must conflict before retry
  s.deactivate();
});
void test('late GET from previous provider/session cannot change current provider and latest GET wins', async () => {
  const {session:s,replies}=fixture();const first=deferred();replies.push(first.promise);s.activate();
  replies.push([row(2)]);await s.refresh();first.resolve([row(1)]);await tick();assert.equal(s.snapshot().revision,2);
  const late=deferred();replies.push(late.promise);const pending=s.refresh();s.deactivate();
  const other=new ProviderDraft('make',{},async()=>[row(9,'other','make')]);other.activate();await tick();late.resolve([row(3)]);await pending;
  assert.equal(s.snapshot().revision,2);assert.equal(other.snapshot().revision,9);assert.equal(other.snapshot().config.account,'other');other.deactivate();
});
void test('401 clears protected draft and missing revision fails closed', async () => {
  const {session:s,replies}=fixture();replies.push([row(1)]);s.activate();await tick();s.edit({account:'private'});
  replies.push(failure(401));await s.save('setup_required');assert.deepEqual(s.snapshot().config,{});assert.equal(s.snapshot().available,false);assert.equal(s.snapshot().unauthorized,true);
  replies.push([{...row(1),revision:undefined}]);await s.refresh();assert.equal(s.snapshot().available,false);assert.equal(s.snapshot().revision,null);s.deactivate();
});
