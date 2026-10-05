import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { compileGoal, applyGoalEvent, validateGoal, revalidationImpact } from '../scripts/amc-goal-engine.mjs';
import { issueDirective, applyDirectiveEvent, transactDirective, dependencyAcceptances, canonical, sha256 } from '../scripts/amc-sky-directives.mjs';
import { skyWebCommand } from '../lib/amc-sky-web.ts';
import { createWorkJob, applyWorkCommand } from '../lib/workflow.ts';

const owner={id:'fixture-owner',roles:['owner']};
const worker={id:'fixture-worker',roles:['worker']};
const reviewer={id:'fixture-reviewer',roles:['reviewer']};
const now=Date.parse('2026-09-30T05:00:00Z'),later=now+3600001;
const lookup=(g,id)=>g.tasks.find(t=>t.id===id);
const directive=(g,id)=>g.skyDirectives?.filter(d=>d.taskId===id).at(-1);
const evidence='maintenance/change.json';
async function context(g,id,at=now,revision=1) {
 const task=lookup(g,id);
 const spec={taskId:id,revision,readPaths:[`input/${id}.txt`],writePaths:[`out/${id}.json`],startConditions:{dependencies:task.dependsOn}};
 const outputEvidence=[{path:`out/${id}.json`,hash:'e'.repeat(64)},{path:evidence,hash:'f'.repeat(64)}];
 return {principal:owner,now:at,spec,observation:{status:'verified',goalId:g.id,owner:owner.id,
  assignee:worker.id,reviewers:[reviewer.id],observedAt:new Date(at).toISOString(),taskSpecHash:await sha256(canonical(spec)),
  requirementRefs:[],sourceInputs:[{path:`input/${id}.txt`,hash:String(revision).repeat(64)}],
  contractRefs:[{id:'fixture-contract',version:revision,hash:'c'.repeat(64)}],locks:[],
  dependencyAcceptances:await dependencyAcceptances({...g,tasks:g.tasks.filter(t=>task.dependsOn.includes(t.id))},p=>new TextEncoder().encode(p)),
  outputEvidence,submittedEvidence:outputEvidence}};
}
function event(g,id,type,principal,extra={}) {
 return {id:randomUUID(),type,taskId:id,directiveId:directive(g,id)?.directiveId,actor:principal.id,role:principal.roles[0],expectedRevision:g.revision,...extra};
}
async function issue(g,id,c) {return issueDirective(g,{type:'issue_directive',taskId:id,directiveId:randomUUID(),expectedRevision:g.revision},c);}
async function progress(g,id,stage='done',at=now,revision=1) {
 const c=await context(g,id,at,revision);
 g=await issue(g,id,c);
 if(stage==='issued')return g;
 g=await applyDirectiveEvent(g,event(g,id,'start_task',worker),{...c,principal:worker});
 if(stage==='running')return g;
 g=await applyDirectiveEvent(g,event(g,id,'submit_result',worker,{outcome:'succeeded',summary:'Synthetic result',deliverables:[`out/${id}.json`],evidence:[`out/${id}.json`]}),{...c,principal:worker});
 if(stage==='submitted')return g;
 return applyDirectiveEvent(g,event(g,id,'verify_task',reviewer,{accepted:true,evidence:[`out/${id}.json`],criterionResults:lookup(g,id).acceptanceCriteria.map(a=>({criterionId:a.id,passed:true,evidence:[`out/${id}.json`]}))}),{...c,principal:reviewer});
}
async function fixture(downstream='done') {
 const tasks=Object.entries({PRE:[],A:['PRE'],B:['A'],C:['B'],P:['C'],Y:[]}).map(([id,dependsOn])=>({id,title:id,status:'planned',dependsOn,evidence:[]}));
 const mission={updatedAt:'fixture',globalRules:['No external execution'],executionHolds:[],
  squads:[{id:'T',name:'Fixture',goal:'Fixture',rules:[],acceptanceGate:'Independent review',nextTaskIds:tasks.map(t=>t.id)}],
  taskAssignments:tasks.map(t=>({taskId:t.id,primarySquad:'T',classification:'coordination'})),
  taskPlans:tasks.map(t=>({taskId:t.id,scope:t.title,workloadClass:'code_test',executionBoundary:'Fixture only',inputs:[{path:`input/${t.id}.txt`}],steps:[{id:`${t.id}-1`,action:'Produce fixture'}],deliverables:[{path:`out/${t.id}.json`,description:'Fixture'}],acceptanceCriteria:[{id:`${t.id}-AC`,criterion:'Fixture agrees',verification:'Independent comparison',status:'not_verified',evidence:[]}]}))};
 let g=compileGoal({instruction:'Revalidation fixture',squadIds:['T'],mission,project:{updatedAt:'fixture',tasks},goalId:'revalidation-fixture',maxParallel:4});
 g.skyBrief={schema:'amc-sky-brief/1',templateId:'sky-specific-launch-v1',request:'Fixture',goal:g.instruction,intent:'Preserve accepted history'};
 g.overallAcceptance.criteria=[{id:'ALL',criterion:'All fixtures accepted',verification:'Independent review',status:'not_verified',evidence:[],sourceEvidence:[]}];
 g=applyGoalEvent(g,{id:randomUUID(),type:'approve_plan',actor:owner.id,role:'owner',expectedRevision:g.revision,scopeConfirmed:true,coverageStatement:'Local fixture only',acceptanceCriteria:g.overallAcceptance.criteria});
 for(const id of ['PRE','A','Y'])g=await progress(g,id);
 g=await progress(g,'B',downstream);
 if(downstream==='done'){g=await progress(g,'C');g=await progress(g,'P','issued');}
 const impact=revalidationImpact(g,'A');
 const c=await context(g,'A',later,2);c.revalidationObservations={};
 for(const id of impact.acceptedTaskIds.filter(id=>id!=='A'))c.revalidationObservations[id]=await context(g,id,later,2);
 const request=event(g,'A','revalidate_task',owner,{reason:'Current candidate changed; acceptance must be repeated',evidence:[evidence],affectedTaskIds:impact.affectedTaskIds});
 return {g,c,request};
}

await test('owner revalidation archives accepted history, invalidates transitive downstream and requires new directives',async()=>{
 const {g,c,request}=await fixture();const before=structuredClone(g);
 const next=await applyDirectiveEvent(g,request,c);
 assert.equal(validateGoal(next).ok,true);assert.equal(next.revision,g.revision+1);assert.deepEqual(g,before);
 for(const id of ['A','B','C']) {
  const old=lookup(g,id),t=lookup(next,id);assert.equal(t.status,'pending');assert.equal(t.review,null);assert.equal(t.result,null);assert.deepEqual(t.evidence,[]);
  const saved=t.attempts.at(-1);assert.deepEqual(saved.review,old.review);assert.deepEqual(saved.result,old.result);assert.deepEqual(saved.evidence,old.evidence);assert.deepEqual(saved.acceptanceCriteria,old.acceptanceCriteria);
  assert.equal(t.revalidation.actor,owner.id);assert.equal(t.revalidation.at,new Date(later).toISOString());assert.deepEqual(t.revalidation.evidence,[evidence]);assert.equal(t.revalidation.reason,request.reason);
  assert.ok(t.acceptanceCriteria.every(a=>a.status==='not_verified'&&!a.evidence.length));
 }
 for(const id of ['A','B','C','P']){assert.equal(directive(next,id).status,'stale');assert.equal(lookup(next,id).revalidation.status,'required');}
 for(const id of ['PRE','Y']){assert.deepEqual(lookup(next,id),lookup(g,id));assert.deepEqual(directive(next,id),directive(g,id));}
 assert.deepEqual(next.eventLog.slice(0,-1),g.eventLog);
 assert.deepEqual(await applyDirectiveEvent(next,request,c),next);
 await assert.rejects(applyDirectiveEvent(next,{...request,reason:'different'},c),/Idempotency/);
 for(const id of ['A','B','P'])for(const type of ['start_task','submit_result','verify_task']){
  const principal=type==='verify_task'?reviewer:worker;
  await assert.rejects(applyDirectiveEvent(next,event(next,id,type,principal),{...c,principal}),/valid_directive_required/);
 }
 await assert.rejects(issue(next,'B',await context(next,'B',later,2)),/dependency_not_accepted/);
 const accepted=await progress(next,'A','done',later,2);assert.equal(lookup(accepted,'A').revalidation.status,'satisfied');assert.equal(lookup(accepted,'B').status,'pending');
 const b=await progress(accepted,'B','done',later,2);assert.equal(lookup(b,'B').revalidation.status,'satisfied');assert.equal(lookup(b,'C').status,'pending');
});

await test('running/submitted downstream causes atomic rejection, preserving result, history and directive lock',async()=>{
 for(const stage of ['running','submitted']){const f=await fixture(stage);const old=structuredClone(f.g);await assert.rejects(applyDirectiveEvent(f.g,f.request,f.c),/active_downstream_work:B/);assert.deepEqual(f.g,old);assert.equal(directive(f.g,'B').status,stage);}
});

await test('revalidation rejects forged roles, stale observations/revisions, mismatched spec/dependencies, conflicts and unverified reasons',async()=>{
 const f=await fixture();const original=structuredClone(f.g);
 const reject=async(editEvent,editContext,pattern=/required|mismatch|forgery|granted|conflict|expired|changed/)=>{
  const e=structuredClone(f.request),c=structuredClone(f.c);editEvent?.(e);editContext?.(c);await assert.rejects(applyDirectiveEvent(f.g,e,c),pattern);
 };
 await reject(e=>e.actor='external');
 await reject(e=>{e.actor=worker.id;e.role='worker';},c=>c.principal=worker);
 await reject(e=>{e.actor=reviewer.id;e.role='reviewer';},c=>c.principal=reviewer);
 await reject(e=>e.actor='other-owner',c=>c.principal={id:'other-owner',roles:['owner']});
 await reject(e=>e.expectedRevision--);
 await reject(e=>e.affectedTaskIds=['A']);
 await reject(e=>e.reason='');await reject(e=>e.evidence=[]);
 await reject(e=>e.accepted=true,null,/cannot_grant_acceptance/);
 await reject(null,c=>c.observation=null);
 await reject(null,c=>c.observation.status='self_reported');
 await reject(null,c=>c.observation.observedAt=new Date(later-60001).toISOString());
 await reject(null,c=>c.observation.observedAt=new Date(later+1001).toISOString());
 await reject(null,c=>c.spec.revision++);
 await reject(null,c=>c.observation.requirementRefs=['invented']);
 await reject(null,c=>c.observation.sourceInputs=[]);
 await reject(null,c=>c.observation.outputEvidence=[]);
 await reject(null,c=>c.observation.dependencyAcceptances=[]);
 await reject(null,c=>c.observation.dependencyAcceptances[0].reviewRevision--,/dependency_not_accepted/);
 await reject(null,c=>c.observation.locks=[{directiveId:'unrelated-running',writePaths:['out/A.json']}],/path_conflict/);
 await reject(null,c=>delete c.revalidationObservations.B,/downstream_observations_required/);
 await reject(null,c=>c.revalidationObservations.B.observation.observedAt='2000-01-01T00:00:00Z');
 await reject(null,c=>c.revalidationObservations.C.observation.locks=[{directiveId:'elsewhere',writePaths:['out/C.json']}],/path_conflict/);
 assert.deepEqual(f.g,original);
});

await test('Web, WorkJob and direct engine cannot manufacture revalidation authority',async()=>{
 const f=await fixture();const command={id:randomUUID(),action:'amc_event',event:f.request};
 assert.throws(()=>skyWebCommand(f.g,command,owner.id),e=>e.status===409);
 assert.throws(()=>applyGoalEvent(f.g,f.request,{trusted:true,owner:owner.id}),/最新観測/);
 const job=createWorkJob({id:randomUUID(),templateId:'amc',importGoal:f.g});assert.throws(()=>applyWorkCommand(job,command,job.revision));
 for(const path of ['app/api/amc/route.ts','app/api/work-jobs/route.ts'])assert.match(readFileSync(new URL('../'+path,import.meta.url),'utf8'),/skyWebCommand\(current.amcGoal/);
});

await test('transaction checks downstream material twice, fresh second observation and CAS before persistence',async()=>{
 const f=await fixture();let writes=0,reads=0;
 const adapter={transaction:async(_,__,fn)=>fn(),read:async()=>f.g,observe:async()=>{const c=structuredClone(f.c);if(reads++)c.revalidationObservations.B.observation.sourceInputs[0].hash='9'.repeat(64);return c;},compareAndSwap:async()=>{writes++;return true;}};
 const request={...f.request,goalId:f.g.id};
 await assert.rejects(transactDirective(adapter,owner,request),/observation_changed_before_commit/);assert.equal(writes,0);
 reads=0;adapter.observe=async()=>{const c=structuredClone(f.c);if(reads++)c.revalidationObservations.C.observation.observedAt='2000-01-01T00:00:00Z';return c;};
 await assert.rejects(transactDirective(adapter,owner,request),/observation_expired/);assert.equal(writes,0);
 adapter.observe=async()=>structuredClone(f.c);adapter.compareAndSwap=async()=>false;
 await assert.rejects(transactDirective(adapter,owner,request),/Revision conflict/);
 adapter.compareAndSwap=async(_,old,next)=>{assert.equal(old.revision,f.g.revision);assert.equal(next.revision,old.revision+1);writes++;return true;};
 const next=await transactDirective(adapter,owner,request);assert.equal(writes,1);assert.equal(lookup(next,'A').status,'pending');assert.equal(lookup(f.g,'A').status,'done');
});

await test('only accepted active tasks can be revalidated; latest directive and current execution holds remain required',async()=>{
 const f=await fixture();
 const stale=structuredClone(f.g);stale.skyDirectives.push({...structuredClone(directive(stale,'A')),directiveId:randomUUID()});
 await assert.rejects(applyDirectiveEvent(stale,f.request,f.c),/latest_directive_required/);
 const held=structuredClone(f.g);lookup(held,'A').holds=[{id:'hold',taskIds:['A'],scope:'fixture',reason:'Hold',releaseCondition:'Owner decision',decisionOwner:'owner'}];
 await assert.rejects(applyDirectiveEvent(held,f.request,f.c),/execution_hold_requires_authority/);
 const paused=structuredClone(f.g);paused.state='paused';await assert.rejects(applyDirectiveEvent(paused,f.request,f.c),/recoverable_task_required/);
 const pending=structuredClone(f.g);lookup(pending,'A').status='pending';await assert.rejects(applyDirectiveEvent(pending,f.request,f.c),/recoverable_task_required/);
});

await test('failed and blocked downstream remain explicit, with their evidence and holds preserved',async()=>{
 const f=await fixture();const g=await applyDirectiveEvent(f.g,f.request,f.c);
 for (const status of ['failed','blocked']) {
 const failed=structuredClone(g);lookup(failed,'P').status=status;lookup(failed,'P').blockReason='Historical error';lookup(failed,'P').evidence=['out/failed.json'];
 const a=await progress(failed,'A','done',later,2);
 const c=await context(a,'A',later+100,3);c.revalidationObservations={};
 const request=event(a,'A','revalidate_task',owner,{reason:'Another candidate change',evidence:[evidence],affectedTaskIds:revalidationImpact(a,'A').affectedTaskIds});
 const next=await applyDirectiveEvent(a,request,c);
 assert.equal(lookup(next,'P').status,status);assert.equal(lookup(next,'P').blockReason,'Historical error');assert.deepEqual(lookup(next,'P').evidence,['out/failed.json']);assert.deepEqual(lookup(next,'P').holds,lookup(a,'P').holds);
 assert.equal(lookup(next,'A').attempts.length,2);assert.equal(lookup(next,'A').attempts.at(-1).previousRevalidation.status,'satisfied');
 }
});
