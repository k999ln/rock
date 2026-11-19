import test from 'node:test';
import assert from 'node:assert/strict';
import { draftSkyObjectAgent } from '../lib/sky-agent-draft.ts';
import { parseSkyAgentSettings, skyAgentSystem } from '../lib/sky-agent-library.ts';
import { parseSkyObjectAttachment, skyObjectRequirements, negotiateSkyObjectAttachment, skyObjectEntryPath } from '../lib/sky-object-attachment.ts';
import { describeAdapter, negotiateTextAdapters, negotiateCapabilityAdapters } from '../lib/rockstar-adapters.ts';
const now = 10000;
const attachment = (patch = {}) => ({ schema: 'sky.object-attachment/1', objectName: 'お皿', input: 'audio', output: 'audio', ...patch });
const descriptors = () => ({
  host: describeAdapter('shared-module-bridge', 'host', 'firmware', { 'identity.owner-local': true, 'store.cas': true, 'input.audio': true }, now),
  executor: describeAdapter('chosen-executor', 'executor', 'linux', { 'text.generate': true, 'model.pin': true, 'audio.transcribe': true }, now),
  output: describeAdapter('chosen-output', 'output', 'android', { 'output.audio': true }, now),
});
void test('inorganic and organic subjects share an open label without inferring sensors or authority', () => {
  for (const objectName of ['お皿', 'ペン', '椅子', '自分で作った物🟢', '育てている植物', '自分の体調記録']) assert.equal(parseSkyObjectAttachment(attachment({ objectName })).objectName, objectName);
  assert.equal(skyObjectRequirements(attachment()).host.includes('input.audio'), true);
  assert.equal(skyObjectRequirements(attachment()).executor.includes('audio.transcribe'), true);
});
void test('attachment metadata is bounded and rejects extra grants, unknown I/O and control characters', () => {
  for (const patch of [{ approved: true }, { owner: 'other' }, { shell: 'run' }, { objectName: 'a'.repeat(41) }, { objectName: '\0' }, { objectName: '\nplate' }, { input: 'anything' }, { output: 'motor.move' }, { schema: 'latest' }])
    assert.throws(() => parseSkyObjectAttachment(attachment(patch)));
  for (const value of [null, [], {}, 'plate']) assert.throws(() => parseSkyObjectAttachment(value));
});
void test('the same module/remote executor/output ports can supply the desired feature without local model weights', () => {
  const d=descriptors(),fit=negotiateSkyObjectAttachment(attachment(),d,now);
  assert.equal(fit.hostId,d.host.id);assert.equal(fit.executorId,d.executor.id);assert.equal(fit.outputId,d.output.id);
  assert.equal(fit.authorizationGranted,false);assert.equal(fit.executionAuthorized,false);assert.equal(fit.physicalAcceptance,false);
  assert.equal(fit.expiresAt,now+30000);
});
void test('a plate label or attached module does not supply missing microphones, processors or speakers', () => {
  for (const role of ['host','executor','output']) {
    const d=descriptors();d[role]={...d[role],capabilities:{}};
    assert.throws(()=>negotiateSkyObjectAttachment(attachment(),d,now),e=>e.code==='CAPABILITY_UNAVAILABLE');
  }
  const d=descriptors();d.host.capabilities['input.audio']=null;
  assert.throws(()=>negotiateSkyObjectAttachment(attachment(),d,now));
  assert.throws(()=>negotiateSkyObjectAttachment(attachment({input:'image'}),descriptors(),now));
});
void test('stale, wrong-role and unsupported protocol observations never become compatibility', () => {
  for(const patch of [{expiresAt:now},{role:'output'},{protocols:[2]},{observedAt:now+1}]) {
    const d=descriptors();d.host={...d.host,...patch};assert.throws(()=>negotiateSkyObjectAttachment(attachment(),d,now));
  }
});
void test('legacy text negotiation has the same contract and malformed generic requirements fail closed', () => {
  const host=describeAdapter('host','host','macos',{'identity.owner-local':true,'store.cas':true},now);
  const executor=describeAdapter('executor','executor','linux',{'text.generate':true,'model.pin':true},now);
  const output=describeAdapter('output','output','web',{'output.text':true},now);
  const required={host:['identity.owner-local','store.cas'],executor:['text.generate','model.pin'],output:['output.text']};
  assert.deepEqual(negotiateCapabilityAdapters(host,executor,output,required,now),negotiateTextAdapters(host,executor,output,now));
  for(const bad of [null,{}, {...required,host:[]},{...required,executor:['root any shell']},{...required,grant:true}]) assert.throws(()=>negotiateCapabilityAdapters(host,executor,output,bad,now));
});
void test('purpose drafting is a transparent bounded template and saves through existing settings', () => {
  const draft=draftSkyObjectAgent({objectName:'お皿',problem:'誰の皿か分からない',result:'持ち主と使い方を伝える',input:'text',output:'text'});
  assert.equal(draft.name,'お皿の担当');assert.match(draft.instructions,/誰の皿か分からない/);
  assert.match(draft.instructions,/持ち主と使い方を伝える/);assert.equal(draft.attachment.objectName,'お皿');
  assert.deepEqual(parseSkyAgentSettings(JSON.parse(JSON.stringify(draft))),draft);
  assert.match(skyAgentSystem(draft),/実接続・センサー観測・物理操作の証拠ではありません/);
  for(const patch of [{problem:''},{result:'a'.repeat(241)},{problem:'bad\0'},{approved:true}])assert.throws(()=>draftSkyObjectAgent({objectName:'皿',problem:'困りごと',result:'望むこと',input:'text',output:'text',...patch}));
});
void test('stable object entry is an owner-checked reference, with no commands or credentials in its URL', () => {
  assert.equal(skyObjectEntryPath('fixture-id'),'/sky/objects/fixture-id');
  for(const id of ['https://external.invalid','../another','x?token=secret',''])assert.throws(()=>skyObjectEntryPath(id));
});

void test('organic subjects still require actual inputs and do not gain biological abilities', () => {
  const draft=draftSkyObjectAgent({objectName:'育てている植物',problem:'水やりを忘れる',result:'手元の記録から水やりの予定を相談したい',input:'text',output:'text'});
  assert.equal(draft.attachment.objectName,'育てている植物');
  assert.deepEqual(skyObjectRequirements(draft.attachment),{host:['identity.owner-local','store.cas','input.text'],executor:['text.generate','model.pin'],output:['output.text']});
  assert.match(skyAgentSystem(draft),/今受け取っていない情報を観測したと主張しない/);
  for(const input of ['thought.read','brain.control','biological.control']) assert.throws(()=>parseSkyObjectAttachment(attachment({objectName:'自分の記録',input})));
});
