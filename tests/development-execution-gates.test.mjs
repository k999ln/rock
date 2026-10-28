import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateDevelopmentExecution, executionStages } from '../scripts/check-development-execution.mjs';

const fixture = () => structuredClone(JSON.parse(readFileSync(new URL('../data/development-model-routing.json', import.meta.url))).currentExecution);
function acceptedControl() {
  const x = fixture(), q = x.queue[1];
  q.accepted = true;
  for (const name of executionStages) q.stages[name] = { status: 'passed', evidence: { ref: 'test-only/evidence', artifactId: q.artifactId, sha256: 'a'.repeat(64) } };
  q.stages.gitSave.evidence.commitSha = '1'.repeat(40);
  q.stages.headCI.evidence = { ...q.stages.headCI.evidence, commitSha: '1'.repeat(40), checksPassed: true };
  q.stages.mainMerge.evidence = { ...q.stages.mainMerge.evidence, commitSha: '2'.repeat(40), mergeMethod: 'merge', parents: [x.baseMain, '1'.repeat(40)] };
  q.stages.mergeCI.evidence = { ...q.stages.mergeCI.evidence, commitSha: '2'.repeat(40), checksPassed: true };
  return x;
}
await test('current working mii primary and unaccepted control are structurally valid', () => {
  assert.deepEqual(validateDevelopmentExecution(fixture()), { queued: 2, primary: 'mii-optical-feasibility', structuralOnly: true });
  assert.equal(validateDevelopmentExecution(acceptedControl()).structuralOnly, true);
});
for (const [name, mutate] of [
  ['evidence-free completion', x => { x.queue[1].stages.deliverable.evidence = null; }],
  ['self review', x => { x.queue[1].reviewer = x.queue[1].author; }],
  ['different artifact', x => { x.queue[1].stages.headCI.evidence.artifactId = 'other'; }],
  ['different artifact hash', x => { x.queue[1].stages.independentReview.evidence.sha256 = 'b'.repeat(64); }],
  ['branch save counted as main', x => { x.queue[1].stages.mainMerge.evidence.commitSha = '1'.repeat(40); }],
  ['wrong head SHA CI', x => { x.queue[1].stages.headCI.evidence.commitSha = '3'.repeat(40); }],
  ['wrong merge SHA CI', x => { x.queue[1].stages.mergeCI.evidence.commitSha = '3'.repeat(40); }],
  ['wrong normal merge parent', x => { x.queue[1].stages.mainMerge.evidence.parents[1] = '3'.repeat(40); }],
  ['deliverable before source', x => { x.queue[1].stages.source.status = 'unknown'; }],
  ['no product primary', x => { x.queue[0].primary = false; }],
  ['unverified baseline SHA', x => { x.baseMain = 'unverified-baseline'; }],
  ['management replacing product primary', x => { x.queue[0].deliverableKind = 'execution_control'; }],
  ['unsupported physical flag', x => { x.queue[0].physicalAccepted = true; }],
  ['competing primary', x => { x.queue[1].primary = true; }],
  ['editing ownership conflict', x => { x.queue[1].editingPaths.push(x.queue[0].editingPaths[0]); }],
  ['path alias ownership conflict', x => { x.queue[1].editingPaths.push(x.queue[0].editingPaths[0].replace('/decision.json', '/./decision.json')); }],
  ['ancestor ownership conflict', x => { x.queue[1].editingPaths.push('/private/tmp/mii-execution-recovery-20261028/mini'); }],
  ['blocked without next owner', x => { delete x.blockedWork[0].nextOwner; }],
  ['blocked without release condition', x => { delete x.blockedWork[0].releaseCondition; }],
  ['blocked stage without release owner', x => { x.queue[1].stages.deliverable.status = 'blocked'; }],
  ['ceremonial Root reply gate', x => { x.queue[1].waitForRootReply = true; }],
  ['unrelated branch bug', x => { x.queue[1].workClass = 'acceptance_gate_repair'; x.queue[1].servesPrimary = 'other'; }],
  ['prompt counted as deliverable', x => { x.queue[1].deliverableKind = 'prompt'; }],
  ['shape check counted as product', x => { x.queue[1].deliverableKind = 'shape_check'; x.queue[1].productAccepted = true; }],
  ['notification counted as product', x => { x.queue[1].deliverableKind = 'notification'; x.queue[1].productAccepted = true; }],
  ['control accepted as product', x => { x.queue[1].productAccepted = true; }],
  ['model change resets retry', x => { x.retry.resetOnModelChange = true; }],
  ['owner change resets retry', x => { x.retry.resetOnOwnerChange = true; }],
  ['cause attempt budget exceeded', x => { x.attemptLedger[0].attempts = 4; }],
  ['duplicated cause budget', x => { x.attemptLedger.push({ ...x.attemptLedger[0] }); }],
  ['four simultaneous actors', x => { x.activeActors = ['Root', 'Mini', 'Git', 'new-worker']; }],
]) await test('rejects ' + name, () => { const x = acceptedControl(); mutate(x); assert.throws(() => validateDevelopmentExecution(x), /Execution control/); });

await test('normal mission:check rejects an additional invalid fixture without replacing the real overlay', () => {
  const dir = mkdtempSync(join(tmpdir(), 'execution-control-negative-'));
  try {
    const path = join(dir, 'invalid.json'), x = fixture(); x.queue[0].primary = false;
    writeFileSync(path, JSON.stringify(x));
    const result = spawnSync('npm', ['run', 'mission:check'], { cwd: new URL('..', import.meta.url), encoding: 'utf8', env: { ...process.env, ROCK_EXECUTION_CONTROL_NEGATIVE_FIXTURE: path } });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /exactly one product primary required/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
