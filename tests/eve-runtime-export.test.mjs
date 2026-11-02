import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeFixture} from './helpers/eve-runtime-fixture.mjs';
import {runtimeEveTextExport} from '../lib/eve-runtime-export.ts';
import {linkedDigest} from '../lib/rockstar-linked-execution.ts';
void test('same saved runtime draft exports as ordinary UTF-8 text with verified content and no execution grant',async t=>{
 const f=runtimeFixture(t),{entry}=await f.enqueue(),report=await f.report(entry);
 await f.store().publish(f.device,{report,revision:0});
 const saved=await f.store().read(report.id),fresh=(await f.store().inspectOwnerRequest(report.id)).execution;
 const output=await runtimeEveTextExport(fresh,saved);
 assert.equal(output.name,`Eve-${saved.id}.txt`);assert.ok(output.text.includes(report.text));assert.equal(output.sha256,await linkedDigest(output.text));
 assert.match(output.text,/下書きです/);assert.doesNotMatch(output.text,/claimId|requestSha256|Bearer|rock_session_|runtime-command/);
 for(const patch of [{revision:saved.revision+1},{digest:'ef'.repeat(32)},{deviceId:crypto.randomUUID()},{threadId:crypto.randomUUID()}])await assert.rejects(runtimeEveTextExport({...fresh,...patch},saved));
 await assert.rejects(runtimeEveTextExport({...fresh,report:{...report,text:'改ざん'}},saved));
 await assert.rejects(runtimeEveTextExport({...fresh,report:{...report,state:'unknown',text:null}},saved));
 const history=await f.history().get(saved.threadId);await f.history().remove(saved.threadId,history.revision);
 await assert.rejects(f.store().inspectOwnerRequest(saved.id),e=>e.status===404);
 assert.equal((await f.store().list()).length,0);
});
