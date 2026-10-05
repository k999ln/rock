import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { launchStages, launchGateStages, validateSkyLaunchReport } from '../scripts/sky-launch-validation.mjs';

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
    completeLaunchScope: 'standalone-web-paid-marketplace',
    focusedLaunchScope: 'csv-article-citations-and-one-cloud-ai',
    stageDependencies: structuredClone(launchStages),
    candidate: structuredClone(candidate),
    completeLaunchClaim: true,
    focusedLaunchClaim: true,
    integratedLaunchClaim: true,
    gates: Object.entries(launchGateStages).map(([id, stage]) => {
      const path = `evidence/${id}.json`;
      proofs.set(path, {
        schema: 'sky-launch-acceptance/1',
        gateId: id,
        result: 'passed',
        execution: 'actual',
        environment: 'production',
        observedAt: '2026-10-02T12:00:00Z',
        candidate: structuredClone(candidate),
      });
      return {
        id, stage, status: 'passed', owner: 'ROCK',
        acceptance: 'synthetic-unit-only; no real customer observation',
        environment: 'production', evidence: [path], acceptanceEvidence: path,
      };
    }),
  };
  const options = { evidenceExists: (path) => proofs.has(path), readEvidence: (path) => proofs.get(path) };
  return { report, proofs, options, run: () => validateSkyLaunchReport(report, options) };
}

void test('all seventeen unit fixture gates require one candidate including focused and client acceptance', () => {
  const { run } = fixture();
  assert.equal(run().missing('complete').length, 0);
  assert.equal(Object.keys(launchGateStages).length, 17);
});

void test('historical canonical records remain unchanged and cannot certify the current candidate', () => {
  const report = JSON.parse(readFileSync(new URL('../data/sky-service-launch.json', import.meta.url), 'utf8'));
  const original = structuredClone(report);
  const result = validateSkyLaunchReport(report, {
    evidenceExists: (path) => existsSync(new URL(`../${path}`, import.meta.url)),
    readEvidence: () => { throw new Error('Canonical history has no candidate-bound record.'); },
  });
  assert.deepEqual(report, original);
  assert.equal(result.missing('complete').length, 17);
  assert.ok(result.historicalOnly.some((gate) => gate.id === 'focused-csv-payment'));
  assert.ok(!result.historical.missing.focused.some((gate) => gate.id === 'focused-csv-payment'));
  assert.ok(result.missing('focused').some((gate) => gate.id === 'focused-csv-payment'));
});

void test('paid Web acceptance cannot promote incomplete OS/app or focused production acceptance', () => {
  for (const id of ['cross-client-identity', 'focused-cloud-ai', 'focused-apple-pay']) {
    const { report, run } = fixture();
    report.gates.find((gate) => gate.id === id).status = 'not_verified';
    if (id.startsWith('focused-')) report.focusedLaunchClaim = false;
    assert.throws(run, /Integrated-launch claim/);
    report.integratedLaunchClaim = false;
    assert.equal(run().missing('paid').length, 0);
    assert.deepEqual(run().missing('complete').map((gate) => gate.id), [id]);
  }
});

void test('a historical source-file reference never substitutes for actual candidate acceptance', () => {
  const { report, run } = fixture();
  delete report.gates[0].acceptanceEvidence;
  assert.throws(run, /Integrated-launch claim/);
  report.integratedLaunchClaim = false;
  assert.deepEqual(run().missing('complete').map((gate) => gate.id), ['public-entry']);
});

void test('proof from a different source, build, deployment or version is rejected', () => {
  for (const [key, value] of Object.entries({ sourceCommit: 'c'.repeat(40), buildSha256: 'd'.repeat(64), deploymentId: 'other', siteVersion: 2 })) {
    const { report, proofs, run } = fixture();
    proofs.get(report.gates[0].acceptanceEvidence).candidate[key] = value;
    assert.throws(run, /candidate mismatch/);
  }
});

void test('missing or malformed candidate bindings cannot back an acceptance record', () => {
  for (const bad of [null, {}, { ...candidate, sourceCommit: 'short' }, { ...candidate, buildSha256: 'invalid' }, { ...candidate, deploymentId: ' ' }]) {
    const { report, run } = fixture();
    report.candidate = bad;
    assert.throws(run, /immutable candidate binding/);
  }
});

void test('mock, fixture, incomplete, wrong-gate and wrong-environment observations are rejected', () => {
  for (const fields of [{ execution: 'mock' }, { execution: 'fixture' }, { result: 'pending' }, { gateId: 'other' }, { environment: 'other' }, { observedAt: 'invalid' }]) {
    const { report, proofs, run } = fixture();
    Object.assign(proofs.get(report.gates[0].acceptanceEvidence), fields);
    assert.throws(run, /actual accepted observation/);
  }
});

void test('all gates and dependencies remain mandatory and focused acceptance stays production-only', () => {
  const a = fixture();
  a.report.gates = a.report.gates.filter((gate) => gate.id !== 'cross-client-identity');
  assert.throws(a.run, /all seventeen/);
  const b = fixture();
  b.report.stageDependencies.complete = ['paid'];
  assert.throws(b.run, /preserve complete/);
  const c = fixture();
  c.report.gates[1].id = c.report.gates[0].id;
  assert.throws(c.run, /Invalid launch gate/);
  const d = fixture();
  d.report.gates.find((gate) => gate.id === 'focused-cloud-ai').environment = 'local-synthetic';
  assert.throws(d.run, /production evidence/);
});

void test('unknown stages and missing evidence fail closed', () => {
  const a = fixture();
  assert.throws(() => a.run().missing('__proto__'), /Unknown launch stage/);
  const b = fixture();
  b.proofs.delete(b.report.gates[0].acceptanceEvidence);
  assert.throws(b.run, /Missing launch evidence/);
  const c = fixture();
  delete c.report.stageDependencies.complete;
  c.report.stageDependencies.other = [];
  assert.throws(c.run, /preserve focused/);
});

void test('unfinished acceptance needs no fabricated candidate or accepted observations', () => {
  const { report, run } = fixture();
  report.candidate = null;
  report.completeLaunchClaim = false;
  report.focusedLaunchClaim = false;
  report.integratedLaunchClaim = false;
  for (const gate of report.gates) {
    gate.status = 'not_verified';
    gate.evidence = [];
    delete gate.acceptanceEvidence;
  }
  assert.equal(run().missing('complete').length, 17);
});
