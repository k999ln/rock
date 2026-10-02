import test from 'node:test';
import assert from 'node:assert/strict';
import {
  launchStages,
  launchGateStages,
  validateSkyLaunchReport,
} from '../scripts/sky-launch-validation.mjs';

const candidate = {
  sourceCommit: 'a'.repeat(40),
  buildSha256: 'b'.repeat(64),
  deploymentId: 'synthetic-unit-deployment',
  siteVersion: 1,
};
function fixture() {
  const proofs = new Map();
  const report = {
    schema: 'sky-service-launch/1',
    completeLaunchScope: 'web-os-app-paid-marketplace',
    stageDependencies: structuredClone(launchStages),
    candidate: structuredClone(candidate),
    completeLaunchClaim: true,
    gates: Object.entries(launchGateStages).map(([id, stage]) => {
      const path = `evidence/${id}.json`;
      proofs.set(path, {
        schema: 'sky-launch-acceptance/1',
        gateId: id,
        result: 'passed',
        execution: 'actual',
        environment: 'synthetic-unit-environment',
        observedAt: '2026-10-02T12:00:00Z',
        candidate: structuredClone(candidate),
      });
      return {
        id,
        stage,
        status: 'passed',
        owner: 'ROCK',
        acceptance: 'synthetic-unit-only',
        environment: 'synthetic-unit-environment',
        evidence: [path],
        acceptanceEvidence: path,
      };
    }),
  };
  const options = {
    evidenceExists: (path) => proofs.has(path),
    readEvidence: (path) => proofs.get(path),
  };
  return {
    report,
    proofs,
    options,
    run: () => validateSkyLaunchReport(report, options),
  };
}
void test('a complete synthetic unit record must bind all twelve gates to one candidate', () => {
  const { run } = fixture();
  assert.equal(run().missing('complete').length, 0);
});
void test('Web paid acceptance cannot promote incomplete OS/app client acceptance', () => {
  const { report, run } = fixture();
  report.gates.find((g) => g.id === 'cross-client-identity').status =
    'not_verified';
  assert.throws(run, /integrated acceptance/);
  report.completeLaunchClaim = false;
  assert.equal(run().missing('paid').length, 0);
  assert.deepEqual(
    run()
      .missing('complete')
      .map((g) => g.id),
    ['cross-client-identity'],
  );
});
void test('a source file existing does not prove actual acceptance', () => {
  const { report, run } = fixture();
  delete report.gates[0].acceptanceEvidence;
  assert.throws(run, /actual acceptance record/);
});
void test('historical proof from a different source, build, deployment or version is rejected', () => {
  for (const [key, value] of Object.entries({
    sourceCommit: 'c'.repeat(40),
    buildSha256: 'd'.repeat(64),
    deploymentId: 'different-deployment',
    siteVersion: 2,
  })) {
    const { report, proofs, run } = fixture();
    proofs.get(report.gates[0].acceptanceEvidence).candidate[key] = value;
    assert.throws(run, /candidate mismatch/);
  }
});
void test('missing or malformed candidate bindings are rejected', () => {
  for (const bad of [
    null,
    {},
    { ...candidate, sourceCommit: 'short' },
    { ...candidate, buildSha256: 'invalid' },
  ]) {
    const { report, run } = fixture();
    report.candidate = bad;
    assert.throws(run, /immutable candidate binding/);
  }
});
void test('a mock, fixture, incomplete, wrong-gate or wrong-environment proof never passes', () => {
  for (const fields of [
    { execution: 'mock' },
    { execution: 'fixture' },
    { result: 'pending' },
    { gateId: 'other' },
    { environment: 'other' },
    { observedAt: 'invalid' },
  ]) {
    const { report, proofs, run } = fixture();
    Object.assign(proofs.get(report.gates[0].acceptanceEvidence), fields);
    assert.throws(run, /actual accepted observation/);
  }
});
void test('acceptance gates and final dependencies cannot be removed to manufacture a pass', () => {
  const a = fixture();
  a.report.gates.pop();
  assert.throws(a.run, /preserve all acceptance gates/);
  const b = fixture();
  b.report.stageDependencies.complete = ['paid'];
  assert.throws(b.run, /preserve complete/);
  const c = fixture();
  c.report.gates[1].id = c.report.gates[0].id;
  assert.throws(c.run, /Invalid launch gate/);
});
void test('stages reject inherited names and missing evidence fails closed', () => {
  const a = fixture();
  assert.throws(() => a.run().missing('__proto__'), /Unknown launch stage/);
  const b = fixture();
  b.proofs.delete(b.report.gates[0].acceptanceEvidence);
  assert.throws(b.run, /Missing launch evidence/);
});
void test('an unfinished report needs no fabricated candidate or accepted observations', () => {
  const { report, run } = fixture();
  report.candidate = null;
  report.completeLaunchClaim = false;
  for (const gate of report.gates) {
    gate.status = 'not_verified';
    gate.evidence = [];
    delete gate.acceptanceEvidence;
  }
  assert.equal(run().missing('complete').length, 12);
});
