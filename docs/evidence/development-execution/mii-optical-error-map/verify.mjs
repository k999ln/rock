import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Offline finite necessary-condition calculation. No source edits or device/network calls.
const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const writeEvidence = args.includes('--write-evidence');
const repoAt = args.indexOf('--repo');
assert(repoAt >= 0 && args[repoAt + 1], 'Explicit --repo is required');
assert(args.length === (writeEvidence ? 3 : 2), 'Only --repo PATH [--write-evidence] is accepted');
const repo = resolve(args[repoAt + 1]);
const sha = x => createHash('sha256').update(x).digest('hex');
const read = p => readFileSync(join(here, p));
const decisionBytes = read('decision.json');
const d = JSON.parse(decisionBytes);
const fixed = d.artifacts.filter(a => a.revision === d.baselineRevision);
function requireHash(bytes, expected) { assert.equal(sha(bytes), expected, 'Pinned artifact changed; reassessment required'); }
const sources = [];
for (const a of fixed) {
  const bytes = execFileSync('git', ['show', `${a.revision}:${a.path}`], { cwd: repo, maxBuffer: 8 * 1024 * 1024 });
  requireHash(bytes, a.sha256);
  sources.push({ path: a.path, revision: a.revision, sha256: a.sha256 });
}
const geometryPath = 'systems/rock-star-os/targets/avocado-mini/spatial/optical-exits.mjs';
const studyPath = 'docs/avocado-mini-r5/factory-development/mini-02-optical-study.mjs';
for (const p of [geometryPath, studyPath]) {
  requireHash(readFileSync(join(repo, p)), fixed.find(a => a.path === p).sha256);
}
// Reuse exactly the existing geometry and full fixture. No copied/reimplemented optical solver.
const { createExitGeometry } = await import(pathToFileURL(join(repo, geometryPath)).href);
const { createStudyRequest, runOpticalStudy } = await import(pathToFileURL(join(repo, studyPath)).href);
const baseline = runOpticalStudy(JSON.stringify(createStudyRequest()));
assert.deepEqual(baseline.sampleCounts, { eyes: 243, targets: 147, eyeTargetPairs: 35721, pupilRaysPerPair: 18 });
const expected = {
  'four-sides-300mm': 35489, 'six-faces-300mm': 35443, 'six-faces-1200mm': 31564,
  'four-full-faces': 5953, 'six-full-faces-ideal': 0,
  'six-full-faces-10mm-guard': 708, 'six-full-faces-30mm-guard': 1396,
};
for (const [id, count] of Object.entries(expected)) {
  const r = baseline.results.find(r => r.id === id);
  assert.equal(r.missingPairs, count, `Original domain/candidate changed: ${id}`);
  assert.equal(r.pupilRays, 642978);
}
const tests = [];
const test = (id, fn) => { fn(); tests.push({ id, result: 'PASS' }); };
const close = (a, b) => assert(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
const epsM = 1e-9; // arithmetic boundary guard, not measured optical tolerance
const axis = { west: 0, east: 0, south: 1, north: 1, floor: 2, ceiling: 2 };
const plane = face => ['west', 'south', 'floor'].includes(face) ? d.model.boundsM.min[axis[face]] : d.model.boundsM.max[axis[face]];
function geom(c, guard = c.physicalFrameGuardM) {
  return createExitGeometry({ bounds: d.model.boundsM,
    exits: [{ id: 'candidate', face: c.face, rect: c.apertureRectM, guardM: guard }] });
}
function margin(point, c) {
  const t = [0, 1, 2].filter(i => i !== axis[c.face]);
  const r = c.apertureRectM, g = c.physicalFrameGuardM;
  return Math.min(point[t[0]] - r[0] - g, point[t[1]] - r[1] - g,
    r[2] - g - point[t[0]], r[3] - g - point[t[1]]);
}
function checkEnvelope(c) {
  const error = c.hypotheticalEyeErrorBoundM;
  if (error === null || error === undefined) return { verdict: 'UNKNOWN', reason: 'No measured/declared bound' };
  assert(typeof error === 'number' && Number.isFinite(error) && error >= 0, 'Error bound invalid');
  const n = axis[c.face];
  assert(c.errorAxis !== n && Number.isInteger(c.errorAxis) && c.errorAxis >= 0 && c.errorAxis <= 2,
    'One tangential axis only; normal/target/pose errors require a different enclosure');
  const deltaNormal = c.targetM[n] - c.eyeM[n];
  if (Math.abs(deltaNormal) < 1e-12) return { verdict: 'UNKNOWN', reason: 'Parallel/degenerate plane' };
  const s = (plane(c.face) - c.targetM[n]) / deltaNormal;
  const g = geom(c), nominal = g.ray(c.eyeM, c.targetM);
  const endpoints = [-error, error].map(dx => {
    const e = [...c.eyeM]; e[c.errorAxis] += dx;
    const ray = g.ray(e, c.targetM);
    // Independent plane formula: verification oracle, not a new rendering engine.
    const scalarPoint = c.targetM.map((v, i) => v + s * (v - e[i]));
    const sameFace = ray.boundaryFaces.length === 1 && ray.boundaryFaces[0] === c.face;
    if (sameFace) scalarPoint.forEach((v, i) => close(v, ray.boundaryPointM[i]));
    return { eyeErrorM: dx === 0 ? 0 : dx, eyeM: e, boundaryM: ray.boundaryPointM, faces: ray.boundaryFaces,
      geometricPathAvailable: ray.geometricPathAvailable, sameFace,
      marginM: sameFace ? margin(ray.boundaryPointM, c) : null };
  });
  if (!endpoints.every(e => e.sameFace) || nominal.boundaryFaces.length !== 1 || nominal.boundaryFaces[0] !== c.face) {
    return { verdict: 'UNKNOWN', reason: 'Intersected face changed: one-face affine envelope is not applicable', endpoints };
  }
  const worstMargin = Math.min(...endpoints.map(e => e.marginM));
  const t = [0, 1, 2].filter(i => i !== n), j = t.indexOf(c.errorAxis), p = nominal.boundaryPointM[c.errorAxis];
  const axisMargin = Math.min(p - c.apertureRectM[j] - c.physicalFrameGuardM,
    c.apertureRectM[j + 2] - c.physicalFrameGuardM - p);
  return {
    verdict: worstMargin < -epsM ? 'FAIL' : worstMargin <= epsM ? 'BOUNDARY_UNKNOWN' : 'MODEL_INTERVAL_INSIDE',
    scope: 'fixed target/normal/face; one-axis interval only, not physical acceptance',
    nominalBoundaryM: nominal.boundaryPointM, geometricGain: Math.abs(s),
    worstExitDisplacementM: Math.abs(s) * error, nominalAxisClearanceM: axisMargin,
    strictlyInsideEyeErrorLimitM: axisMargin / Math.abs(s), worstMarginM: worstMargin,
    endpoints, physicalAccepted: false,
  };
}
const c = d.counterexample;
const witness = checkEnvelope(c);
const naive = geom(c, c.naiveTotalGuardM).ray(c.eyeM, c.targetM);
const sensitivity = [null, 0, 0.002, 0.003, 0.02].map(error => ({ errorM: error,
  ...checkEnvelope({ ...c, hypotheticalEyeErrorBoundM: error }) }));
const diagnostics = d.diagnosticCases.map(x => {
  const cc = { ...c, eyeM: x.eyeM, targetM: x.targetM, face: x.face,
    apertureRectM: [-2, -2, 2, 2], physicalFrameGuardM: 0,
    hypotheticalEyeErrorBoundM: x.errorM };
  const r = checkEnvelope(cc);
  close(r.geometricGain, x.expectedGain); close(r.worstExitDisplacementM, x.expectedExitShiftM);
  return { id: x.id, gain: r.geometricGain, displacementM: r.worstExitDisplacementM, physicalAccepted: false };
});
test('original-full-domain-and-both-pupil-regression', () => {
  assert.equal(baseline.physicalCandidateSelected, false);
  assert.equal(baseline.results.find(r => r.id === 'six-full-faces-ideal').nominalApertureAreaM2, 80);
  assert.equal(baseline.results.find(r => r.id === 'six-full-faces-30mm-guard').missingPairs, 1396);
});
test('naive-30mm-guard-passes-but-20mm-eye-envelope-fails', () => {
  assert.equal(naive.geometricPathAvailable, true);
  assert.equal(witness.verdict, 'FAIL');
  close(witness.nominalBoundaryM[0], 0.56); close(witness.geometricGain, 10);
  close(witness.worstExitDisplacementM, 0.2); close(witness.worstMarginM, -0.17);
  close(witness.strictlyInsideEyeErrorLimitM, 0.003);
  assert.equal(witness.endpoints[0].geometricPathAvailable, false);
  assert.equal(witness.endpoints[1].geometricPathAvailable, true);
});
test('tighter-bound-restores-only-limited-model-pass-and-equality-stays-unknown', () => {
  assert.deepEqual(sensitivity.map(x => x.verdict), ['UNKNOWN', 'MODEL_INTERVAL_INSIDE', 'MODEL_INTERVAL_INSIDE', 'BOUNDARY_UNKNOWN', 'FAIL']);
});
test('zero-error-result-survives-JSON-evidence-roundtrip', () => {
  const zero = checkEnvelope({ ...c, hypotheticalEyeErrorBoundM: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(zero)), zero);
});
test('aperture-change-changes-verdict-not-a-fixed-rejection', () => {
  const enlarged = checkEnvelope({ ...c, apertureRectM: [-0.8, -0.8, 0.8, 0.8] });
  assert.equal(enlarged.verdict, 'MODEL_INTERVAL_INSIDE');
  close(enlarged.worstMarginM, 0.03);
  assert.equal(enlarged.physicalAccepted, false); // hypothetical width 1.6m is not an adopted display
});
test('physical-frame-change-turns-2mm-bound-from-inside-to-boundary', () => {
  assert.equal(checkEnvelope({ ...c, hypotheticalEyeErrorBoundM: 0.002, physicalFrameGuardM: 0.02 }).verdict, 'BOUNDARY_UNKNOWN');
});
test('eye-target-separation-changes-magnification', () => {
  const farther = checkEnvelope({ ...c, eyeM: [-0.056, 0, 1.2] });
  close(farther.geometricGain, 1.25); assert.equal(farther.verdict, 'MODEL_INTERVAL_INSIDE');
});
test('all-201-error-samples-match-independent-affine-oracle', () => {
  const g = geom(c);
  for (let i = 0; i <= 200; i++) {
    const dx = -0.02 + i * 0.0002, e = [...c.eyeM]; e[0] += dx;
    const r = g.ray(e, c.targetM);
    assert.deepEqual(r.boundaryFaces, ['ceiling']); close(r.boundaryPointM[0], 0.56 - 10 * dx);
    assert.equal(r.geometricPathAvailable, margin(r.boundaryPointM, c) >= 0);
  }
});
test('face-change-refuses-to-claim-affine-interval-coverage', () => {
  assert.equal(checkEnvelope({ ...c, hypotheticalEyeErrorBoundM: 0.3 }).verdict, 'UNKNOWN');
});
test('normal-axis-error-is-not-silently-treated-as-tangential', () => {
  assert.throws(() => checkEnvelope({ ...c, errorAxis: 2 }), /One tangential axis/);
  assert.throws(() => checkEnvelope({ ...c, hypotheticalEyeErrorBoundM: -0.01 }), /Error bound invalid/);
});
test('source-byte-change-invalidates-evidence-before-calculation', () => {
  const bytes = readFileSync(join(repo, geometryPath));
  assert.throws(() => requireHash(Buffer.concat([bytes, Buffer.from('\n')]), fixed.find(a => a.path === geometryPath).sha256), /Pinned artifact changed/);
});
const candidateDecisions = baseline.results.map(r => ({
  id: r.id, baselineMissingPairs: r.missingPairs,
  evaluatedPairs: r.evaluatedPairs, requiredPairs: r.requiredEyeTargetPairs,
  nominalAreaM2: r.nominalApertureAreaM2,
  verdict: r.missingPairs > 0 ? 'REJECT_AS_ALL_RANGE_SOLUTION' : r.id === 'six-full-faces-ideal' ? 'NOT_ADOPTED_IDEAL_CONTROL' : 'UNPROVEN_PHYSICAL_CANDIDATE',
  rationale: r.missingPairs > 0 ? d.candidatePolicy.fixedWithMissingPairs : r.id === 'six-full-faces-ideal'
    ? d.candidatePolicy.sixFullFacesIdeal : r.id === 'relocatable-or-switched-exits'
      ? d.candidatePolicy.relocatableOrSwitched : d.candidatePolicy.existingGoRelay,
  physicalAccepted: false,
}));
const result = {
  decisionId: d.decisionId, conclusion: d.selectedDecision.status, sources,
  fullBaseline: { resultSha256: baseline.resultSha256, sampleCounts: baseline.sampleCounts,
    interpretation: 'unchanged original denominator, physical acceptance false' },
  candidateDecisions, counterexample: { naiveNominalPathAvailable: naive.geometricPathAvailable, ...witness },
  boundSensitivity: sensitivity, upwardDownwardDiagnostics: diagnostics, tests,
  acceptance: d.acceptance,
};
const resultSha256 = sha(JSON.stringify(result));
const evidence = {
  schema: 'mii.optical-aperture-error-evidence/1', date: d.date, decisionId: d.decisionId,
  decisionSha256: sha(decisionBytes), verifierSha256: sha(read('verify.mjs')),
  resultSha256, result,
  existingUnmergedArtifacts: d.artifacts.filter(a => a.revision !== d.baselineRevision),
  remainingPhysicalGates: ['Measured tracker/reference/target/aperture/timing error envelope UNKNOWN',
    'Continuous whole volume, both eyes and simultaneous full scene unaccepted',
    'Optical engine/finite cone/ray capacity/low glare/independent stop unaccepted',
    'Few display parts, standalone packaging/power/heat and manufacturing unaccepted'],
  handoff: { nextOwner: 'M4 with M3 input; M7 independent review; M1 MAT15 integration',
    inputs: ['decision.json bench MII-OPT-ERROR-BENCH-01', 'pinned existing geometry/source hashes',
      'measured pupil/reference/target/aperture/clock errors and their raw trace hashes'],
    requestedDecision: 'Replace uniform 1:1 aperture erosion assumptions with a revision-bound per-ray error envelope; no final aperture/PCB release on this host proof.',
    review: 'Run verify.mjs; inspect affine-domain restrictions and bench threshold; independent reviewer has not run yet.',
    centralGitOnly: true, mainIntegrated: false, ciAccepted: false, publicRelease: false },
  verificationHistory: [{ attempt: 1, stage: 'evidence replay', result: 'FAIL', reason: 'JSON stores -0 as 0; deepStrictEqual detected signed-zero mismatch in the zero-error endpoint.', previousVerifierSha256: 'b355d37da89b66ad5dcab087efa38b829837a5d06d2ed0a06a125b24f839ca23', previousEvidenceSha256: '08aaaa278b73e3514ec8c1e32b9d60227330acfc286e2038062e41738b99db3f', correction: 'Normalize the zero-error endpoint to positive zero and add JSON roundtrip regression. Optical calculations and candidate conclusions unchanged.' }],
  reproduce: d.reproduce,
  execution: { kind: 'offline host calculation', nodeVersion: process.version, newDeviceOperations: 0, newModelRuns: 0 },
};
if (writeEvidence) {
  writeFileSync(join(here, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
} else {
  const stored = JSON.parse(read('evidence.json'));
  assert.equal(stored.decisionSha256, evidence.decisionSha256);
  assert.equal(stored.verifierSha256, evidence.verifierSha256);
  assert.equal(stored.resultSha256, resultSha256);
  assert.deepEqual(stored.result, result);
  assert.deepEqual(stored.remainingPhysicalGates, evidence.remainingPhysicalGates);
  assert.deepEqual(stored.handoff, evidence.handoff);
}
console.log(JSON.stringify({ decisionId: d.decisionId, resultSha256, testsPassed: tests.length,
  baselinePairs: baseline.sampleCounts.eyeTargetPairs, candidateCount: candidateDecisions.length,
  naiveNominalPass: naive.geometricPathAvailable, robustCounterexample: witness.verdict,
  exitShiftM: witness.worstExitDisplacementM, eyeErrorLimitM: witness.strictlyInsideEyeErrorLimitM,
  physicalAccepted: false, evidence: writeEvidence ? 'CREATED' : 'VERIFIED' }, null, 2));
