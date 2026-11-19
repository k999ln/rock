import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createStudyRequest, runOpticalStudy, PINNED_GEOMETRY_SHA256 } from '../docs/avocado-mini-r5/factory-development/mini-02-optical-study.mjs';

const request = createStudyRequest();
const encoded = JSON.stringify(request);
const result = runOpticalStudy(encoded);
const row = id => result.results.find(r => r.id === id);
function rejectChange(change, error) {
  const altered = createStudyRequest(); change(altered);
  assert.throws(() => runOpticalStudy(JSON.stringify(altered)), error);
}

void test('pinned existing geometry and all baseline counters reproduce with one fixed denominator', () => {
  const actual = createHash('sha256').update(readFileSync(new URL('../systems/rock-star-os/targets/avocado-mini/spatial/optical-exits.mjs', import.meta.url))).digest('hex');
  assert.equal(actual, PINNED_GEOMETRY_SHA256);
  assert.deepEqual(result.sampleCounts, { eyes: 243, targets: 147, eyeTargetPairs: 35721, pupilRaysPerPair: 18 });
  for (const [id, missing] of Object.entries({ 'four-sides-300mm': 35489, 'six-faces-300mm': 35443,
    'six-faces-1200mm': 31564, 'four-full-faces': 5953, 'six-full-faces-ideal': 0, 'six-full-faces-10mm-guard': 708 })) {
    const r = row(id); assert.equal(r.missingPairs, missing, id);
    assert.equal(r.evaluatedPairs, 35721); assert.equal(r.pupilRays, 642978);
    assert.equal(r.fixtureSha256, result.fixtureSha256);
    assert.equal(r.firstMissing === null, missing === 0);
  }
});
void test('nominal80m2 is not80m2 of usable aperture after guards, and exits are not enclosures', () => {
  const ideal = row('six-full-faces-ideal'), frame = row('six-full-faces-10mm-guard');
  assert.equal(ideal.nominalApertureAreaM2, 80); assert.equal(ideal.effectiveApertureAreaM2, 80);
  assert.equal(frame.nominalApertureAreaM2, 80);
  assert.ok(Math.abs(frame.effectiveApertureAreaM2 - 79.1224) < 1e-10);
  assert.equal(frame.counts.opticalExits, 6); assert.equal(frame.counts.physicalEnclosures, null);
  assert.equal(frame.counts.activeImageSources, null); assert.equal(frame.counts.modeledPoseCount, 1);
  assert.equal(frame.counts.measuredSimultaneousViewers, null); assert.equal(frame.counts.imageLocationPassiveSurfaces, 0);
  assert.ok(row('six-full-faces-30mm-guard').missingPairs >= frame.missingPairs);
});
void test('missing ray counterexamples identify actual shared-domain eye/target/pupil and boundary', () => {
  for (const r of result.results.filter(r => r.missingPairs > 0)) {
    const f = r.firstMissing;
    for (const name of ['eyeCenterM', 'targetM', 'pupilM', 'boundaryPointM']) {
      assert.equal(f[name].length, 3); assert.ok(f[name].every(Number.isFinite));
    }
    assert.ok(f.boundaryFaces.length >= 1);
    assert.ok(Math.abs(f.targetM[0]) <= 1.5 && Math.abs(f.targetM[1]) <= 1.5);
  }
});
void test('unsupported motion and Go relay remain unknown rather than zero misses or a selected part', () => {
  for (const id of ['relocatable-or-switched-exits', 'existing-go-leairr-relay']) {
    const r = row(id); assert.equal(r.status, 'unsupported'); assert.equal(r.missingPairs, null);
    assert.equal(r.evaluatedPairs, 0); assert.equal(r.requiredEyeTargetPairs, 35721);
    assert.equal(r.effectiveApertureAreaM2, null); assert.ok(r.reasons.length >= 3);
  }
  assert.equal(result.physicalCandidateSelected, false);
  for (const item of [result, ...result.results]) assert.ok(Object.values(item.acceptance).every(v => v === false));
  assert.equal(result.wholeUnitAccepted, false);
});
void test('supplementary vertical and seam probes expose gaps without replacing binocular baseline', () => {
  const four = result.diagnostics.find(d => d.candidateId === 'four-full-faces');
  const ideal = result.diagnostics.find(d => d.candidateId === 'six-full-faces-ideal');
  const guard = result.diagnostics.find(d => d.candidateId === 'six-full-faces-10mm-guard');
  assert.deepEqual(four.vertical, { belowAvailable: false, aboveAvailable: false });
  assert.deepEqual(ideal.vertical, { belowAvailable: true, aboveAvailable: true });
  assert.equal(ideal.seamSweep.missedSamples, 0);
  assert.ok(guard.seamSweep.missedSamples > 0 && guard.seamSweep.missedSamples < 201);
  assert.ok(guard.seamSweep.firstMissingOffsetM <= 0 && guard.seamSweep.lastMissingOffsetM >= 0);
  for (const d of result.diagnostics) { assert.equal(d.supplementaryOnly, true); assert.equal(d.continuousProof, false); }
});
void test('fixture changes cannot shrink domain, remove upper targets/pupil samples, invent illumination or people', () => {
  for (const change of [
    r => { r.fixture.servicePlanM[0] = 1; },
    r => { r.fixture.eyeXY.countPerAxis = 3; },
    r => { r.fixture.targetHeightsM.pop(); },
    r => { r.fixture.pupilOffsetsM = [0]; },
    r => { r.fixture.interpupillaryDistanceM = 0; },
    r => { r.fixture.requiredSimultaneousViewers = 1; },
    r => { r.fixture.illuminationLux = 0; },
    r => { r.fixture.requirements.pop(); },
    r => { r.fixture.imageLocationPassiveSurfaces = 1; },
  ]) rejectChange(change, /DOMAIN_OR_ASSUMPTIONS_CHANGED/);
});
void test('candidate omission, duplicated IDs, mislabelled apertures and unknown authority are rejected', () => {
  rejectChange(r => { r.candidates.pop(); }, /CANDIDATES_MISSING/);
  rejectChange(r => { r.candidates[1] = structuredClone(r.candidates[0]); }, /UNKNOWN_OR_DUPLICATE/);
  rejectChange(r => { r.candidates[0].id = 'new-magic-engine'; }, /UNKNOWN_OR_DUPLICATE/);
  rejectChange(r => { r.candidates[0].id = 'six-faces-300mm'; }, /CANDIDATE_CHANGED/);
  rejectChange(r => { r.candidates[5].guardM = 0; }, /CANDIDATE_CHANGED/);
  rejectChange(r => { r.candidates[0].physicalEnclosures = 1; }, /CANDIDATE_CHANGED/);
  rejectChange(r => { r.candidates[0].physicalVisible = true; }, /CANDIDATE_CHANGED/);
  rejectChange(r => { r.grant = 'approved'; }, /FIELDS_INVALID/);
  rejectChange(r => { r.geometrySha256 = '0'.repeat(64); }, /GEOMETRY_REVISION_MISMATCH/);
});
void test('JSON boundary rejects getters, huge/deep/nonfinite payloads and malformed versions before evaluation', () => {
  let called = false;
  assert.throws(() => runOpticalStudy({ get fixture() { called = true; return {}; } }), /BOUNDED_JSON_REQUIRED/);
  assert.equal(called, false);
  assert.throws(() => runOpticalStudy(' '.repeat(32769)), /BOUNDED_JSON_REQUIRED/);
  assert.throws(() => runOpticalStudy('{'), /JSON_INVALID/);
  assert.throws(() => runOpticalStudy(encoded.replace('"requiredSimultaneousViewers":null', '"requiredSimultaneousViewers":1e999')), /FINITE_JSON_REQUIRED/);
  assert.throws(() => runOpticalStudy('['.repeat(22) + '0' + ']'.repeat(22)), /JSON_TOO_COMPLEX/);
  rejectChange(r => { r.schema = 'rockstaros.mini-optical-study-request/2'; }, /SCHEMA_UNSUPPORTED/);
});
void test('roundtrip/order are deterministic and result edits cannot alter the canonical fixture', () => {
  const reordered = Object.fromEntries(Object.entries(createStudyRequest()).reverse()); reordered.candidates.reverse();
  const second = runOpticalStudy(JSON.stringify(reordered, null, 1));
  assert.equal(second.inputSha256, result.inputSha256); assert.equal(second.resultSha256, result.resultSha256);
  second.fixture.eyeHeightsM.pop(); second.exclusions.length = 0;
  assert.deepEqual(createStudyRequest(), request);
  assert.equal(JSON.stringify(request), encoded);
  assert.match(result.resultSha256, /^[a-f0-9]{64}$/);
});
