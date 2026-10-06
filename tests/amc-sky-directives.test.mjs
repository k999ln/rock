import integration from '../data/amc/integration-input-status.json' with { type: 'json' };
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {prepareSkyGoal} from '../scripts/amc-sky-plan.mjs';
import {applyGoalEvent,validateGoal} from '../scripts/amc-goal-engine.mjs';
import {canonical,sha256,issueDirective,applyDirectiveEvent,inspectDirective,reconcileDirectives,transactDirective} from '../scripts/amc-sky-directives.mjs';
import {skyWebCommand,requireSkyDraftImport} from '../lib/amc-sky-web.ts';
import {runCodexGoal} from '../scripts/amc-codex.mjs';
import {sourceFile,observeSkyTask} from '../scripts/amc-sky-observe.mjs';
import {createWorkJob,applyWorkCommand} from '../lib/workflow.ts';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const plan=read('data/amc/sky/sky-amc-plan.json'),original=read('data/amc/sky/sky-amc-goal.json');
const specs=read('data/amc/sky-directives-v2.json');
const now=Date.parse('2026-09-30T04:00:00Z');
const owner={id:'test-owner',roles:['owner','worker']},reviewer={id:'test-reviewer',roles:['reviewer']};
async function fixture(){
 let goal=prepareSkyGoal(plan,original);
 goal=applyGoalEvent(goal,{id:randomUUID(),type:'approve_plan',actor:owner.id,role:'owner',expectedRevision:goal.revision,scopeConfirmed:true,coverageStatement:'Isolated fixture only',acceptanceCriteria:goal.overallAcceptance.criteria});
 const spec={taskId:'S0-01',...specs.tasks['S0-01'],writePaths:['docs/evidence/sky-launch/s0-01.json','test-source.ts'],readPaths:['test-source.ts','contract.ts']};
 const observation={status:'verified',goalId:goal.id,owner:owner.id,assignee:owner.id,reviewers:[reviewer.id],observedAt:new Date(now).toISOString(),taskSpecHash:await sha256(canonical(spec)),requirementRefs:['SKY-GOAL','SKY-S0'],dependencyAcceptances:[],sourceInputs:[{path:'test-source.ts',hash:'a'.repeat(64)},{path:'contract.ts',hash:'b'.repeat(64)}],contractRefs:[{id:'api',version:1,hash:'c'.repeat(64),changedPaths:[]}],locks:[]};
 const request={type:'issue_directive',directiveId:randomUUID(),taskId:'S0-01',expectedRevision:goal.revision};
 const context={principal:owner,spec,observation,now};
 return {goal,request,context};
}
function event(g,type,who=owner,extra={}){return {id:randomUUID(),type,taskId:'S0-01',directiveId:g.skyDirectives.at(-1).directiveId,actor:who.id,role:type==='verify_task'?'reviewer':'worker',expectedRevision:g.revision,...extra};}

await test('directive lifecycle requires trusted observation, stays submitted until an independent review, preserves history',async()=>{
 const f=await fixture();let g=await issueDirective(f.goal,f.request,f.context);
 const issued=structuredClone(g);assert.deepEqual(await issueDirective(g,f.request,f.context),g);
 await assert.rejects(issueDirective(g,{...f.request,taskId:'S0-02'},f.context),/Idempotency/);
 const start=event(g,'start_task');g=await applyDirectiveEvent(g,start,f.context);
 assert.deepEqual(await applyDirectiveEvent(g,start,f.context),g);
 await assert.rejects(applyDirectiveEvent(g,{...start,actor:reviewer.id},f.context),/actor_forgery/);
 const o=structuredClone(f.context.observation);o.sourceInputs[0].hash='d'.repeat(64);
 const output='docs/evidence/sky-launch/s0-01.json';o.outputEvidence=[{path:output,hash:'e'.repeat(64)}];
 g=await applyDirectiveEvent(g,event(g,'submit_result',owner,{outcome:'succeeded',summary:'Fixture data',deliverables:[output],evidence:[output]}),{...f.context,observation:o});
 assert.equal(g.tasks[0].status,'submitted');
 const verify=event(g,'verify_task',reviewer,{accepted:true,evidence:[output],criterionResults:g.tasks[0].acceptanceCriteria.map(c=>({criterionId:c.id,passed:true,evidence:[output]}))});
 await assert.rejects(applyDirectiveEvent(g,{...verify,actor:owner.id},{...f.context,principal:{...owner,roles:['reviewer']},observation:o}),/assignee_mismatch/);
 o.submittedEvidence=o.outputEvidence;
 const bad=structuredClone(o);bad.submittedEvidence[0].hash='f'.repeat(64);
 await assert.rejects(applyDirectiveEvent(g,verify,{...f.context,principal:reviewer,observation:bad}),/submitted_evidence_changed/);
 g=await applyDirectiveEvent(g,verify,{...f.context,principal:reviewer,observation:o});
 assert.equal(g.tasks[0].status,'done');assert.equal(g.skyDirectives[0].status,'accepted');assert.equal(g.overallAcceptance.accepted,false);
 assert.equal(issued.tasks[0].status,'pending');
});

await test('relevant drift, cancelled dependency, replaced evidence, expiry, missing observation and path conflict invalidate only affected directives',async()=>{
 const f=await fixture();const g=await issueDirective(f.goal,f.request,f.context);const d=g.skyDirectives[0];
 for(const mutate of [o=>o.contractRefs[0].version++,o=>o.contractRefs[0].hash='d'.repeat(64),o=>o.dependencyAcceptances.push({taskId:'S0-02',reviewRevision:4,evidenceHash:'f'.repeat(64)}),o=>o.taskSpecHash='d'.repeat(64),o=>o.observedAt='2020-01-01T00:00:00Z',o=>o.locks.push({directiveId:'other',writePaths:['test-source.ts']})]){
  const o=structuredClone(f.context.observation);mutate(o);assert.ok(inspectDirective(g,d,o,'start',now).length);
  const stale=reconcileDirectives(g,{'S0-01':o},now);assert.equal(stale.skyDirectives[0].status,'stale');assert.equal(stale.tasks[0].status,'pending');assert.deepEqual(stale.eventLog.slice(0,-1),g.eventLog);
 }
 assert.deepEqual(inspectDirective(g,d,null,'start',now),['observation_unavailable']);
 assert.ok(inspectDirective(g,d,f.context.observation,'start',now+3600001).includes('directive_expired'));
 const unrelated=structuredClone(g);unrelated.tasks[1].blockReason='Unrelated bookkeeping';unrelated.revision++;
 assert.deepEqual(inspectDirective(unrelated,d,f.context.observation,'start',now),[]);
});

await test('own allowed edits can be submitted, outside edits and unacknowledged contract versions cannot',async()=>{
 const f=await fixture();const g=await issueDirective(f.goal,f.request,f.context);const d=g.skyDirectives[0];
 const o=structuredClone(f.context.observation);o.sourceInputs[0].hash='d'.repeat(64);o.contractRefs[0].hash='e'.repeat(64);o.contractRefs[0].changedPaths=['test-source.ts'];
 assert.deepEqual(inspectDirective(g,d,o,'submit',now),[]);
 assert.ok(inspectDirective(g,d,o,'start',now).length);
 o.changedPaths=['another-team.ts'];assert.ok(inspectDirective(g,d,o,'submit',now).some(r=>r.startsWith('outside_write_scope')));
});

await test('HTTP paths and the shared WorkJob reducer cannot bypass trusted execution using actor/hash flags or imported progress',async()=>{
 const f=await fixture();const e={id:randomUUID(),action:'amc_event',event:{id:randomUUID(),type:'start_task',taskId:'S0-01',actor:'forged',role:'worker',expectedRevision:f.goal.revision,matched:true}};
 assert.throws(()=>skyWebCommand(f.goal,e,'real-user'),/最新ソース/);
 assert.throws(()=>applyGoalEvent(f.goal,e.event,{matched:true}),/最新観測/);
 const job=createWorkJob({id:randomUUID(),templateId:'amc',importGoal:f.goal});
 assert.throws(()=>applyWorkCommand(job,{...e,id:e.event.id,event:{...e.event,matched:undefined}},job.revision));
 assert.throws(()=>requireSkyDraftImport(f.goal),/移行/);
 assert.doesNotThrow(()=>requireSkyDraftImport(prepareSkyGoal(plan,original)));
 const approve=skyWebCommand(f.goal,{id:randomUUID(),action:'amc_event',event:{type:'approve_plan',actor:'pretend',role:'reviewer'}},'authenticated');
 assert.equal(approve.event.actor,'authenticated');assert.equal(approve.event.role,'owner');
 assert.match(readFileSync(new URL('../app/api/amc/route.ts',import.meta.url),'utf8'),/skyWebCommand\(current.amcGoal/);
 assert.match(readFileSync(new URL('../app/api/work-jobs/route.ts',import.meta.url),'utf8'),/if \(current.templateId === 'amc' \|\| current.amcGoal\)\s*throw new WorkError/);
});

await test('transaction rejects A/B ownership, concurrent Goal revisions and changed observation between validation and CAS',async()=>{
 const f=await fixture();await assert.rejects(issueDirective(f.goal,f.request,{...f.context,principal:{id:'other',roles:['owner']}}),/trusted_observation/);
 await assert.rejects(issueDirective(f.goal,{...f.request,expectedRevision:999},f.context),/Revision conflict/);
 let writes=0,calls=0;
 const adapter={transaction:async(_,__,fn)=>fn(),read:async()=>f.goal,observe:async()=>{const c=structuredClone(f.context);if(calls++)c.observation.taskSpecHash='changed';return c;},compareAndSwap:async()=>{writes++;return true;}};
 await assert.rejects(transactDirective(adapter,owner,{...f.request,goalId:f.goal.id}),/observation_changed_before_commit/);assert.equal(writes,0);
 await assert.rejects(transactDirective(null,owner,f.request),/adapter_unavailable/);
});

await test('all 36 precise instructions declare source gaps and use existing or explicitly missing inputs, retain post-launch separation and original acceptance',async()=>{
 assert.equal(Object.keys(specs.tasks).length,36);assert.equal(specs.tasks['S11-04'],undefined);
 const root=new URL('..',import.meta.url).pathname;
 for(const [id,s] of Object.entries(specs.tasks)){
  assert.ok(s.steps.length>=3,id);assert.equal(s.testCases.length,3,id);
  for(const p of s.readPaths)assert.ok(sourceFile(root,p) || integration.missingInputs.includes(p),`${id}: ${p}`);
  for(const entry of s.entryPoints)assert.ok(integration.missingInputs.includes(entry.path) || sourceFile(root,entry.path).toString().includes(entry.symbol));
  assert.ok(s.submission.newFile);assert.ok(s.handoff);assert.ok(s.userChange.includes('→'));
 }
 const f=await fixture();
 await assert.rejects(observeSkyTask({root,goal:f.goal,taskId:'S0-01',owner:owner.id,assignee:owner.id,reviewers:[reviewer.id]}), /Required source unavailable: drizzle\/0019_sky_library.sql/);
 assert.throws(()=>sourceFile(root,'../secret'));assert.throws(()=>sourceFile(root,'.env.local'));
 const cliSource=readFileSync(new URL('../scripts/amc-codex.mjs',import.meta.url),'utf8');assert.match(cliSource,/applyDirectiveEvent/);
 assert.equal(typeof runCodexGoal,'function');
});

async function failedRecoveryFixture() {
 const f=await fixture();
 const issued=await issueDirective(f.goal,f.request,f.context);
 const running=await applyDirectiveEvent(issued,event(issued,'start_task'),f.context);
 const observation={...structuredClone(f.context.observation),outputEvidence:[{path:'docs/evidence/sky-launch/s0-01.json',hash:'e'.repeat(64)}]};
 const failed=await applyDirectiveEvent(running,event(running,'submit_result',owner,{outcome:'failed',summary:'Fixture failure, no external effect',deliverables:[],evidence:['docs/evidence/sky-launch/s0-01.json']}),{...f.context,observation});
 const later=now+60*60*1000+1;
 const context={...structuredClone(f.context),now:later,observation:{...observation,observedAt:new Date(later).toISOString()}};
 const resume=event(failed,'resume_task',owner,{role:'owner',reason:'Fresh owner re-evaluation before a new directive',evidence:['docs/evidence/sky-launch/s0-01.json']});
 return {f,issued,running,failed,context,resume};
}

await test('owner can recover failed or stale blocked work after expiry and source/spec/contract changes, requiring reissue',async()=>{
 for(const blocked of [false,true]) {
  const f=await failedRecoveryFixture();
  let goal=f.failed;
  if(blocked) {
   goal=applyGoalEvent(f.failed,{id:randomUUID(),type:'block_task',taskId:'S0-01',actor:owner.id,role:'worker',expectedRevision:f.failed.revision,reason:'Fixture waiting on current condition'});
   goal=reconcileDirectives(goal,{'S0-01':f.context.observation},f.context.now);
   assert.equal(goal.tasks[0].status,'blocked');assert.equal(goal.skyDirectives[0].status,'stale');
  }
  const context=structuredClone(f.context);
  context.spec.revision++;
  context.spec.writePaths.push('new-output.json');
  context.observation.taskSpecHash=await sha256(canonical(context.spec));
  context.observation.sourceInputs[0].hash='f'.repeat(64);
  context.observation.contractRefs[0].version++;
  context.observation.contractRefs[0].hash='1'.repeat(64);
  const before=structuredClone(goal),request={...f.resume,expectedRevision:goal.revision};
  const recovered=await applyDirectiveEvent(goal,request,context);
  assert.equal(recovered.tasks[0].status,'pending');assert.equal(recovered.tasks[0].startedBy,null);
  assert.deepEqual(recovered.tasks[0].attempts.at(-1).result,before.tasks[0].result);
  assert.deepEqual(recovered.tasks[0].attempts.at(-1).review,before.tasks[0].review);
  assert.equal(recovered.tasks[0].attempts.at(-1).blockReason,before.tasks[0].blockReason);
  assert.deepEqual(recovered.tasks.slice(1),before.tasks.slice(1));
  assert.deepEqual(goal,before);assert.equal(recovered.skyDirectives[0].status,'stale');
  assert.equal(recovered.skyDirectives[0].validUntil,before.skyDirectives[0].validUntil);
  assert.equal(recovered.skyDirectives[0].recovery.taskSpecHash,context.observation.taskSpecHash);
  assert.deepEqual(await applyDirectiveEvent(recovered,request,context),recovered);
  for(const type of ['start_task','submit_result','verify_task']) await assert.rejects(
   applyDirectiveEvent(recovered,event(recovered,type,type==='verify_task'?reviewer:owner),{...context,principal:type==='verify_task'?reviewer:owner}),/valid_directive_required/);
  const reissued=await issueDirective(recovered,{type:'issue_directive',directiveId:randomUUID(),taskId:'S0-01',expectedRevision:recovered.revision},context);
  const started=await applyDirectiveEvent(reissued,event(reissued,'start_task'),context);
  assert.equal(started.tasks[0].status,'running');assert.equal(validateGoal(started).ok,true);
  assert.deepEqual(started.tasks.slice(1),before.tasks.slice(1));
 }
});

await test('recovery rejects forged owner, worker role, stale revision and missing/fake/stale observation',async()=>{
 const f=await failedRecoveryFixture();const unchanged=structuredClone(f.failed);
 const reject=(eventChange={},contextChange={},pattern=/required|mismatch|forgery|granted|conflict|expired/)=>assert.rejects(
  applyDirectiveEvent(f.failed,{...f.resume,...eventChange},{...f.context,...contextChange}),pattern);
 await reject({actor:'forged'});
 await reject({actor:'other'},{principal:{id:'other',roles:['owner']}});
 await reject({}, {principal:{id:owner.id,roles:['worker']}});
 await reject({role:'worker'});
 await reject({expectedRevision:f.failed.revision-1});
 await reject({}, {observation:null});
 await reject({}, {observation:{...f.context.observation,status:'self_reported'}});
 await reject({}, {observation:{...f.context.observation,observedAt:new Date(f.context.now-60001).toISOString()}});
 await reject({}, {observation:{...f.context.observation,observedAt:new Date(f.context.now+1001).toISOString()}});
 await reject({}, {observation:{...f.context.observation,owner:'other'}});
 await reject({}, {observation:{...f.context.observation,goalId:'other'}});
 await reject({}, {spec:undefined});
 await reject({}, {spec:{...f.context.spec,revision:999}},/task_spec_hash_mismatch/);
 await reject({}, {observation:{...f.context.observation,sourceInputs:[]}});
 await reject({}, {observation:{...f.context.observation,contractRefs:[{id:'api',version:2,hash:'unverified'}]}});
 await reject({}, {observation:{...f.context.observation,locks:undefined}});
 assert.deepEqual(f.failed,unchanged);
});

await test('owner recovery reevaluates current dependencies, holds and new write-scope conflicts',async()=>{
 const f=await failedRecoveryFixture();
 const context=structuredClone(f.context);context.spec.writePaths.push('new-shared.ts');context.observation.taskSpecHash=await sha256(canonical(context.spec));
 context.observation.locks=[{directiveId:'other-task-running',writePaths:['new-shared.ts']}];
 await assert.rejects(applyDirectiveEvent(f.failed,f.resume,context),/path_conflict:other-task-running/);
 const held=structuredClone(f.failed);held.tasks[0].holds=['unresolved_execution_hold'];
 await assert.rejects(applyDirectiveEvent(held,f.resume,f.context),/execution_hold_requires_authority/);
 const goal=structuredClone(f.failed),dependent=structuredClone(f.context);
 goal.tasks[0].dependsOn=['S0-02'];dependent.spec.startConditions.dependencies=['S0-02'];
 dependent.observation.taskSpecHash=await sha256(canonical(dependent.spec));
 await assert.rejects(applyDirectiveEvent(goal,f.resume,dependent),/current_dependencies_required/);
 dependent.observation.dependencyAcceptances=[{taskId:'S0-02',reviewRevision:1,evidenceHash:'a'.repeat(64)}];
 await assert.rejects(applyDirectiveEvent(goal,f.resume,dependent),/dependency_not_accepted/);
 await assert.rejects(applyDirectiveEvent(f.failed,f.resume,{...f.context,observation:{...f.context.observation,requirementRefs:['stale-requirement']}}),/current_task_conditions_changed/);
 const unreviewed=structuredClone(f.failed);unreviewed.tasks[0].status='submitted';
 await assert.rejects(applyDirectiveEvent(unreviewed,f.resume,f.context),/recoverable_task_required/);
});

await test('expiry still rejects worker start/submission and reviewer verification',async()=>{
 const f=await failedRecoveryFixture();
 await assert.rejects(applyDirectiveEvent(f.issued,event(f.issued,'start_task'),f.context),/directive_expired/);
 await assert.rejects(applyDirectiveEvent(f.running,event(f.running,'submit_result',owner,{outcome:'succeeded',summary:'attempt',deliverables:[],evidence:[]}),f.context),/directive_expired/);
 const submitted=await applyDirectiveEvent(f.running,event(f.running,'submit_result',owner,{outcome:'succeeded',summary:'Fixture output',deliverables:['docs/evidence/sky-launch/s0-01.json'],evidence:['docs/evidence/sky-launch/s0-01.json']}),{...f.f.context,observation:{...f.f.context.observation,outputEvidence:f.context.observation.outputEvidence}});
 await assert.rejects(applyDirectiveEvent(submitted,event(submitted,'verify_task',reviewer,{accepted:true}),{...f.context,principal:reviewer}),/directive_expired/);
});

await test('recovery transaction refuses changed observations or lost CAS without persisting pending state',async()=>{
 const f=await failedRecoveryFixture();let writes=0,reads=0;
 const adapter={transaction:async(_,__,fn)=>fn(),read:async()=>f.failed,observe:async()=>{
  const c=structuredClone(f.context);if(reads++)c.observation.contractRefs[0].hash='2'.repeat(64);return c;
 },compareAndSwap:async()=>{writes++;return true;}};
 await assert.rejects(transactDirective(adapter,owner,{...f.resume,goalId:f.failed.id}),/observation_changed_before_commit/);
 assert.equal(writes,0);assert.equal(f.failed.tasks[0].status,'failed');
 adapter.observe=async()=>structuredClone(f.context);adapter.compareAndSwap=async()=>false;
 await assert.rejects(transactDirective(adapter,owner,{...f.resume,goalId:f.failed.id}),/Revision conflict/);
 assert.equal(f.failed.tasks[0].status,'failed');
});

await test('integrated Sky sources do not bypass missing inputs, trusted observation or owner acceptance', async () => {
 const root=new URL('..',import.meta.url).pathname;
 for (const path of integration.integratedInputs) assert.ok(sourceFile(root,path), path);
 for (const path of integration.missingInputs) assert.equal(sourceFile(root,path), null, path);
 const f=await fixture();
 const contracts=read('data/amc/sky-contracts-v1.json').contracts;
 for (const [taskId, spec] of Object.entries(specs.tasks)) {
  const inputs=[...spec.readPaths,...contracts.filter(c=>c.consumerTaskIds.includes(taskId)).flatMap(c=>c.paths)];
  if (!inputs.some(p=>integration.missingInputs.includes(p))) continue;
  await assert.rejects(observeSkyTask({root,goal:f.goal,taskId,owner:owner.id,assignee:owner.id,reviewers:[reviewer.id]}), /Required source unavailable/);
 }
 await assert.rejects(issueDirective(f.goal,f.request,{...f.context,observation:null}), /trusted_observation_required/);
 assert.equal(f.goal.overallAcceptance.accepted,false);
 assert.equal(original.overallAcceptance.accepted,false);
});
