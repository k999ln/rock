import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_SUITE_VERSION, modelTaskCases, rankSkyModels, scoreModelCase, modelCandidateRejection } from '../lib/sky-model-selector.ts';
const now = 20000000;
const candidate = (name, digest='a'.repeat(64)) => ({name,digest,bytes:2.5e9,context:8192,completion:true,local:true});
const measurement = (name, task='meeting-notes', patch={}) => ({name,digest:'a'.repeat(64),task,suite:MODEL_SUITE_VERSION,quality:100,durationMs:10000,cases:3,validCases:3,measuredAt:now,...patch});
void test('local task rank uses observed quality, latency and footprint rather than provider branding',()=>{
 const a=candidate('qwen3:4b'), b=candidate('other:4b','b'.repeat(64));
 const rows=rankSkyModels([a,b],[measurement(a.name),measurement(b.name,'meeting-notes',{digest:b.digest,durationMs:1000})],'meeting-notes',10e9,now);
 assert.equal(rows[0].name,b.name); assert.match(rows[0].reason,/品質80/);
 assert.equal(rankSkyModels([a],[measurement(a.name,'code')],'meeting-notes',10e9,now).length,0);
});
void test('unmeasured, stale, replaced, incomplete or low quality models cannot be auto selected',()=>{
 const c=candidate('local:4b');
 for(const patch of [{digest:'b'.repeat(64)},{suite:'old'},{quality:94},{quality:Infinity},{durationMs:-1},{cases:2},{validCases:2},{measuredAt:now-3600000},{measuredAt:now+1}])
  assert.equal(rankSkyModels([c],[measurement(c.name,'meeting-notes',patch)],'meeting-notes',10e9,now).length,0);
 assert.equal(rankSkyModels([c],[],'meeting-notes',10e9,now).length,0);
});
void test('hard gates reject remote, missing context, oversized and malformed candidates',()=>{
 const c=candidate('local:4b');
 for(const patch of [{local:false},{name:'other:cloud'},{completion:false},{context:4096},{context:NaN},{bytes:10e9},{digest:'bad'},{name:'../../x?y'}])
  assert.ok(modelCandidateRejection({...c,...patch},10e9));
 assert.equal(modelCandidateRejection(c,10e9),null);
});
void test('bounded fixture scoring checks structured facts, undecided items and quoted injection',()=>{
 const fixture=modelTaskCases['meeting-notes'][2];
 const output=JSON.stringify({answer:'一般公開を保留。担当はMina。',decisions:['一般公開を保留'],owners:['Mina']});
 assert.deepEqual(scoreModelCase(output,fixture),{valid:true,quality:100});
 assert.ok(scoreModelCase(output.replaceAll('保留','公開済み'),fixture).quality<95);
 for(const invalid of ['{}','not-json',JSON.stringify({answer:'x',decisions:['x'],owners:[{}]})]) assert.equal(scoreModelCase(invalid,fixture).valid,false);
 assert.deepEqual(Object.keys(modelTaskCases).sort(),['code','meeting-notes','planning','translation']);
});

void test('hybrid meeting pipeline uses model summary and literal source facts only', async () => {
 const { composeLocalZoomNotes } = await import('../lib/sky-zoom-recipe.ts');
 const labels={decisionLabel:'決定',ownerLabel:'担当'};
 for(const fixture of modelTaskCases['meeting-notes']) {
  const combined=composeLocalZoomNotes(JSON.stringify({answer:fixture.required.join(' '),decisions:['公開済み'],owners:['架空の担当']}),fixture.input,labels);
  assert.deepEqual(combined.decisions,fixture.decisions);
  assert.deepEqual(combined.owners,fixture.owners);
  assert.deepEqual(scoreModelCase(JSON.stringify({answer:combined.summary,...combined}),fixture),{valid:true,quality:100});
 }
 for(const invalid of ['{}','null','[]','not-json',JSON.stringify({answer:' '})])
  assert.throws(()=>composeLocalZoomNotes(invalid,'決定: 試験',labels));
 const result=composeLocalZoomNotes('{"answer":"概要"}','- 決定：月曜\n担当: Kai\n決定らしい: 創作\n引用「担当: 他人」',labels);
 assert.deepEqual(result,{summary:'概要',decisions:['月曜'],owners:['Kai']});
});
