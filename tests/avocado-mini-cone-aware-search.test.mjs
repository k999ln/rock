import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createJointFixture, runJointAllocation, inspectJointCandidates, runJointAllocationWithEdgeMask } from '../docs/avocado-mini-r5/factory-development/mini-02-joint-allocation.mjs';
import { createFiniteConeFixture, inspectFiniteCone, runConeAwareSearch } from '../docs/avocado-mini-r5/factory-development/mini-02-finite-cone.mjs';

const canonical = v => Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : v !== null && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v);
const digest = v => createHash('sha256').update(canonical(v)).digest('hex');
const run = r => runConeAwareSearch(JSON.stringify(r));
const joint = r => runJointAllocation(JSON.stringify(r));
function searchFixture(request = createFiniteConeFixture().jointRequest) {
  const template = createFiniteConeFixture().calibrationModels[0];
  return { schema: 'rockstaros.mini-cone-aware-search/1', studyOnly: true,
    coordinateFrame: 'place-world-metres/1', clockDomain: 'synthetic-monotonic-ms/1', jointRequest: request,
    calibrationModels: request.devices.flatMap(d => d.poses.flatMap(p => p.exits.map(e => ({ ...structuredClone(template),
      deviceId: d.id, poseId: p.id, exitId: e.id, sourceId: e.sourceId, calibrationId: p.calibrationId,
      profileRevision: request.profile.revision, profileSha256: request.profile.sha256, sceneSha256: request.frame.sceneSha256,
      poseBindingSha256: digest({ deviceId: d.id, poseId: p.id, sceneSha256: p.sceneSha256, calibrationId: p.calibrationId,
        exits: structuredClone(p.exits).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) }),
      axisWorld: e.face === 'floor' ? [0, 0, 1] : [0, 0, -1], halfAngleDeg: 30, angularErrorDeg: 0,
    })))) };
}
function maskFixture(request = createFiniteConeFixture().jointRequest) {
  const c = inspectJointCandidates(JSON.stringify(request));
  return { schema: 'rockstaros.mini-joint-edge-mask/1', studyOnly: true, jointRequest: request,
    jointInputSha256: c.jointInputSha256, candidateEdgesSha256: c.candidateEdgesSha256,
    allowedEdgeIndices: c.candidateEdges?.map(e => e.index) ?? [] };
}
const mask = r => runJointAllocationWithEdgeMask(JSON.stringify(r));
function inspectResult(r, result) {
  return inspectFiniteCone(JSON.stringify({ ...r, schema: 'rockstaros.mini-finite-cone-study/1', witness: result.witness }));
}
function samePoseFixture() {
  const q = createJointFixture(), lower = structuredClone(q.devices[0].poses[0]), upper = q.devices[0].poses[1].exits[0];
  lower.id = 'same-pose'; lower.exits[0].id = 'a-bad';
  lower.exits.push({ ...structuredClone(lower.exits[0]), id: 'z-good' }, { ...structuredClone(upper), id: 'upper' });
  q.devices[0].poses = [lower]; q.searchLimit = 1;
  q.frame.demands = q.frame.demands.flatMap(d => [-.032, .032].map((x, i) => ({ ...d, id: `${d.id}-${i}`, eyeM: [x, 0, 1.6] })));
  q.sources[0].sampleRayCapacity = 4;
  const r = searchFixture(q); r.calibrationModels.find(m => m.exitId === 'a-bad').axisWorld = [0, 0, -1];
  return r;
}

void test('candidate preparation is stable data without search, and masks bind the original request and candidate order', () => {
  const r = maskFixture(), c = inspectJointCandidates(JSON.stringify(r.jointRequest));
  assert.equal(c.searchedConfigurations, 0); assert.equal(c.status, 'available');
  assert.deepEqual(c.candidateEdges.map(e => e.index), [0, 1]);
  const result = mask(r);
  assert.equal(result.status, 'finite_joint_allocation_found'); assert.equal(result.coneAcceptance, false);
  assert.equal(result.jointInputSha256, joint(r.jointRequest).inputSha256);
  assert.equal(result.maskSha256, digest({ jointInputSha256: r.jointInputSha256,
    candidateEdgesSha256: r.candidateEdgesSha256, allowedEdgeIndices: [0, 1] }));
  assert.ok(Object.values(result.acceptance).every(x => x === false));
  const reversed = structuredClone(r); reversed.allowedEdgeIndices.reverse(); reversed.jointRequest.devices.reverse(); reversed.jointRequest.frame.demands.reverse();
  assert.deepEqual(mask(reversed), result);
  c.canonicalJointRequest.frame.demands.length = 0; c.candidateEdges.length = 0;
  assert.deepEqual(mask(r), result, 'returned preparation data cannot mutate a subsequent call');
});

void test('an empty mask removes edges, never demands or capacity gates', () => {
  const r = maskFixture(); r.allowedEdgeIndices = [];
  const result = mask(r);
  assert.equal(result.demandCount, 2); assert.equal(result.bestAllocatedDemandCount, 0);
  assert.equal(result.assignment, null); assert.equal(result.status, 'finite_joint_allocation_impossible');
  assert.equal(result.bestAttempt.unassignedDemandIds.length, 2);
});

void test('a mask cannot resurrect geometry-blocked rays, and unknown prerequisites expose no candidate table', () => {
  const q = createFiniteConeFixture().jointRequest;
  q.devices[0].poses[0].exits[0].rect = [.5, .5, 1, 1];
  const r = maskFixture(q), v = mask(r);
  assert.equal(v.candidateEdgeCount, 1); assert.equal(v.demandCount, 2);
  assert.equal(v.bestAllocatedDemandCount, 1); assert.equal(v.assignment, null);
  q.sources[0].sampleRayCapacity = null;
  const c = inspectJointCandidates(JSON.stringify(q));
  assert.equal(c.status, 'unsupported'); assert.equal(c.candidateEdges, null);
  const unknown = mask(maskFixture(q)); assert.equal(unknown.status, 'unsupported');
  assert.equal(unknown.searchedConfigurations, 0); assert.equal(unknown.assignment, null);
});

void test('mask negative inputs cannot create foreign edges, reuse old bindings or run callbacks', () => {
  for (const indices of [[0, 0], [-1], [2], [0.5], ['0'], [true], null, Array(12289).fill(0)]) {
    const r = maskFixture(); r.allowedEdgeIndices = indices; assert.throws(() => mask(r), /MASK_INDEX/);
  }
  for (const field of ['jointInputSha256', 'candidateEdgesSha256']) {
    const r = maskFixture(); r[field] = '0'.repeat(64); assert.throws(() => mask(r), /BINDING_MISMATCH/);
  }
  const rebound = maskFixture(); rebound.jointRequest.sources[0].sampleRayCapacity = 1;
  assert.throws(() => mask(rebound), /INPUT_BINDING_MISMATCH/);
  rebound.jointInputSha256 = joint(rebound.jointRequest).inputSha256;
  assert.throws(() => mask(rebound), /CANDIDATE_BINDING_MISMATCH/);
  for (const field of ['callback', 'eval', 'module', 'maskSha256', 'grantsAuthority']) {
    const r = maskFixture(); r[field] = 'unexpected'; assert.throws(() => mask(r), /FIELDS_INVALID/);
  }
  let called = false;
  assert.throws(() => runJointAllocationWithEdgeMask({ toJSON() { called = true; } }), /BOUNDED_JSON/);
  assert.throws(() => inspectJointCandidates({ get frame() { called = true; return {}; } }), /BOUNDED_JSON/);
  assert.equal(called, false);
  assert.throws(() => runJointAllocationWithEdgeMask(' '.repeat(262145)), /BOUNDED_JSON/);
  assert.throws(() => runJointAllocationWithEdgeMask('{'), /JSON_INVALID/);
  assert.throws(() => runJointAllocationWithEdgeMask('{"x":1e999}'), /FINITE_JSON/);
  assert.equal(mask(maskFixture()).status, 'finite_joint_allocation_found');
});

void test('same-pose alternate exit recovers all four pupil/up/down demands within one pose visit', () => {
  const r = samePoseFixture(), first = joint(r.jointRequest);
  const firstCheck = inspectResult(r, { witness: { inputSha256: first.inputSha256, selectedPoses: first.selectedPoses, assignment: first.assignment } });
  assert.equal(firstCheck.status, 'reallocation_required');
  const before = JSON.stringify(r), result = run(r);
  assert.equal(result.status, 'finite_cone_allocation_found'); assert.equal(result.searchedConfigurations, 1);
  assert.equal(result.assignedDemandCount, 4); assert.equal(result.declaredDemandCount, 4);
  assert.ok(result.witness.assignment.every(a => a.exitId !== 'a-bad'));
  assert.deepEqual(result.witness.selectedPoses, first.selectedPoses);
  assert.equal(inspectResult(r, result).status, 'finite_cone_witness_passed');
  assert.equal(result.witnessVerified, true); assert.equal(JSON.stringify(r), before);
  assert.ok(Object.values(result.acceptance).every(x => x === false));
  assert.equal(result.counts.imageLocationPassiveSurfaces, 0); assert.equal(result.counts.installedEnclosures, null);
  assert.equal(result.fullBaselineEvaluated, false); assert.equal(result.continuousDomainEvaluated, false);
});

void test('rejecting one bad pair does not delete an exit usable by another ray; residual reassignment recovers', () => {
  const q = createJointFixture(), p = q.devices[0].poses[0]; q.devices[0].poses = [p];
  q.frame.demands = [{ id: 'a', viewerId: 'v', targetId: 'a', eyeM: [0, 0, 1.6], targetM: [0, 0, .8] },
    { id: 'b', viewerId: 'v', targetId: 'b', eyeM: [1, 0, 1.6], targetM: [.5, 0, .8] }];
  p.exits = ['a', 'b'].map(id => ({ ...structuredClone(p.exits[0]), id, sampleRayCapacity: 1 }));
  const r = searchFixture(q), m = r.calibrationModels.find(m => m.exitId === 'a'), length = Math.hypot(1, 1.6);
  m.axisWorld = [1 / length, 0, 1.6 / length]; m.halfAngleDeg = 10;
  r.calibrationModels.find(m => m.exitId === 'b').halfAngleDeg = 45;
  assert.deepEqual(joint(q).assignment.map(a => a.exitId), ['a', 'b']);
  const result = run(r);
  assert.equal(result.status, 'finite_cone_allocation_found');
  assert.deepEqual(result.witness.assignment.map(a => [a.demandId, a.exitId]), [['a', 'b'], ['b', 'a']]);
  assert.equal(inspectResult(r, result).status, 'finite_cone_witness_passed');
});

void test('exclusive poses and cross-device shared capacity cannot be relaxed by cone search', () => {
  for (const q of [createJointFixture(), createFiniteConeFixture().jointRequest]) {
    if (q.devices.length === 2) q.sources[0].sampleRayCapacity = 1;
    const r = run(searchFixture(q));
    assert.equal(r.status, 'finite_cone_allocation_impossible'); assert.equal(r.witness, null);
    assert.equal(r.finiteModelInfeasibilityProven, true); assert.equal(r.poseSearchComplete, true);
  }
});

void test('cutoff stays unknown and a larger budget recovers the later pose without changing D', () => {
  const q = createFiniteConeFixture().jointRequest, p = q.devices[0].poses[0]; p.id = 'a-bad';
  q.devices[0].poses.push({ ...structuredClone(p), id: 'z-good' }); q.searchLimit = 1;
  const r = searchFixture(q); r.calibrationModels.find(m => m.poseId === 'a-bad').axisWorld = [0, 0, -1];
  const limited = run(r); assert.equal(limited.status, 'unknown'); assert.deepEqual(limited.reasons, ['search_cutoff']);
  assert.equal(limited.finiteModelInfeasibilityProven, false); assert.equal(limited.poseSearchComplete, false);
  r.jointRequest.searchLimit = 2;
  const found = run(r); assert.equal(found.status, 'finite_cone_allocation_found'); assert.equal(found.assignedDemandCount, 2);
  assert.equal(found.witness.selectedPoses.find(p => p.deviceId === 'device0').poseId, 'z-good');
});

void test('boundary-needed cases stay unknown; unused boundary edges cannot qualify but do not block a known witness', () => {
  const r = searchFixture(); r.calibrationModels[0].halfAngleDeg = 0;
  let result = run(r); assert.equal(result.status, 'unknown'); assert.deepEqual(result.reasons, ['angular_boundary_unresolved']);
  assert.equal(result.poseSearchComplete, true); assert.equal(result.finiteModelInfeasibilityProven, false);
  r.calibrationModels[0].halfAngleDeg = 30; assert.equal(run(r).status, 'finite_cone_allocation_found');
  const alternate = samePoseFixture();
  const unused = alternate.calibrationModels.find(m => m.exitId === 'a-bad'); unused.axisWorld = [0, 0, 1]; unused.halfAngleDeg = 0;
  // Give this unused cone an error interval containing the pupil-offset rays.
  unused.angularErrorDeg = 10;
  result = run(alternate); assert.equal(result.status, 'finite_cone_allocation_found');
  assert.ok(result.edgeCounts.boundaryUnknown > 0); assert.ok(result.rays.every(ray => ray.status === 'inside'));
});

void test('search preserves the repaired near-axis numerical classification instead of admitting a false inside edge', () => {
  const r = searchFixture(), m = r.calibrationModels[0];
  Object.assign(m, { axisWorld: [8.726646259971647e-9, 0, 1], halfAngleDeg: 2e-7, angularErrorDeg: 0 });
  assert.equal(run(r).status, 'finite_cone_allocation_impossible');
  m.halfAngleDeg = 5e-7; assert.equal(run(r).status, 'unknown');
  m.halfAngleDeg = 1e-6; assert.equal(run(r).status, 'finite_cone_allocation_found');
});

void test('every declared exit requires current calibration, even when unused, zero-capacity or in a later pose', () => {
  const changes = [
    r => r.calibrationModels.pop(), r => { r.calibrationModels[0].angularErrorDeg = null; },
    r => { r.calibrationModels[0].validUntilMs = 100; }, r => { r.calibrationModels[0].observedAtMs = 101; },
    r => { r.calibrationModels[0].profileSha256 = '0'.repeat(64); }, r => { r.calibrationModels[0].clockDomain = 'wall'; },
    r => { r.calibrationModels[0].poseBindingSha256 = '0'.repeat(64); }, r => { r.calibrationModels[0].sourceId = 'foreign'; },
    r => { r.jointRequest.frame.stopConfirmed = false; }, r => { r.jointRequest.sources[0].sampleRayCapacity = null; },
    r => { r.jointRequest.frame.profileRevision++; }, r => { r.jointRequest.devices[0].poses[0].sceneSha256 = '0'.repeat(64); },
  ];
  const original = run(searchFixture());
  for (const change of changes) {
    const r = searchFixture(); change(r); const v = run(r);
    assert.equal(v.status, 'unavailable'); assert.equal(v.searchedConfigurations, 0);
    assert.equal(v.witness, null); assert.equal(v.finiteModelInfeasibilityProven, false);
    assert.deepEqual(run(searchFixture()), original);
  }
  const q = createFiniteConeFixture().jointRequest;
  const unused = structuredClone(q.devices[0].poses[0]); unused.id = 'z-unused'; unused.exits[0].sampleRayCapacity = 0;
  q.devices[0].poses.push(unused);
  const r = searchFixture(q); r.calibrationModels = r.calibrationModels.filter(m => m.poseId !== 'z-unused');
  assert.equal(run(r).status, 'unavailable');
});

void test('search is strict data-only, order stable and never accepts injected eligibility or authority', () => {
  const r = samePoseFixture(), expected = run(r);
  r.jointRequest.devices.reverse(); r.jointRequest.sources.reverse(); r.jointRequest.frame.demands.reverse();
  for (const d of r.jointRequest.devices) { d.poses.reverse(); for (const p of d.poses) p.exits.reverse(); }
  r.calibrationModels.reverse(); assert.deepEqual(run(r), expected);
  for (const field of ['witness', 'allowedEdgeIndices', 'callback', 'measured', 'dispatchAllowed']) {
    const bad = searchFixture(); bad[field] = true; assert.throws(() => run(bad), /FIELDS_INVALID/);
  }
  let called = false;
  assert.throws(() => runConeAwareSearch({ toJSON() { called = true; } }), /BOUNDED_JSON/);
  assert.equal(called, false);
  assert.throws(() => runConeAwareSearch(' '.repeat(262145)), /BOUNDED_JSON/);
  assert.throws(() => runConeAwareSearch('{'), /JSON_INVALID/);
  assert.throws(() => runConeAwareSearch('{"x":1e999}'), /FINITE_JSON/);
  assert.deepEqual(run(samePoseFixture()), expected);
});

function capacityFixture(twoDevices = false) {
  const q = createJointFixture(), floor = structuredClone(q.devices[0].poses[0]), ceiling = structuredClone(q.devices[0].poses[1]);
  const exit = (id, face, sourceId, rect = [-2, -2, 2, 2]) => ({ id, face, sourceId, rect, guardM: 0, sampleRayCapacity: 0 });
  q.sources = [{ id: 'a', sampleRayCapacity: 0 }, { id: 'b', sampleRayCapacity: 0 }];
  if (!twoDevices) {
    floor.id = 'both'; q.devices[0].poses = [floor];
    q.frame.demands = [-.75, 0, .75].map((x, i) => ({ id: `r${i}`, viewerId: 'viewer', targetId: `t${i}`, eyeM: [x, 0, 1.6], targetM: [x, 0, .8] }));
    floor.exits = [exit('wide', 'floor', 'a'), exit('center', 'floor', 'a', [-.25, -1, .25, 1]), exit('right', 'floor', 'b', [.5, -1, 1, 1])];
  } else {
    q.frame.demands = [{ id: 'left', viewerId: 'v', targetId: 'left', eyeM: [-.75, 0, 1.6], targetM: [-.75, 0, .8] },
      { id: 'right', viewerId: 'v', targetId: 'right', eyeM: [.75, 0, 1.6], targetM: [.75, 0, .8] },
      { id: 'up', viewerId: 'v', targetId: 'up', eyeM: [0, 0, 1.6], targetM: [0, 0, 2] }];
    q.devices = [{ id: 'device0', poses: [{ ...floor, id: 'floor', exits: [exit('main', 'floor', 'a')] }, { ...ceiling, id: 'ceiling', exits: [exit('main', 'ceiling', 'a')] }] },
      { id: 'device1', poses: [{ ...floor, id: 'narrow', exits: [exit('lower', 'floor', 'a', [.5, -1, 1, 1]), exit('upper', 'ceiling', 'b')] },
        { ...floor, id: 'wide', exits: [exit('lower', 'floor', 'b'), exit('upper', 'ceiling', 'a')] }] }];
  }
  return q;
}
function* capacityCases(twoDevices = false) {
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++)
    for (let s0 = 0; s0 < 4; s0++) for (let s1 = 0; s1 < 4; s1++) {
      const q = capacityFixture(twoDevices);
      if (twoDevices) {
        for (const p of q.devices[0].poses) p.exits[0].sampleRayCapacity = a;
        for (const p of q.devices[1].poses) { p.exits[0].sampleRayCapacity = b; p.exits[1].sampleRayCapacity = c; }
      } else q.devices[0].poses[0].exits.forEach((e, i) => { e.sampleRayCapacity = [a, b, c][i]; });
      q.sources[0].sampleRayCapacity = s0; q.sources[1].sampleRayCapacity = s1;
      yield q;
    }
}

void test('both legacy 432-case full output streams retain baseline-ccec6d4 output, digests and ordering exactly', () => {
  // These hashes were generated by running the unmodified fixed-main module in a separate snapshot.
  for (const [twoDevices, expected] of [[false, '2b79abcadfced4c789f3b82efdb1b4a2bc7ca556c515c4c66c214b29a1c74e04'],
    [true, 'eda14d78209b6f3a4408dc5c18125409342652d2a08afe989645e1583b28bf6a']]) {
    const h = createHash('sha256'); let cases = 0, possible = 0;
    for (const q of capacityCases(twoDevices)) { const v = joint(q); h.update(JSON.stringify(v) + '\n'); cases++; possible += v.status === 'finite_joint_allocation_found'; }
    assert.equal(cases, 432); assert.equal(h.digest('hex'), expected);
    if (twoDevices) assert.equal(possible, 98);
  }
});

// Independent oracle for these exactly vertical fixture rays: direct face/XY tests
// and a scalar angular formula. No production geometry, candidate builder or solver.
function oracleEdge(demand, exit, model) {
  const face = demand.targetM[2] < demand.eyeM[2] ? 'floor' : 'ceiling';
  const [x, y] = demand.eyeM, [x0, y0, x1, y1] = exit.rect, g = exit.guardM;
  if (exit.face !== face || x < x0 + g || x > x1 - g || y < y0 + g || y > y1 - g) return null;
  const sign = face === 'floor' ? 1 : -1;
  const angle = Math.atan2(Math.hypot(model.axisWorld[0], model.axisWorld[1]), sign * model.axisWorld[2]) * 180 / Math.PI;
  const margin = 1e-7 + 64 * Number.EPSILON * 180 / Math.PI;
  return Math.min(180, angle + model.angularErrorDeg) < model.halfAngleDeg - margin ? 'inside'
    : Math.max(0, angle - model.angularErrorDeg) > model.halfAngleDeg + margin ? 'outside' : 'boundary_unknown';
}
function exhaustive(r) {
  const q = r.jointRequest, model = (d, p, e) => r.calibrationModels.find(m => m.deviceId === d.id && m.poseId === p.id && m.exitId === e.id);
  let best = 0, boundary = false;
  for (const p0 of q.devices[0].poses) for (const p1 of q.devices[1].poses) {
    const active = [p0, p1].flatMap((p, i) => p.exits.map(e => ({ ...e, model: model(q.devices[i], p, e) })));
    const choices = q.frame.demands.map(d => active.map(e => oracleEdge(d, e, e.model)));
    boundary ||= choices.some(xs => xs.includes('boundary_unknown'));
    for (let encoded = 0; encoded < (active.length + 1) ** q.frame.demands.length; encoded++) {
      let value = encoded, count = 0, valid = true;
      const exitUse = active.map(() => 0), sourceUse = new Map(q.sources.map(s => [s.id, 0]));
      for (let i = 0; i < q.frame.demands.length; i++) {
        const pick = value % (active.length + 1) - 1; value = Math.floor(value / (active.length + 1));
        if (pick < 0) continue;
        if (choices[i][pick] !== 'inside') { valid = false; break; }
        count++; exitUse[pick]++; sourceUse.set(active[pick].sourceId, sourceUse.get(active[pick].sourceId) + 1);
      }
      if (valid && active.every((e, i) => exitUse[i] <= e.sampleRayCapacity)
        && q.sources.every(s => sourceUse.get(s.id) <= s.sampleRayCapacity)) best = Math.max(best, count);
    }
  }
  return { best, boundary, status: best === q.frame.demands.length ? 'finite_cone_allocation_found'
    : boundary ? 'unknown' : 'finite_cone_allocation_impossible' };
}
function independentWitness(r, attempt) {
  const q = r.jointRequest, seen = new Set(), sources = new Map(), exits = new Map();
  assert.equal(attempt.selectedPoses.length, q.devices.length);
  assert.equal(new Set(attempt.selectedPoses.map(p => p.deviceId)).size, q.devices.length);
  for (const a of attempt.assignment) {
    assert.ok(!seen.has(a.demandId)); seen.add(a.demandId);
    const d = q.frame.demands.find(d => d.id === a.demandId), device = q.devices.find(d => d.id === a.deviceId);
    const pose = device.poses.find(p => p.id === a.poseId), e = pose.exits.find(e => e.id === a.exitId);
    assert.equal(attempt.selectedPoses.find(p => p.deviceId === a.deviceId).poseId, a.poseId);
    assert.equal(a.sourceId, e.sourceId);
    const m = r.calibrationModels.find(m => m.deviceId === a.deviceId && m.poseId === a.poseId && m.exitId === a.exitId);
    assert.equal(oracleEdge(d, e, m), 'inside');
    const key = `${a.deviceId}/${a.poseId}/${a.exitId}`;
    exits.set(key, (exits.get(key) ?? 0) + 1); sources.set(e.sourceId, (sources.get(e.sourceId) ?? 0) + 1);
    assert.ok(exits.get(key) <= e.sampleRayCapacity);
  }
  for (const s of q.sources) assert.ok((sources.get(s.id) ?? 0) <= s.sampleRayCapacity);
}

void test('cone search agrees with independent exhaustive enumeration over 4 x 432 capacity/cone cases', t => {
  let cases = 0; const totals = { finite_cone_allocation_found: 0, finite_cone_allocation_impossible: 0, unknown: 0 };
  for (const variant of ['inward', 'outward', 'mixed', 'boundary']) for (const q of capacityCases(true)) {
    const r = searchFixture(q);
    for (const m of r.calibrationModels) {
      if (variant === 'outward') m.axisWorld = m.axisWorld.map(x => -x);
      if (variant === 'mixed' && m.deviceId === 'device1' && m.exitId === 'lower')
        m.axisWorld = [Math.SQRT1_2, 0, Math.SQRT1_2];
      if (variant === 'boundary' && m.deviceId === 'device0' && m.poseId === 'ceiling') m.halfAngleDeg = 0;
    }
    const expected = exhaustive(r), result = run(r);
    assert.equal(result.status, expected.status, `${variant}/${cases}`);
    assert.equal(result.bestAllocatedDemandCount, expected.best);
    assert.equal(result.finiteModelInfeasibilityProven, expected.status === 'finite_cone_allocation_impossible');
    independentWitness(r, result.bestAttempt);
    if (result.witness) { independentWitness(r, result.witness); assert.equal(result.witness.assignment.length, 3); }
    assert.ok(Object.values(result.acceptance).every(x => x === false));
    totals[result.status]++; cases++;
  }
  assert.equal(cases, 1728);
  t.diagnostic(JSON.stringify({ exhaustiveCases: cases, totals, returnedAttemptsValidated: cases }));
});
