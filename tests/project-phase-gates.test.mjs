import test from 'node:test';
import assert from 'node:assert/strict';
import { phaseGateEvidencePaths, renderPhaseGates, validatePhaseGates } from '../scripts/project-phase-gates.mjs';

const tasks = [{ id: 'B04' }, { id: 'V01' }, { id: 'GX01' }];
const evidence = 'docs/prompts/os-operational-base-next.md';
const existing = new Set([evidence]);
const gate = (id = 'B04-INTEGRATED', overrides = {}) => ({
  id, task: 'B04', status: 'planned', dependsOn: [], evidence: [evidence], title: '統合', ...overrides,
});

void test('old status without phase gates retains compatibility and has no extra output', () => {
  assert.deepEqual(validatePhaseGates(tasks, undefined), []);
  assert.deepEqual(renderPhaseGates(), []);
  assert.deepEqual(renderPhaseGates([]), []);
});

void test('valid phase graph distinguishes an earlier gate from a whole task completion', () => {
  const gates = [gate('B04-INTEGRATED', { status: 'done' }),
    gate('V01-BOOT', { task: 'V01', dependsOn: ['B04-INTEGRATED'], title: '起動基礎' }),
    gate('GX01-CONTRACT', { task: 'GX01', dependsOn: ['B04-INTEGRATED'], title: '交換契約' })];
  const before = structuredClone(gates);
  assert.deepEqual(validatePhaseGates(tasks, gates, existing), gates);
  assert.deepEqual(gates, before);
});

void test('phase gate fields and statuses are required and checked', () => {
  assert.throws(() => validatePhaseGates(tasks, null), /配列/);
  assert.throws(() => validatePhaseGates(tasks, {}), /配列/);
  assert.throws(() => validatePhaseGates(tasks, [null]), /ID/);
  for (const field of ['id', 'task', 'status', 'dependsOn', 'evidence']) {
    const value = gate();
    delete value[field];
    assert.throws(() => validatePhaseGates(tasks, [value], existing));
  }
  for (const overrides of [
    { status: 'in_progress' }, { id: '' }, { task: 'unknown' }, { dependsOn: [null] },
    { evidence: [42] }, { evidence: [''] }, { title: '' },
  ]) assert.throws(() => validatePhaseGates(tasks, [gate(undefined, overrides)], existing));
});

void test('duplicate gate IDs and duplicate dependencies are rejected', () => {
  assert.throws(() => validatePhaseGates(tasks, [gate(), gate()], existing), /IDが重複/);
  assert.throws(() => validatePhaseGates(tasks, [gate(), gate('V01-BOOT', {
    task: 'V01', dependsOn: ['B04-INTEGRATED', 'B04-INTEGRATED'],
  })], existing), /依存が重複/);
});

void test('dependencies refer to gates only and may not be absent or self-referential', () => {
  for (const dependency of ['B04', 'MISSING', 'B04-INTEGRATED']) {
    assert.throws(() => validatePhaseGates(tasks, [gate(undefined, { dependsOn: [dependency] })], existing), /依存先/);
  }
});

void test('multi-gate cycles are rejected even when all gates are planned', () => {
  const gates = [gate('A', { dependsOn: ['B'] }), gate('B', { dependsOn: ['C'] }), gate('C', { dependsOn: ['A'] })];
  assert.throws(() => validatePhaseGates(tasks, gates, existing), /循環/);
});

void test('a done gate requires nonempty existing evidence and done prerequisites', () => {
  assert.throws(() => validatePhaseGates(tasks, [gate(undefined, { status: 'done', evidence: [] })], existing), /根拠/);
  assert.throws(() => validatePhaseGates(tasks, [gate(undefined, { status: 'done' })]), /根拠ファイル/);
  const gates = [gate(), gate('V01-BOOT', { task: 'V01', status: 'done', dependsOn: ['B04-INTEGRATED'] })];
  assert.throws(() => validatePhaseGates(tasks, gates, existing), /依存ゲート/);
  gates[0].status = 'done';
  assert.equal(validatePhaseGates(tasks, gates, existing).length, 2);
});

void test('planned evidence may describe a future file, but completion requires that file', () => {
  const gates = [gate(undefined, { evidence: ['docs/evidence/future.json'] })];
  assert.equal(validatePhaseGates(tasks, gates, existing).length, 1);
  gates[0].status = 'done';
  assert.throws(() => validatePhaseGates(tasks, gates, existing), /根拠ファイル/);
});

void test('evidence observation inputs are deduplicated without hiding invalid declarations from validation', () => {
  assert.deepEqual(phaseGateEvidencePaths(undefined), []);
  assert.deepEqual(phaseGateEvidencePaths([gate(), gate('B'), null, { evidence: [null, evidence] }]), [evidence]);
});

void test('phase rendering includes task, dependency, status and evidence without changing whole-task counts', () => {
  const output = renderPhaseGates([gate(undefined, { status: 'done' }), gate('V01-BOOT', {
    task: 'V01', title: '起動|基礎\n検証', dependsOn: ['B04-INTEGRATED'],
  })]).join('\n');
  assert.match(output, /段階ゲート（作業全体の完了とは別判定）/);
  assert.match(output, /B04-INTEGRATED \| B04 \| 統合 \| 合格/);
  assert.match(output, /V01-BOOT \| V01 \| 起動\\\|基礎 検証 \| 未合格 \| B04-INTEGRATED/);
  assert.ok(output.includes(`[記録](${evidence})`));
  assert.ok(!output.includes('件完了'));
});
