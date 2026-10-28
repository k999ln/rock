import { readFileSync } from 'node:fs';
import { normalize, resolve, sep } from 'node:path';

export const executionStages = ['request', 'source', 'ownership', 'deliverable', 'independentReview', 'gitSave', 'headCI', 'mainMerge', 'mergeCI'];
const text = value => typeof value === 'string' && value.trim().length > 0;
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const check = (value, message) => { if (!value) throw new Error('Execution control: ' + message); };

/** Structural consistency only. Source hashes, CI runs and product evidence need independent readback. */
export function validateDevelopmentExecution(overlay) {
  check(overlay?.schema === 'rockstaros.current-execution/1', 'missing current overlay');
  check(sha(overlay.baseMain), 'baseMain must be a40-character SHA');
  check(overlay.maxActiveTotal === 3 && Array.isArray(overlay.activeActors) && overlay.activeActors.length <= 3 && new Set(overlay.activeActors).size === overlay.activeActors.length, 'actor limit/conflict');
  check(overlay.retry?.totalAttemptsPerUnitAndRootCause === 3 && overlay.retry.resetOnModelChange === false && overlay.retry.resetOnOwnerChange === false, 'retry policy reset');
  check(Array.isArray(overlay.queue) && overlay.queue.length > 0, 'queue missing');
  const primaries = overlay.queue.filter(item => item.primary);
  check(primaries.length === 1, 'exactly one product primary required');
  const primary = primaries[0];
  check(primary.workClass === 'product_feasibility' && primary.status === 'working', 'primary must advance product feasibility');
  check(['product_decision', 'usable_experience'].includes(primary.deliverableKind), 'management cannot replace product primary');
  const ids = new Set(), paths = new Set();
  const blocked = item => {
    for (const key of ['stopReason', 'nextOwner', 'releaseOwner', 'releaseCondition', 'nextPermissionFreeAction']) check(text(item[key]), item.id + ': blocked ' + key);
  };
  for (const item of overlay.queue) {
    check(text(item.id) && !ids.has(item.id), 'unit ownership conflict'); ids.add(item.id);
    check(text(item.author) && text(item.nextOwner) && text(item.deliverableDescription) && text(item.artifactId), item.id + ': ownership/deliverable missing');
    check(Array.isArray(item.editingPaths) && item.editingPaths.length > 0, item.id + ': editing ownership missing');
    for (const path of item.editingPaths) {
      check(text(path) && path === normalize(path) && !path.includes('\\') && !path.split('/').includes('..') && path !== '.' && path !== '/', 'canonical editing path required');
      const absolute = resolve(path);
      check([...paths].every(other => absolute !== other && !absolute.startsWith(other + sep) && !other.startsWith(absolute + sep)), 'editing ownership conflict');
      paths.add(absolute);
    }
    if (item.workClass === 'acceptance_gate_repair') check(item.servesPrimary === primary.id && text(item.requiredGateRef), 'unrelated branch repair');
    if (!item.primary) check(['acceptance_gate_repair', 'execution_control'].includes(item.workClass), 'unprioritized secondary work');
    if (item.status === 'blocked' || Object.values(item.stages ?? {}).some(stage => stage?.status === 'blocked')) blocked(item);
    if (text(item.reviewer)) check(item.reviewer !== item.author, 'author cannot be independent reviewer');
    check(item.waitForRootReply === false, 'unnecessary Root reply gate');
    check(item.stages && Object.keys(item.stages).sort().join(',') === [...executionStages].sort().join(','), item.id + ': separate lifecycle stages required');
    for (const name of executionStages) {
      const stage = item.stages[name];
      check(['not_started', 'working', 'blocked', 'passed', 'unknown'].includes(stage?.status), name + ': invalid state');
      if (stage.status !== 'passed') continue;
      check(text(stage.evidence?.ref), name + ': evidence required');
      if (['deliverable', 'independentReview', 'gitSave', 'headCI', 'mainMerge', 'mergeCI'].includes(name)) {
        check(stage.evidence.artifactId === item.artifactId && digest(stage.evidence.sha256), name + ': artifact/hash binding');
        check(stage.evidence.sha256 === item.stages.deliverable.evidence?.sha256, name + ': different artifact bytes');
      }
    }
    const s = item.stages, passed = name => s[name].status === 'passed';
    if (passed('deliverable')) {
      check(['request', 'source', 'ownership'].every(passed), 'deliverable before request/source/ownership');
      check(['product_decision', 'usable_experience', 'acceptance_gate_repair', 'execution_control'].includes(item.deliverableKind), 'prompt/notification/shape check is not a deliverable');
    }
    if (passed('independentReview')) check(passed('deliverable') && text(item.reviewer) && item.reviewer !== item.author, 'independent reviewer required');
    if (passed('gitSave')) check(passed('independentReview') && sha(s.gitSave.evidence.commitSha), 'reviewed branch save required');
    if (passed('headCI')) check(passed('gitSave') && s.headCI.evidence.commitSha === s.gitSave.evidence.commitSha && s.headCI.evidence.checksPassed === true, 'head CI SHA mismatch');
    if (passed('mainMerge')) check(passed('headCI') && sha(s.mainMerge.evidence.commitSha) && s.mainMerge.evidence.commitSha !== s.gitSave.evidence.commitSha && s.mainMerge.evidence.mergeMethod === 'merge' && s.mainMerge.evidence.parents?.length === 2 && s.mainMerge.evidence.parents[0] === overlay.baseMain && s.mainMerge.evidence.parents[1] === s.gitSave.evidence.commitSha, 'branch save is not normal main integration');
    if (passed('mergeCI')) check(passed('mainMerge') && s.mergeCI.evidence.commitSha === s.mainMerge.evidence.commitSha && s.mergeCI.evidence.checksPassed === true, 'merge CI SHA mismatch');
    if (item.accepted) check(executionStages.every(passed), 'accepted before all evidence gates');
    if (item.productAccepted) check(item.accepted && ['product_decision', 'usable_experience'].includes(item.deliverableKind) && ['measured_bench', 'independent_product_judgment'].includes(item.productEvidence?.kind) && text(item.productEvidence?.criterionRef) && text(item.productEvidence?.observationRef), 'product acceptance needs substantive evidence');
    if (item.physicalAccepted) check(item.accepted && item.productAccepted && executionStages.every(passed) && item.productEvidence?.kind === 'measured_bench' && text(item.productEvidence?.criterionRef) && text(item.productEvidence?.observationRef), 'physical acceptance needs measured bench and all gates');
  }
  check(Array.isArray(overlay.blockedWork), 'blocked work list missing');
  for (const item of overlay.blockedWork) blocked(item);
  const causes = new Set();
  for (const attempt of overlay.attemptLedger ?? []) {
    const key = attempt.unit + '/' + attempt.rootCause;
    check(text(attempt.unit) && text(attempt.rootCause) && !causes.has(key) && Number.isInteger(attempt.attempts) && attempt.attempts >= 1 && attempt.attempts <= 3, 'unit/cause retry cap');
    causes.add(key);
  }
  return { queued: overlay.queue.length, primary: primary.id, structuralOnly: true };
}

export function checkDevelopmentExecutionFile(routingPath, additionalFixturePath) {
  const routing = JSON.parse(readFileSync(routingPath, 'utf8'));
  const result = validateDevelopmentExecution(routing.currentExecution);
  // Additional negative-fixture validation never replaces or skips the actual repository overlay.
  if (additionalFixturePath) validateDevelopmentExecution(JSON.parse(readFileSync(additionalFixturePath, 'utf8')));
  return result;
}
