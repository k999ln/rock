import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  deriveCandidateEvidenceState,
  generateMaterialCandidateGraph,
  validateMaterialInventionRequest,
} from '../lib/material-invention.ts';

const fixture = JSON.parse(
  readFileSync(
    new URL('../contracts/material-invention-fixture.json', import.meta.url),
    'utf8',
  ),
);

void test('material sandbox generates deterministic two-material ratio candidates', async () => {
  const first = await generateMaterialCandidateGraph(fixture);
  const second = await generateMaterialCandidateGraph(structuredClone(fixture));
  assert.equal(first.contract, 'rockstaros-material-invention-sandbox/1');
  assert.equal(first.executionMode, 'SANDBOX_ONLY');
  assert.equal(first.physicalExecutionAllowed, false);
  assert.equal(first.candidates.length, 3);
  assert.equal(first.nodes.length, 6);
  assert.equal(first.edges.length, 9);
  assert.deepEqual(
    first.candidates.map((candidate) => candidate.id),
    second.candidates.map((candidate) => candidate.id),
  );
  assert.match(first.requestDigest, /^[a-f0-9]{64}$/u);
  assert.deepEqual(
    first.candidates[0].components.map((component) => component.percent),
    [25, 75],
  );
  assert.ok(
    first.candidates.every(
      (candidate) =>
        candidate.safety.status === 'SANDBOX_ONLY' &&
        candidate.safety.physicalExecutionAllowed === false &&
        candidate.evidenceState === 'HYPOTHESIS',
    ),
  );
});

void test('candidate identity binds material lot, ratio and process version', async () => {
  const base = await generateMaterialCandidateGraph(fixture);
  const changedLot = structuredClone(fixture);
  changedLot.materials[0].lot = 'fixture-lot-a2';
  const changedRatio = structuredClone(fixture);
  changedRatio.ratioPercentSteps = [20, 50, 75];
  const changedProcess = structuredClone(fixture);
  changedProcess.process.version = 2;
  assert.notEqual(
    base.candidates[0].id,
    (await generateMaterialCandidateGraph(changedLot)).candidates[0].id,
  );
  assert.notEqual(
    base.candidates[0].id,
    (await generateMaterialCandidateGraph(changedRatio)).candidates[0].id,
  );
  assert.notEqual(
    base.candidates[0].id,
    (await generateMaterialCandidateGraph(changedProcess)).candidates[0].id,
  );
});

void test('missing SDS and unknown hazards fail closed', async () => {
  const unsafe = structuredClone(fixture);
  unsafe.materials[1].sdsRef = null;
  unsafe.materials[1].hazards = ['unknown'];
  const graph = await generateMaterialCandidateGraph(unsafe);
  assert.equal(graph.candidates[0].safety.status, 'BLOCKED');
  assert.deepEqual(
    graph.candidates[0].safety.blockers.map((finding) => finding.code),
    ['MISSING_SDS', 'UNKNOWN_HAZARD'],
  );
  assert.equal(graph.candidates[0].safety.physicalExecutionAllowed, false);
});

void test('prohibited material and hazard are blocked', async () => {
  const unsafe = structuredClone(fixture);
  unsafe.goal.prohibitedMaterialIds = ['material:binder-b'];
  unsafe.goal.prohibitedHazards = ['toxic'];
  unsafe.materials[1].hazards = ['toxic'];
  const candidate = (await generateMaterialCandidateGraph(unsafe))
    .candidates[0];
  assert.equal(candidate.safety.status, 'BLOCKED');
  assert.deepEqual(
    candidate.safety.blockers.map((finding) => finding.code),
    ['PROHIBITED_MATERIAL', 'PROHIBITED_HAZARD'],
  );
});

void test('unit mismatch and process outside the approved envelope are blocked', async () => {
  const unsafe = structuredClone(fixture);
  unsafe.materials[1].unit = 'volume_fraction';
  unsafe.process.steps[0].temperatureC = 81;
  unsafe.process.steps[0].pressureKpa = 111;
  unsafe.process.steps[0].equipment = 'unapproved-device';
  const codes = (
    await generateMaterialCandidateGraph(unsafe)
  ).candidates[0].safety.blockers.map((finding) => finding.code);
  assert.deepEqual(codes, [
    'UNIT_MISMATCH',
    'TEMPERATURE_LIMIT',
    'PRESSURE_LIMIT',
    'EQUIPMENT_NOT_ALLOWED',
  ]);
});

void test('known hazardous classes require qualified review and never physical execution', async () => {
  const review = structuredClone(fixture);
  review.materials[0].hazards = ['corrosive'];
  const candidate = (await generateMaterialCandidateGraph(review))
    .candidates[0];
  assert.equal(candidate.safety.status, 'REVIEW_REQUIRED');
  assert.equal(
    candidate.safety.reviewRequired[0].code,
    'QUALIFIED_REVIEW_REQUIRED',
  );
  assert.equal(candidate.safety.physicalExecutionAllowed, false);
});

void test('strict request validation rejects unknown fields, duplicate IDs and contradictory hazards', () => {
  assert.throws(
    () => validateMaterialInventionRequest({ ...fixture, execute: true }),
    /未対応/,
  );
  const duplicate = structuredClone(fixture);
  duplicate.materials[1].id = duplicate.materials[0].id;
  assert.throws(() => validateMaterialInventionRequest(duplicate), /重複/);
  const contradictory = structuredClone(fixture);
  contradictory.materials[0].hazards = ['none', 'flammable'];
  assert.throws(() => validateMaterialInventionRequest(contradictory), /併記/);
});

void test('process order must be contiguous and ratios must be bounded', () => {
  const processGap = structuredClone(fixture);
  processGap.process.steps[0].order = 2;
  assert.throws(() => validateMaterialInventionRequest(processGap), /連続/);
  const invalidRatio = structuredClone(fixture);
  invalidRatio.ratioPercentSteps = [0, 50];
  assert.throws(() => validateMaterialInventionRequest(invalidRatio), /範囲外/);
});

void test('simulation is never promoted to experimental proof', () => {
  assert.equal(deriveCandidateEvidenceState([]), 'HYPOTHESIS');
  assert.equal(
    deriveCandidateEvidenceState([
      { kind: 'literature', sourceId: 'paper:fixture' },
    ]),
    'SCREENED',
  );
  assert.equal(
    deriveCandidateEvidenceState([
      { kind: 'simulation', sourceId: 'simulation:fixture' },
    ]),
    'SIMULATED',
  );
  assert.equal(
    deriveCandidateEvidenceState([
      {
        kind: 'experiment_receipt',
        sourceId: 'receipt:fixture',
        rawDataSha256: 'a'.repeat(64),
        signatureVerified: false,
      },
    ]),
    'SCREENED',
  );
  assert.equal(
    deriveCandidateEvidenceState([
      {
        kind: 'experiment_receipt',
        sourceId: 'receipt:fixture',
        rawDataSha256: 'a'.repeat(64),
        signatureVerified: true,
      },
    ]),
    'EXPERIMENT_VERIFIED',
  );
});
