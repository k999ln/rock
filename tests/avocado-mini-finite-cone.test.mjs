import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createFiniteConeFixture, inspectFiniteCone } from '../docs/avocado-mini-r5/factory-development/mini-02-finite-cone.mjs';
import { runJointAllocation } from '../docs/avocado-mini-r5/factory-development/mini-02-joint-allocation.mjs';

const inspect = r => inspectFiniteCone(JSON.stringify(r));
const joint = r => runJointAllocation(JSON.stringify(r.jointRequest));
const canonical = v => Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : v !== null && typeof v === 'object'
    ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
    : JSON.stringify(v);
function bindModels(r) {
  for (const m of r.calibrationModels) {
    const p = r.jointRequest.devices.find(d => d.id === m.deviceId).poses.find(pose => pose.id === m.poseId);
    m.poseBindingSha256 = createHash('sha256').update(canonical({ deviceId: m.deviceId, poseId: p.id,
      sceneSha256: p.sceneSha256, calibrationId: p.calibrationId,
      exits: structuredClone(p.exits).sort((a, b) => a.id.localeCompare(b.id)) })).digest('hex');
  }
}
function rebind(r, replaceWitness = false) {
  const v = joint(r);
  r.witness.inputSha256 = v.inputSha256;
  if (replaceWitness) { r.witness.assignment = v.assignment; r.witness.selectedPoses = v.selectedPoses; }
  return r;
}
const floor = r => r.calibrationModels.find(m => m.poseId === 'floor-pose');
const rotateFloor = (r, degrees) => {
  floor(r).axisWorld = [Math.sin(degrees * Math.PI / 180), 0, Math.cos(degrees * Math.PI / 180)];
};

void test('finite cone checks both world-fixed upper/lower demands and retains every physical gate as false', () => {
  const r = createFiniteConeFixture(), before = JSON.stringify(r), v = inspect(r);
  assert.equal(v.status, 'finite_cone_witness_passed');
  assert.equal(v.allDeclaredDemandsInspected, true);
  assert.equal(v.declaredDemandCount, 2);
  assert.equal(v.evaluatedDemandCount, 2);
  assert.deepEqual(v.rays.map(x => x.demandId), ['down', 'up']);
  assert.deepEqual(v.rays.map(x => x.directionWorld), [[0, 0, 1], [0, 0, -1]]);
  assert.equal(v.counts.modeledDevices, 2);
  assert.equal(v.counts.imageLocationPassiveSurfaces, 0);
  assert.equal(v.counts.installedEnclosures, null);
  assert.ok(Object.values(v.acceptance).every(x => x === false));
  for (const k of ['allAllocationsEvaluated', 'fullBaselineEvaluated', 'continuousDomainEvaluated']) assert.equal(v[k], false);
  assert.equal(JSON.stringify(r), before);
  assert.equal(inspect(r).resultSha256, v.resultSha256);
});

void test('the emitted direction is aperture to eye, and reversing it requires reallocation', () => {
  const r = createFiniteConeFixture(); floor(r).axisWorld = [0, 0, -1];
  const v = inspect(r);
  assert.equal(v.status, 'reallocation_required');
  assert.equal(v.rays[0].angleDeg, 180);
  assert.equal(v.rays[0].status, 'outside');
  assert.equal(v.rays[1].status, 'inside');
  assert.equal(v.allAllocationsEvaluated, false);
});

void test('three-dimensional cones inspect all six directions, including vertical, without a horizontal-only shortcut', () => {
  const r = createFiniteConeFixture(), prototypePose = structuredClone(r.jointRequest.devices[0].poses[0]);
  const prototypeModel = structuredClone(floor(r));
  const faces = [['west', [-1, 0, 1.6], [1, 0, 0]], ['east', [1, 0, 1.6], [-1, 0, 0]],
    ['south', [0, -1, 1.6], [0, 1, 0]], ['north', [0, 1, 1.6], [0, -1, 0]],
    ['floor', [0, 0, 0.8], [0, 0, 1]], ['ceiling', [0, 0, 2], [0, 0, -1]]];
  r.jointRequest.frame.demands = faces.map(([face, target]) => ({ id: face, viewerId: 'viewer',
    targetId: face, eyeM: [0, 0, 1.6], targetM: target }));
  r.jointRequest.devices = faces.map(([face]) => ({ id: face, poses: [{ ...structuredClone(prototypePose), id: face,
    exits: [{ ...structuredClone(prototypePose.exits[0]), face,
      rect: ['floor', 'ceiling'].includes(face) ? [-2, -2, 2, 2] : [-2, 0, 2, 3] }] }] }));
  r.jointRequest.sources[0].sampleRayCapacity = 6;
  r.calibrationModels = faces.map(([face, , axis]) => ({ ...structuredClone(prototypeModel), deviceId: face,
    poseId: face, axisWorld: axis, halfAngleDeg: 20 }));
  bindModels(r); rebind(r, true);
  const v = inspect(r);
  assert.equal(v.status, 'finite_cone_witness_passed');
  assert.equal(v.evaluatedDemandCount, 6);
  assert.ok(v.rays.every(ray => ray.angleDeg === 0));
  assert.equal(v.continuousDomainEvaluated, false);
});

void test('angular intervals classify strict interior/exterior and retain boundary uncertainty', () => {
  for (const [angle, error, expected] of [[20, 2, 'finite_cone_witness_passed'], [45, 0, 'unknown'],
    [44, 2, 'unknown'], [46, 2, 'unknown'], [48, 2, 'reallocation_required'], [43, 2, 'unknown']]) {
    const r = createFiniteConeFixture(); rotateFloor(r, angle); floor(r).angularErrorDeg = error;
    assert.equal(inspect(r).status, expected, `${angle} +/- ${error}`);
  }
  const r = createFiniteConeFixture(); floor(r).halfAngleDeg = 0; floor(r).angularErrorDeg = 0;
  assert.equal(inspect(r).status, 'unknown', 'a zero-width cone cannot prove strict margin');
});

void test('both pupils and upper/lower targets remain in the denominator; omitting any demand is refused', () => {
  const r = createFiniteConeFixture();
  r.jointRequest.frame.demands = r.jointRequest.frame.demands.flatMap(d => [-0.032, 0.032].map((x, i) =>
    ({ ...d, id: `${d.id}-${i}`, eyeM: [x, 0, 1.6] })));
  r.jointRequest.sources[0].sampleRayCapacity = 4;
  rebind(r, true);
  const v = inspect(r);
  assert.equal(v.status, 'finite_cone_witness_passed');
  assert.equal(v.declaredDemandCount, 4);
  assert.equal(v.evaluatedDemandCount, 4);
  for (let i = 0; i < 4; i++) {
    const bad = structuredClone(r); bad.witness.assignment.splice(i, 1);
    assert.equal(inspect(bad).status, 'unavailable');
  }
});

void test('R1 exact near-axis counterexample rejects the outside ray and recovers for a genuinely inside ray', () => {
  const r = createFiniteConeFixture(), original = inspect(r);
  Object.assign(floor(r), { axisWorld: [8.726646259971647e-9, 0, 1], halfAngleDeg: 2e-7, angularErrorDeg: 0 });
  const v = inspect(r);
  assert.equal(v.status, 'reallocation_required');
  assert.equal(v.rays[0].status, 'outside');
  assert.ok(Math.abs(v.rays[0].angleDeg - 5e-7) < 1e-18);
  floor(r).halfAngleDeg = 1e-6;
  assert.equal(inspect(r).status, 'finite_cone_witness_passed');
  floor(r).halfAngleDeg = 2e-7; rotateFloor(r, 5e-8);
  assert.equal(inspect(r).status, 'finite_cone_witness_passed');
  assert.equal(inspect(createFiniteConeFixture()).resultSha256, original.resultSha256);
});

void test('R1 independent vertical oracle reproduces all 120 reviewer conditions without any classification difference', () => {
  let conditions = 0;
  for (const tilt of [0, 1e-7, 3e-7, 5e-7, 1e-6, 1e-5, 20, 45, 90, 180])
    for (const azimuth of [0, 37, 90]) for (const half of [2e-7, 5e-7, 1e-6, 45]) {
      const r = createFiniteConeFixture(), m = floor(r), t = tilt * Math.PI / 180, p = azimuth * Math.PI / 180;
      m.axisWorld = [Math.sin(t) * Math.cos(p), Math.sin(t) * Math.sin(p), Math.cos(t)];
      m.halfAngleDeg = half; m.angularErrorDeg = 0;
      // Scalar oracle for an exactly vertical emission, independent of the general vector calculation.
      const reference = Math.atan2(Math.hypot(m.axisWorld[0], m.axisWorld[1]), m.axisWorld[2]) * 180 / Math.PI;
      const expected = reference < half - 1e-7 ? 'inside' : reference > half + 1e-7 ? 'outside' : 'boundary_unknown';
      const v = inspect(r), ray = v.rays.find(x => x.demandId === 'down');
      assert.equal(ray.status, expected, `${tilt}/${azimuth}/${half}`);
      assert.ok(Math.abs(ray.angleDeg - reference) < 2e-12);
      assert.ok(Object.values(v.acceptance).every(x => x === false));
      conditions++;
    }
  assert.equal(conditions, 120);
});

void test('small and near-antiparallel angles retain accuracy across axis and aperture-to-pupil vector scales', () => {
  let conditions = 0;
  for (const tilt of [5e-7, 1e-6, 180 - 5e-7, 180 - 1e-6, 180])
    for (const azimuth of [0, 37, 123]) for (const scale of [1 - 5e-10, 1, 1 + 5e-10])
      for (const height of [0.01, 1.6, 2.99]) {
        const r = createFiniteConeFixture(), m = floor(r), t = tilt * Math.PI / 180, p = azimuth * Math.PI / 180;
        m.axisWorld = [Math.sin(t) * Math.cos(p) * scale, Math.sin(t) * Math.sin(p) * scale, Math.cos(t) * scale];
        m.angularErrorDeg = 0;
        const demand = r.jointRequest.frame.demands.find(d => d.id === 'down');
        demand.eyeM = [0, 0, height]; demand.targetM = [0, 0, height / 2]; rebind(r);
        const v = inspect(r), ray = v.rays.find(x => x.demandId === 'down');
        assert.equal(ray.status, tilt < 90 ? 'inside' : 'outside');
        assert.ok(Math.abs(ray.angleDeg - tilt) < 2e-12, `${tilt}/${azimuth}/${scale}/${height}`);
        if (tilt > 179 && tilt < 180) assert.ok(ray.angleDeg < 180);
        conditions++;
      }
  assert.equal(conditions, 135);
});

void test('small rotations around a non-cardinal emission retain the perpendicular component', () => {
  const eye = [0.6, 0.8, 1.6], length = Math.hypot(...eye), direction = eye.map(x => x / length), tangent = [-0.8, 0.6, 0];
  for (const tilt of [5e-8, 5e-7, 180 - 5e-7]) {
    const r = createFiniteConeFixture(), m = floor(r), t = tilt * Math.PI / 180;
    const demand = r.jointRequest.frame.demands.find(d => d.id === 'down');
    demand.eyeM = eye; demand.targetM = eye.map(x => x / 2); rebind(r);
    m.axisWorld = direction.map((x, i) => x * Math.cos(t) + tangent[i] * Math.sin(t));
    m.halfAngleDeg = 2e-7; m.angularErrorDeg = 0;
    const ray = inspect(r).rays.find(x => x.demandId === 'down');
    assert.ok(Math.abs(ray.angleDeg - tilt) < 2e-12);
    assert.equal(ray.status, tilt < 1e-7 ? 'inside' : 'outside');
  }
});

void test('narrow-cone uncertainty endpoints remain unknown under rounding while clear margins still decide', () => {
  for (const scale of [1 - 5e-10, 1, 1 + 5e-10])
    for (const [half, expected] of [[7e-7, 'unknown'], [8e-7, 'unknown'], [2e-7, 'unknown'],
      [3e-7, 'unknown'], [9e-7, 'finite_cone_witness_passed'], [1e-7, 'reallocation_required']]) {
      const r = createFiniteConeFixture(); rotateFloor(r, 5e-7);
      floor(r).axisWorld = floor(r).axisWorld.map(x => x * scale);
      floor(r).angularErrorDeg = 2e-7; floor(r).halfAngleDeg = half;
      assert.equal(inspect(r).status, expected, `${half}/${scale}`);
    }
  const r = createFiniteConeFixture(); rotateFloor(r, 180);
  floor(r).halfAngleDeg = 90; floor(r).angularErrorDeg = 90;
  assert.equal(inspect(r).status, 'unknown');
  floor(r).angularErrorDeg = 89;
  assert.equal(inspect(r).status, 'reallocation_required');
});

void test('witness identity, completeness, one pose per device and real geometry are independently checked', () => {
  const cases = [
    r => { r.witness.inputSha256 = '0'.repeat(64); },
    r => { r.witness.selectedPoses.pop(); },
    r => { r.witness.selectedPoses[1] = { ...r.witness.selectedPoses[0] }; },
    r => { r.witness.selectedPoses[0].poseId = 'missing'; },
    r => { r.witness.assignment[1] = { ...r.witness.assignment[0] }; },
    r => { r.witness.assignment[0].demandId = 'missing'; },
    r => { r.witness.assignment[0].sourceId = 'missing'; },
    r => { r.witness.assignment[0].exitId = 'missing'; },
    r => { Object.assign(r.witness.assignment[0], { deviceId: 'device1', poseId: 'ceiling-pose' }); },
    r => { r.witness.assignment[0].poseId = 'ceiling-pose'; },
  ];
  for (const mutate of cases) { const r = createFiniteConeFixture(); mutate(r); assert.equal(inspect(r).status, 'unavailable'); }
});

void test('shared source capacity spans both devices, and exit capacity is enforced without trusting solver status', () => {
  for (const kind of ['source', 'exit']) {
    const r = createFiniteConeFixture();
    if (kind === 'source') r.jointRequest.sources[0].sampleRayCapacity = 1;
    else r.jointRequest.devices[0].poses[0].exits[0].sampleRayCapacity = 0;
    rebind(r);
    assert.equal(joint(r).status, 'finite_joint_allocation_impossible');
    const v = inspect(r);
    assert.equal(v.status, 'unavailable');
    assert.deepEqual(v.reasons, ['witness-shared-capacity-exceeded']);
    assert.equal(v.evaluatedDemandCount, 0);
  }
});

void test('stale or mismatched coordinate, clock, profile, scene, calibration and source never qualify', () => {
  const changes = [
    ['coordinateFrame', 'device-local'], ['clockDomain', 'wall-clock'], ['modelKind', 'horizontal-scalar'],
    ['profileRevision', 2], ['profileSha256', 'd'.repeat(64)], ['sceneSha256', 'd'.repeat(64)],
    ['calibrationId', 'another'], ['calibrationSha256', null], ['sourceId', 'another'],
    ['poseBindingSha256', '0'.repeat(64)],
    ['observedAtMs', 101], ['observedAtMs', 79], ['observedAtMs', null], ['observedAtMs', -1],
    ['validUntilMs', 100], ['validUntilMs', null], ['validUntilMs', 1.5],
    ['axisWorld', null], ['axisWorld', [0, 0, 0]], ['axisWorld', [0, 0, 2]], ['axisWorld', [0, 0]],
    ['halfAngleDeg', null], ['halfAngleDeg', '45'], ['halfAngleDeg', 91], ['angularErrorDeg', null], ['angularErrorDeg', -1],
  ];
  for (const [field, value] of changes) {
    const r = createFiniteConeFixture(); floor(r)[field] = value;
    const v = inspect(r);
    assert.equal(v.status, 'unavailable', `${String(field)}=${JSON.stringify(value)}`);
    assert.equal(v.evaluatedDemandCount, 0);
  }
  for (const field of ['coordinateFrame', 'clockDomain']) {
    const r = createFiniteConeFixture(); r[field] = null; assert.equal(inspect(r).status, 'unavailable');
  }
  const r = createFiniteConeFixture(); r.calibrationModels.pop(); assert.equal(inspect(r).status, 'unavailable');
});

void test('a changed aperture with reused pose/calibration labels invalidates the calibration snapshot until rebound', () => {
  const r = createFiniteConeFixture();
  r.jointRequest.devices[0].poses[0].exits[0].rect = [-1, -1, 1, 1];
  rebind(r, true);
  assert.equal(inspect(r).status, 'unavailable');
  bindModels(r);
  assert.equal(inspect(r).status, 'finite_cone_witness_passed');
});

void test('unknown or stale upstream geometry bindings, capacities, settlement and stop remain unavailable', () => {
  const changes = [
    r => { r.jointRequest.frame.profileSha256 = 'd'.repeat(64); },
    r => { r.jointRequest.devices[0].poses[0].sceneSha256 = 'd'.repeat(64); },
    r => { r.jointRequest.frame.stopConfirmed = false; },
    r => { r.jointRequest.frame.deadlineMs = 100; },
    r => { r.jointRequest.sources[0].sampleRayCapacity = null; },
    r => { r.jointRequest.devices[0].poses[0].settled = false; },
    r => { r.jointRequest.devices[0].poses[0].angleModel = null; },
    r => { r.jointRequest.devices[0].poses[0].validUntilMs = 100; },
  ];
  for (const mutate of changes) { const r = createFiniteConeFixture(); mutate(r); assert.equal(inspect(r).status, 'unavailable'); }
});

function alternatives() {
  const r = createFiniteConeFixture(), device = r.jointRequest.devices[0];
  device.poses.push({ ...structuredClone(device.poses[0]), id: 'z-alternative' });
  r.calibrationModels.push({ ...structuredClone(floor(r)), poseId: 'z-alternative' });
  bindModels(r);
  floor(r).axisWorld = [0, 0, -1];
  rebind(r, true);
  return r;
}
function selectAlternative(r) {
  r.witness.selectedPoses.find(p => p.deviceId === 'device0').poseId = 'z-alternative';
  r.witness.assignment.find(a => a.deviceId === 'device0').poseId = 'z-alternative';
}

void test('a failing first joint witness never becomes a claim that every finite-cone allocation is impossible', () => {
  const r = alternatives(), first = inspect(r);
  assert.equal(first.status, 'reallocation_required');
  selectAlternative(r);
  assert.equal(inspect(r).status, 'finite_cone_witness_passed');
  assert.equal(joint(r).selectedPoses.find(p => p.deviceId === 'device0').poseId, 'floor-pose', 'independent witness validation, not solver-result equality');
});

void test('a complete valid witness can be inspected past an upstream search cutoff without claiming exhaustive search', () => {
  const r = alternatives();
  r.jointRequest.devices[0].poses[0].exits[0].sampleRayCapacity = 0;
  r.jointRequest.searchLimit = 1;
  selectAlternative(r); rebind(r); bindModels(r);
  assert.equal(joint(r).status, 'search_incomplete');
  const v = inspect(r);
  assert.equal(v.status, 'finite_cone_witness_passed');
  assert.equal(v.upstreamSearchStatus, 'search_incomplete');
  assert.equal(v.allAllocationsEvaluated, false);
});

void test('an unused supplied model with unknown calibration cannot be smuggled into a passing report', () => {
  const r = alternatives(); selectAlternative(r);
  floor(r).angularErrorDeg = null;
  assert.equal(inspect(r).status, 'unavailable');
  r.calibrationModels = r.calibrationModels.filter(m => m.poseId !== 'floor-pose');
  assert.equal(inspect(r).status, 'finite_cone_witness_passed', 'only assigned exits require a model, but all supplied models are validated');
});

void test('an outside ray plus a boundary ray keeps both diagnostics and still requires reallocation', () => {
  const r = createFiniteConeFixture(); floor(r).axisWorld = [0, 0, -1];
  r.calibrationModels.find(m => m.poseId === 'ceiling-pose').halfAngleDeg = 0;
  const v = inspect(r);
  assert.equal(v.status, 'reallocation_required');
  assert.deepEqual(v.rays.map(x => x.status), ['outside', 'boundary_unknown']);
  assert.equal(v.evaluatedDemandCount, 2);
});

void test('reordering requests, models and witness arrays leaves canonical digests stable', () => {
  const r = alternatives(), initial = inspect(r);
  r.jointRequest.devices.reverse(); r.jointRequest.frame.demands.reverse();
  for (const d of r.jointRequest.devices) { d.poses.reverse(); for (const p of d.poses) p.exits.reverse(); }
  r.calibrationModels.reverse(); r.witness.assignment.reverse(); r.witness.selectedPoses.reverse();
  assert.equal(inspect(r).inputSha256, initial.inputSha256);
  assert.equal(inspect(r).resultSha256, initial.resultSha256);
});

void test('unavailable, angular rejection and boundary uncertainty recover only after inputs are repaired', () => {
  const good = createFiniteConeFixture(), expected = inspect(good);
  for (const mutate of [r => { floor(r).observedAtMs = 1; }, r => rotateFloor(r, 90), r => rotateFloor(r, 45)]) {
    const r = structuredClone(good); mutate(r); assert.notEqual(inspect(r).status, 'finite_cone_witness_passed');
    assert.equal(inspect(good).resultSha256, expected.resultSha256);
  }
});

void test('strict bounded JSON rejects methods, unexpected authority/horizontal fields, oversized or nonfinite input', () => {
  let called = false;
  assert.throws(() => inspectFiniteCone({ toJSON() { called = true; return createFiniteConeFixture(); } }), /BOUNDED_JSON/);
  assert.equal(called, false);
  assert.throws(() => inspectFiniteCone('{'), /JSON_INVALID/);
  assert.throws(() => inspectFiniteCone(' '.repeat(262145)), /BOUNDED_JSON/);
  assert.throws(() => inspectFiniteCone('{"number":1e999}'), /FINITE_JSON/);
  for (const target of ['root', 'model', 'witness']) {
    const r = createFiniteConeFixture();
    (target === 'root' ? r : target === 'model' ? floor(r) : r.witness).measured = true;
    assert.throws(() => inspect(r), /FIELDS_INVALID/);
  }
  const horizontal = createFiniteConeFixture(); floor(horizontal).horizontalConeDeg = 58;
  assert.throws(() => inspect(horizontal), /FIELDS_INVALID/);
  const duplicate = createFiniteConeFixture(); duplicate.calibrationModels.push(structuredClone(floor(duplicate)));
  assert.throws(() => inspect(duplicate), /MODEL_ID_INVALID_OR_DUPLICATE/);
  const deep = createFiniteConeFixture(); deep.calibrationModels[0].axisWorld = Array.from({ length: 21 }).reduce(v => [v], 1);
  assert.throws(() => inspect(deep), /JSON_TOO_COMPLEX/);
});

void test('eleven historical files stay immutable; Root-authorized joint evolution is separately pinned for review', () => {
  const receipt = JSON.parse(readFileSync(new URL('../docs/evidence/development-execution/mini-02-joint-allocation-review.json', import.meta.url), 'utf8'));
  const preserved = { ...receipt.exactFourSha256, ...receipt.preservedEightSha256 };
  assert.equal(Object.keys(preserved).length, 12);
  // Explicit exception for restrict-only reuse; this pin does not self-approve the new candidate.
  const evolvedPath = 'docs/avocado-mini-r5/factory-development/mini-02-joint-allocation.mjs';
  const evolvedCandidateSha256 = 'b021b4c1b88acd7e53689983b5e6d1edf76c1c76c54e518550e2e70711c42634';
  assert.equal(preserved[evolvedPath], 'a242a99892bd77673da7102c1d02dfbbf6e56c98690d69aa69a42a9183a4ec27');
  let immutableCount = 0;
  for (const [path, historical] of Object.entries(preserved)) {
    const expected = path === evolvedPath ? evolvedCandidateSha256 : historical;
    if (path !== evolvedPath) immutableCount++;
    assert.equal(createHash('sha256').update(readFileSync(new URL(`../${path}`, import.meta.url))).digest('hex'), expected, path);
  }
  assert.equal(immutableCount, 11);
});
