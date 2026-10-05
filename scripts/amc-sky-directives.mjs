import { applyGoalEvent, validateGoal, revalidationImpact } from './amc-goal-engine.mjs';
import { grantSkyTransition } from './amc-sky-authority.mjs';

export const canonical = (value) => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
export async function sha256(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
}
const must = (condition, reason) => { if (!condition) throw new Error(reason); };
const overlaps = (a, b) => a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
const writable = (d, path) => d.writePaths.some(p => overlaps(p, path));
const validPath = p => typeof p === 'string' && p.length > 0 && !p.startsWith('/') && !p.split('/').some(s => !s || s === '..' || s === '.') && !p.includes('\\') && p.split('').every(c=>c.charCodeAt(0)>=32);
const same = (a, b) => canonical(a) === canonical(b);

// Observation and principal MUST come from a server/OS adapter, never request bodies.
// observe + reobserve + CAS must run inside its exclusive transaction/lease.
export function inspectDirective(goal, directive, observation, phase = 'start', now = Date.now()) {
  const reasons = [];
  const fail = s => reasons.push(s);
  if (!observation || observation.status !== 'verified') return ['observation_unavailable'];
  if (observation.owner !== directive.owner || observation.goalId !== goal.id) fail('owner_mismatch');
  if (!Number.isFinite(Date.parse(observation.observedAt)) || now - Date.parse(observation.observedAt) > directive.validityPolicy.maxObservationAgeMs || Date.parse(observation.observedAt) > now + 1000) fail('observation_expired');
  if (now >= Date.parse(directive.validUntil)) fail('directive_expired');
  if (observation.taskSpecHash !== directive.taskSpecHash) fail('task_spec_changed');
  if (!same(observation.requirementRefs, directive.requirementRefs)) fail('requirements_changed');
  if (!same(observation.dependencyAcceptances, directive.dependencyAcceptances)) fail('dependency_acceptance_changed');
  const task = goal.tasks.find(t => t.id === directive.taskId);
  if (!task || !task.dependsOn.every(id => goal.tasks.find(t => t.id === id)?.status === 'done')) fail('dependency_not_accepted');
  const changed = new Set();
  for (const old of directive.sourceInputs) if (observation.sourceInputs.find(p => p.path === old.path)?.hash !== old.hash) changed.add(old.path);
  for (const current of observation.sourceInputs) if (!directive.sourceInputs.some(p => p.path === current.path)) changed.add(current.path);
  const implementing = ['checkpoint', 'submit', 'review'].includes(phase);
  for (const path of changed) if (!implementing || !writable(directive, path)) fail(`source_changed:${path}`);
  for (const old of directive.contractRefs) {
    const current = observation.contractRefs.find(c => c.id === old.id);
    if (!current || current.version !== old.version) { fail(`contract_changed:${old.id}`); continue; }
    if (current.hash !== old.hash && (!implementing || !current.changedPaths?.length || current.changedPaths.some(p => !writable(directive, p)))) fail(`contract_changed:${old.id}`);
  }
  if (observation.contractRefs.length !== directive.contractRefs.length) fail('contract_set_changed');
  for (const path of observation.changedPaths || []) if (!writable(directive, path)) fail(`outside_write_scope:${path}`);
  for (const lock of observation.locks || []) if (lock.directiveId !== directive.directiveId && lock.writePaths.some(p => directive.writePaths.some(q => overlaps(p, q)))) fail(`path_conflict:${lock.directiveId}`);
  return [...new Set(reasons)];
}

export async function dependencyAcceptances(goal, readEvidence) {
  const result = [];
  for (const task of goal.tasks) if (task.status === 'done') {
    must(task.review?.accepted && task.review.actor !== task.startedBy, `dependency_not_independent:${task.id}`);
    const files = [];
    for (const path of new Set([...task.evidence, ...task.review.evidence])) files.push({path, hash:await sha256(await readEvidence(path))});
    result.push({taskId:task.id, reviewRevision:goal.eventLog.filter(e=>e.taskId===task.id && e.type==='verify_task').at(-1)?.revision ?? null, evidenceHash:await sha256(canonical({review:task.review,files}))});
  }
  return result;
}

export async function issueDirective(goal, request, context) {
  const {principal, observation:o, spec, now = Date.now()} = context;
  must(principal?.id && principal.roles?.includes('owner'), 'authenticated_owner_required');
  must(o?.status === 'verified' && o.owner === principal.id && o.goalId === goal.id, 'trusted_observation_required');
  must(goal.skyBrief && goal.state === 'active', 'approved_sky_goal_required');
  const existing = goal.skyDirectives?.find(d => d.directiveId === request.directiveId);
  if (existing) { must(existing.requestHash === await sha256(canonical(request)), 'Idempotency key reused with different directive'); return structuredClone(goal); }
  must(request.expectedRevision === goal.revision, 'Revision conflict');
  const task = goal.tasks.find(t => t.id === request.taskId);
  must(task && task.status === 'pending' && spec && spec.taskId === task.id, 'pending_readiness_task_required');
  must(spec.writePaths.every(validPath) && spec.readPaths.every(validPath), 'invalid_scope_path');
  must(o.taskSpecHash === await sha256(canonical(spec)), 'task_spec_hash_mismatch');
  must(o.assignee && o.reviewers?.length && !o.reviewers.includes(o.assignee), 'independent_assignees_required');
  const old = goal.skyDirectives?.find(d => d.directiveId === request.directiveId);
  const requestHash = await sha256(canonical(request));
  if (old) { must(old.requestHash === requestHash, 'Idempotency key reused with different directive'); return structuredClone(goal); }
  must(typeof request.directiveId === 'string' && request.directiveId.length > 0, 'directive_id_required');
  const previous = goal.skyDirectives?.filter(d => d.taskId === task.id).at(-1);
  const directive = { directiveId:request.directiveId, taskId:task.id, taskSpecRevision:spec.revision, taskSpecHash:o.taskSpecHash,
    requirementRefs:o.requirementRefs, contractRefs:o.contractRefs, dependencyAcceptances:o.dependencyAcceptances,
    readPaths:spec.readPaths, writePaths:spec.writePaths, sourceInputs:o.sourceInputs,
    owner:o.owner, assignee:o.assignee, reviewers:o.reviewers, issuedAt:new Date(now).toISOString(), observedAt:o.observedAt,
    validityPolicy:{maxObservationAgeMs:60000, checkpoints:['start','submit','review','before_external_effect']},
    validUntil:new Date(now+60*60*1000).toISOString(), supersedes:previous?.directiveId ?? null, status:'issued', reason:[], requestHash };
  const reasons = inspectDirective(goal, directive, o, 'start', now);
  must(!reasons.length, reasons.join('; '));
  const next = structuredClone(goal); next.skyDirectives ||= [];
  for (const d of next.skyDirectives) if (d.taskId===task.id && d.status==='issued') {d.status='stale';d.reason=['superseded'];d.supersededBy=directive.directiveId;}
  next.skyDirectives.push(directive); next.revision++;
  next.eventLog.push({id:request.directiveId,type:'issue_directive',taskId:task.id,actor:principal.id,at:directive.issuedAt,outcome:null,summary:'Issued against trusted observation',accepted:null,revision:next.revision,fingerprint:canonical(request)});
  next.skyDirectiveEvents ||= []; next.skyDirectiveEvents.push({type:'issue',id:request.directiveId,revision:next.revision,actor:principal.id,at:directive.issuedAt});
  return next;
}

export function reconcileDirectives(goal, observations, now = Date.now()) {
  const next = structuredClone(goal); let changed = false;
  for (const d of next.skyDirectives || []) {
    if (['stale','accepted'].includes(d.status)) continue;
    const phase = d.status==='issued' ? 'start' : d.status==='submitted' ? 'review' : 'checkpoint';
    const reasons = inspectDirective(next,d,observations[d.taskId],phase,now);
    if (reasons.length) {d.status='stale';d.reason=reasons;d.invalidatedAt=new Date(now).toISOString();changed=true;}
  }
  if (changed) { next.revision++; next.eventLog.push({id:crypto.randomUUID(),type:'invalidate_directives',taskId:null,actor:'trusted-observer',at:new Date(now).toISOString(),outcome:null,summary:'Related observation changed; task progress retained',accepted:null,revision:next.revision,fingerprint:canonical(observations)}); }
  return next;
}

// Recovery only returns a task to planning. It never renews execution authority.
// Validate today's trusted spec/observation, not the expired execution snapshot.
async function requireRecoveryObservation(goal, directive, context, statuses = ['failed','blocked']) {
  const {spec, observation:o, now=Date.now()} = context;
  const task=goal.tasks.find(t=>t.id===directive.taskId);
  must(goal.skyBrief && goal.state==='active' && task && statuses.includes(task.status), 'recoverable_task_required');
  must(Array.isArray(task.holds) && task.holds.length===0, 'execution_hold_requires_authority');
  must(goal.skyDirectives.filter(d=>d.taskId===task.id).at(-1)===directive, 'latest_directive_required');
  must(o?.status==='verified' && o.owner===directive.owner && o.goalId===goal.id, 'trusted_observation_required');
  const observed=Date.parse(o.observedAt);
  must(Number.isFinite(now) && Number.isFinite(observed) && now-observed<=60000 && observed<=now+1000, 'observation_expired');
  must(spec?.taskId===task.id && Array.isArray(spec.readPaths) && Array.isArray(spec.writePaths) && spec.writePaths.length && [...spec.readPaths,...spec.writePaths].every(validPath), 'current_task_spec_required');
  must(o.taskSpecHash===await sha256(canonical(spec)), 'task_spec_hash_mismatch');
  must(same(o.requirementRefs,task.requirementIds||[]) && same(spec.startConditions?.dependencies,task.dependsOn), 'current_task_conditions_changed');
  must(Array.isArray(o.sourceInputs) && new Set(o.sourceInputs.map(p=>p.path)).size===o.sourceInputs.length && o.sourceInputs.every(p=>validPath(p.path) && (p.hash==='absent'||/^[a-f0-9]{64}$/.test(p.hash))) && spec.readPaths.every(p=>o.sourceInputs.some(s=>s.path===p && s.hash!=='absent')), 'current_sources_required');
  must(Array.isArray(o.contractRefs) && new Set(o.contractRefs.map(c=>c.id)).size===o.contractRefs.length && o.contractRefs.every(c=>typeof c.id==='string' && c.id && Number.isSafeInteger(c.version) && c.version>0 && /^[a-f0-9]{64}$/.test(c.hash)), 'current_contracts_required');
  must(Array.isArray(o.dependencyAcceptances) && o.dependencyAcceptances.length===task.dependsOn.length && new Set(o.dependencyAcceptances.map(d=>d.taskId)).size===task.dependsOn.length, 'current_dependencies_required');
  for (const id of task.dependsOn) {
    const dependency=goal.tasks.find(t=>t.id===id), observedDependency=o.dependencyAcceptances.find(d=>d.taskId===id);
    const reviewRevision=goal.eventLog.filter(e=>e.taskId===id && e.type==='verify_task').at(-1)?.revision;
    must(dependency?.status==='done' && dependency.review?.accepted && dependency.review.actor!==dependency.startedBy && observedDependency && reviewRevision!==undefined && observedDependency.reviewRevision===reviewRevision && /^[a-f0-9]{64}$/.test(observedDependency.evidenceHash), 'dependency_not_accepted');
  }
  must(Array.isArray(o.locks) && o.locks.every(l=>typeof l.directiveId==='string' && Array.isArray(l.writePaths) && l.writePaths.every(validPath)), 'current_locks_required');
  for (const lock of o.locks) must(lock.directiveId===directive.directiveId || !lock.writePaths.some(p=>spec.writePaths.some(q=>overlaps(p,q))), `path_conflict:${lock.directiveId}`);
}

async function requireRevalidationObservation(goal, event, directive, context) {
  must(event.accepted===undefined && event.outcome===undefined && event.criterionResults===undefined, 'revalidation_cannot_grant_acceptance');
  const impact = revalidationImpact(goal, directive.taskId);
  must(same(event.affectedTaskIds,impact.affectedTaskIds), 'revalidation_impact_acknowledgement_required');
  must(!impact.activeTaskIds.length, `active_downstream_work:${impact.activeTaskIds.join(',')}`);
  must(typeof event.reason==='string' && event.reason.trim() &&
    Array.isArray(event.evidence) && event.evidence.length && event.evidence.every(validPath), 'revalidation_reason_evidence_required');
  const evidence=context.observation?.outputEvidence;
  must(Array.isArray(evidence) && event.evidence.every(path=>evidence.some(e=>e.path===path && /^[a-f0-9]{64}$/.test(e.hash))), 'verified_revalidation_evidence_required');
  await requireRecoveryObservation(goal,directive,context,['done']);
  const acceptedDescendants=impact.acceptedTaskIds.filter(id=>id!==directive.taskId);
  const observations=context.revalidationObservations ?? {};
  must(observations && !Array.isArray(observations) && same(Object.keys(observations).sort(),acceptedDescendants), 'downstream_observations_required');
  for (const id of acceptedDescendants) {
    const latest=goal.skyDirectives.filter(d=>d.taskId===id).at(-1);
    must(latest && latest.owner===context.principal.id, 'downstream_owner_directive_required');
    await requireRecoveryObservation(goal,latest,{...observations[id],now:context.now},['done']);
  }
  return impact;
}

export async function applyDirectiveEvent(goal, event, context) {
  const {principal, observation, now=Date.now()} = context;
  must(principal?.id && principal.roles?.length,'authenticated_principal_required');
  must(event.actor === principal.id,'actor_forgery');
  must(principal.roles.includes(event.role),'role_not_granted');
  const replay = goal.skyCommandReceipts?.find(r=>r.id===event.id);
  const eventHash = await sha256(canonical(event));
  if(replay){must(replay.hash===eventHash,'Idempotency key reused with different event');return structuredClone(goal);}
  must(event.expectedRevision===goal.revision,'Revision conflict');
  const d=goal.skyDirectives?.find(x=>x.directiveId===event.directiveId && x.taskId===event.taskId);
  const phase={start_task:'start',submit_result:'submit',verify_task:'review',checkpoint:'checkpoint',resume_task:'resume',revalidate_task:'revalidate'}[event.type];
  must(phase,'unsupported_directive_event');
  const maintenance=['resume','revalidate'].includes(phase);
  must(d && (maintenance||d.status!=='stale'),'valid_directive_required');
  must(event.role === (phase==='review'?'reviewer':maintenance?'owner':'worker'),'event_role_mismatch');
  must(maintenance ? principal.id===d.owner && principal.roles.includes('owner') : phase==='review' ? d.reviewers.includes(principal.id) && principal.id!==d.assignee : d.assignee===principal.id,'assignee_mismatch');
  let impact;
  if (phase==='resume') await requireRecoveryObservation(goal,d,context);
  else if (phase==='revalidate') impact=await requireRevalidationObservation(goal,event,d,context);
  else {
    const reasons=inspectDirective(goal,d,observation,phase,now);
    must(!reasons.length,reasons.join('; '));
  }
  if (phase==='checkpoint') return structuredClone(goal);
  if (phase==='submit') {
    must(event.deliverables.every(p=>writable(d,p)), 'outside_write_scope');
    must(observation.outputEvidence?.length && event.evidence.every(p=>observation.outputEvidence.some(e=>e.path===p && /^[a-f0-9]{64}$/.test(e.hash))), 'verified_output_evidence_required');
  }
  if (phase==='review') must(same(d.submissionInputs,observation.sourceInputs) && same(d.submissionEvidence,observation.submittedEvidence), 'submitted_evidence_changed');
  const normalized={...event,at:new Date(now).toISOString()};
  delete normalized.directiveId;
  const next=applyGoalEvent(goal,normalized,grantSkyTransition(goal,normalized));
  const current=next.skyDirectives.find(x=>x.directiveId===d.directiveId);
  if (phase==='revalidate') {
    for(const old of next.skyDirectives.filter(x=>impact.affectedTaskIds.includes(x.taskId))) {
      old.status='stale';old.reason=[...new Set([...(old.reason||[]),'owner_revalidation_requires_reissue'])];old.invalidatedAt=normalized.at;
    }
    for (const id of impact.acceptedTaskIds) {
      const latest=next.skyDirectives.filter(x=>x.taskId===id).at(-1);
      const observed=id===d.taskId?observation:context.revalidationObservations[id].observation;
      latest.revalidation={actor:principal.id,at:normalized.at,eventId:event.id,reason:event.reason,evidence:structuredClone(event.evidence),taskSpecHash:observed.taskSpecHash,sourceInputs:structuredClone(observed.sourceInputs),contractRefs:structuredClone(observed.contractRefs),dependencyAcceptances:structuredClone(observed.dependencyAcceptances)};
    }
    next.skyDirectiveEvents ||= [];
    next.skyDirectiveEvents.push({type:'revalidate',id:event.id,actor:principal.id,at:normalized.at,revision:next.revision,...impact});
  }
  if(phase==='resume') {
    for(const old of next.skyDirectives.filter(x=>x.taskId===d.taskId)) {
      old.status='stale';old.reason=[...new Set([...(old.reason||[]),'owner_recovery_requires_reissue'])];old.invalidatedAt=normalized.at;
    }
    current.recovery={actor:principal.id,at:normalized.at,taskSpecHash:observation.taskSpecHash,sourceInputs:structuredClone(observation.sourceInputs),contractRefs:structuredClone(observation.contractRefs),dependencyAcceptances:structuredClone(observation.dependencyAcceptances)};
  }
  current.status=phase==='start'?'running':phase==='submit'?(event.outcome==='failed'?'failed':'submitted'):maintenance?'stale':event.accepted?'accepted':'rejected';
  if(phase==='start') current.startedAt=normalized.at;
  if(phase==='submit'){current.submissionInputs=observation.sourceInputs;current.submissionEvidence=observation.outputEvidence;current.proposedContracts=observation.contractRefs;}
  next.skyCommandReceipts ||= []; next.skyCommandReceipts.push({id:event.id,hash:eventHash});
  const validation=validateGoal(next); must(validation.ok,validation.errors.join('; '));
  return next;
}

// A transaction adapter must authorize principals, acquire cross-Goal path locks,
// observe trusted source/evidence, and atomically CAS both observation and Goal.
export async function transactDirective(adapter, principal, request) {
  must(adapter?.transaction && adapter?.observe && adapter?.compareAndSwap,'trusted_observation_adapter_unavailable');
  return adapter.transaction(principal,request.goalId,async () => {
    const goal=await adapter.read(principal,request.goalId);
    must(goal,'Goal not found');
    const first=await adapter.observe(principal,goal,request);
    const context={...first,principal};
    const next=request.type==='issue_directive' ? await issueDirective(goal,request,context) : await applyDirectiveEvent(goal,request,context);
    const second=await adapter.observe(principal,goal,request);
    const material = (view) => ({...view, now:undefined, observation:{...view.observation, observedAt:undefined},
      revalidationObservations:view.revalidationObservations && Object.fromEntries(Object.entries(view.revalidationObservations).map(([id,c])=>[id,{...c,now:undefined,observation:{...c.observation,observedAt:undefined}}]))});
    must(same(material(first),material(second)),'observation_changed_before_commit');
    if(request.type==='revalidate_task') await applyDirectiveEvent(goal,request,{...second,principal});
    must(await adapter.compareAndSwap(principal,goal,next,first),'Revision conflict');
    return next;
  });
}
