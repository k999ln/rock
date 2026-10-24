import test from 'node:test';
import assert from 'node:assert/strict';
import { createJointFixture, runJointAllocation, runFixedBaselineReduction } from '../docs/avocado-mini-r5/factory-development/mini-02-joint-allocation.mjs';

const run = r => runJointAllocation(JSON.stringify(r));
function twoDevices() {
  const r = createJointFixture();
  r.devices = r.devices[0].poses.map((p, i) => ({ id: `device${i}`, poses: [p] }));
  return r;
}
function bothExits() {
  const r = createJointFixture();
  const p = structuredClone(r.devices[0].poses[0]); p.id = 'both';
  p.exits.push({ ...structuredClone(r.devices[0].poses[1].exits[0]), id: 'upper-exit' });
  r.devices[0].poses = [p]; return r;
}
function assertWitness(request, result) {
  assert.equal(result.status, 'finite_joint_allocation_found');
  assert.equal(result.assignment.length, request.frame.demands.length);
  assert.equal(new Set(result.assignment.map(a => a.demandId)).size, request.frame.demands.length);
  assert.equal(result.selectedPoses.length, request.devices.length);
  for (const a of result.assignment) assert.equal(result.selectedPoses.find(p => p.deviceId === a.deviceId).poseId, a.poseId);
  for (const s of request.sources) assert.ok(result.assignment.filter(a => a.sourceId === s.id).length <= s.sampleRayCapacity);
  for (const d of request.devices) for (const p of d.poses) for (const e of p.exits)
    assert.ok(result.assignment.filter(a => a.deviceId === d.id && a.poseId === p.id && a.exitId === e.id).length <= e.sampleRayCapacity);
}

void test('individually reachable up/down rays cannot use two exclusive poses at once', () => {
  const r = run(createJointFixture());
  assert.equal(r.individuallyReachableCount, 2);
  assert.deepEqual(r.geometricallyUnreachableDemandIds, []);
  assert.equal(r.status, 'finite_joint_allocation_impossible');
  assert.equal(r.searchComplete, true); assert.equal(r.searchedConfigurations, 2);
  assert.equal(r.assignment, null); assert.equal(r.bestAllocatedDemandCount, 1);
  assert.equal(r.bestAttempt.unassignedDemandIds.length, 1);
  assert.equal(r.bestAttempt.selectedPoses.length, 1);
});
void test('independent devices produce a joint witness while still granting no physical authority', () => {
  const request = twoDevices(), r = run(request); assertWitness(request, r);
  assert.ok(Object.values(r.acceptance).every(v => v === false));
  assert.equal(r.fullBaselineEvaluated, false); assert.equal(r.continuousDomainEvaluated, false);
  assert.equal(r.baselineEyeTargetPairs, 35721); assert.equal(r.baselinePupilRaysPerPair, 18);
  assert.equal(r.counts.modeledDevices, 2); assert.equal(r.counts.declaredSources, 1);
  assert.equal(r.counts.installedEnclosures, null); assert.equal(r.counts.imageLocationPassiveSurfaces, 0);
  assert.equal(r.poseCatalog[0].nominalAreaM2, 16);
});
void test('both pupils and both upper/lower targets remain in one frame with one fixed world point per target ID', () => {
  const r = twoDevices();
  r.frame.demands = r.frame.demands.flatMap(d => [-0.032, 0.032].map((x, i) => ({ ...d, id: `${d.id}-${i}`, eyeM: [x, 0, 1.6] })));
  r.sources[0].sampleRayCapacity = 4;
  const result = run(r); assertWitness(r, result); assert.equal(result.demandCount, 4);
  r.frame.demands[1].targetM = [0.1, 0, 0.8];
  assert.throws(() => run(r), /WORLD_TARGET_MOVED/);
});
void test('shared source capacity is not multiplied by its exits or devices', () => {
  for (const r of [twoDevices(), bothExits()]) {
    r.sources[0].sampleRayCapacity = 1;
    const result = run(r); assert.equal(result.individuallyReachableCount, 2);
    assert.equal(result.status, 'finite_joint_allocation_impossible'); assert.equal(result.bestAllocatedDemandCount, 1);
  }
  const zero = bothExits(); zero.sources[0].sampleRayCapacity = 0;
  const result = run(zero); assert.equal(result.bestAllocatedDemandCount, 0);
  assert.equal(result.bestAttempt.unassignedDemandIds.length, 2);
});
void test('residual reassignment finds a feasible solution that greedy first-exit selection misses', () => {
  const r = bothExits(), pose = r.devices[0].poses[0];
  r.frame.demands = [
    { id: 'a-flexible', viewerId: 'viewer', targetId: 'center', eyeM: [0, 0, 1.6], targetM: [0, 0, 0.8] },
    { id: 'b-restricted', viewerId: 'viewer', targetId: 'right', eyeM: [1, 0, 1.6], targetM: [1, 0, 0.8] },
  ];
  pose.exits = [
    { ...pose.exits[0], id: 'a-wide', sampleRayCapacity: 1 },
    { ...pose.exits[0], id: 'b-narrow', rect: [-0.5, -1, 0.5, 1], sampleRayCapacity: 1 },
  ];
  const result = run(r); assertWitness(r, result);
  assert.equal(result.assignment.find(a => a.demandId === 'a-flexible').exitId, 'b-narrow');
  assert.equal(result.assignment.find(a => a.demandId === 'b-restricted').exitId, 'a-wide');
});
void test('per-exit capacity and boundary guard are enforced separately from shared capacity', () => {
  const r = bothExits(); r.devices[0].poses[0].exits[0].sampleRayCapacity = 0;
  assert.equal(run(r).status, 'finite_joint_allocation_impossible');
  const seam = bothExits();
  seam.frame.demands = [{ id: 'seam', viewerId: 'viewer', targetId: 'corner', eyeM: [0, 0, 1.5], targetM: [1, 1, 0.75] }];
  seam.devices[0].poses[0].exits = [{ ...seam.devices[0].poses[0].exits[0], guardM: 0.01 }];
  assert.deepEqual(run(seam).geometricallyUnreachableDemandIds, ['seam']);
});
void test('budget exhaustion stays unknown and increasing the budget can reveal a joint solution', () => {
  const r = createJointFixture(), p = bothExits().devices[0].poses[0]; p.id = 'z-both'; r.devices[0].poses.push(p);
  r.searchLimit = 1; const limited = run(r);
  assert.equal(limited.status, 'search_incomplete'); assert.equal(limited.searchComplete, false);
  assert.equal(limited.totalConfigurations, 3); assert.equal(limited.assignment, null);
  r.searchLimit = 3; assertWitness(r, run(r));
});
void test('unknown capacity/calibration/angles, stale or late frames, unsettled and stop-unconfirmed stay unavailable', () => {
  for (const change of [
    r => { r.sources[0].sampleRayCapacity = null; },
    r => { r.devices[0].poses[0].exits[0].sampleRayCapacity = null; },
    r => { r.devices[0].poses[0].calibrationId = null; },
    r => { r.devices[0].poses[0].angleModel = null; },
    r => { r.devices[0].poses[0].settled = false; },
    r => { r.devices[0].poses[0].observedAtMs = 0; },
    r => { r.devices[0].poses[0].observedAtMs = 101; },
    r => { r.devices[0].poses[0].validUntilMs = 100; },
    r => { r.devices[0].poses[0].observedAtMs = null; },
    r => { r.frame.deadlineMs = 100; },
    r => { r.frame.stopConfirmed = false; },
    r => { r.frame.stopConfirmed = null; },
  ]) {
    const r = bothExits(); change(r); const result = run(r);
    assert.equal(result.status, 'unsupported'); assert.equal(result.searchedConfigurations, 0);
    assert.equal(result.individuallyReachableCount, null); assert.equal(result.assignment, null);
    assert.ok(result.unknown.length > 0);
  }
});
void test('stale profile/scene, changed baseline, authority flags, unknown sources and nonfixed world are rejected', () => {
  for (const [change, pattern] of [
    [r => { r.frame.profileRevision++; }, /STALE_PROFILE/],
    [r => { r.frame.profileSha256 = 'c'.repeat(64); }, /STALE_PROFILE/],
    [r => { r.devices[0].poses[0].sceneSha256 = 'c'.repeat(64); }, /STALE_SCENE/],
    [r => { r.geometrySha256 = 'c'.repeat(64); }, /BASELINE_CHANGED/],
    [r => { r.baselineFixtureSha256 = 'c'.repeat(64); }, /BASELINE_CHANGED/],
    [r => { r.frame.worldFixed = false; }, /FIXED_WORLD/],
    [r => { r.physicalAccepted = true; }, /FIELDS_INVALID/],
    [r => { r.devices[0].poses[0].exits[0].sourceId = 'unknown'; }, /UNKNOWN_SOURCE/],
    [r => { r.frame.demands[0].targetM = [0, 0, -0.1]; }, /ENDPOINT_OUTSIDE/],
    [r => { r.frame.demands[0].targetM = [...r.frame.demands[0].eyeM]; }, /COINCIDENT/],
    [r => { r.frame.demands.push(structuredClone(r.frame.demands[0])); }, /DUPLICATE/],
    [r => { r.sources[0].sampleRayCapacity = -1; }, /CAPACITY_INVALID/],
    [r => { r.searchLimit = 1025; }, /SEARCH_LIMIT/],
  ]) { const r = createJointFixture(); change(r); assert.throws(() => run(r), pattern); }
});
void test('bounded JSON avoids getters and rejects nonfinite/deep/malformed input', () => {
  let touched = false;
  assert.throws(() => runJointAllocation({ get frame() { touched = true; return {}; } }), /BOUNDED_JSON/);
  assert.equal(touched, false);
  assert.throws(() => runJointAllocation(' '.repeat(131073)), /BOUNDED_JSON/);
  assert.throws(() => runJointAllocation('{'), /JSON_INVALID/);
  assert.throws(() => runJointAllocation('['.repeat(18) + '0' + ']'.repeat(18)), /TOO_COMPLEX/);
  assert.throws(() => runJointAllocation(JSON.stringify(createJointFixture()).replace('"searchLimit":128', '"searchLimit":1e999')), /FINITE_JSON/);
});
void test('ordering, deterministic ties, caller mutation and rejection recovery preserve input/result digests', () => {
  const request = twoDevices(), encoded = JSON.stringify(request), first = run(request);
  const reordered = JSON.parse(encoded); reordered.devices.reverse(); reordered.frame.demands.reverse();
  reordered.sources.reverse(); assert.deepEqual(run(reordered), first);
  assert.throws(() => runJointAllocation('{}'), /FIELDS_INVALID/);
  first.profileBinding.revision++; first.assignment.length = 0;
  assert.deepEqual(runJointAllocation(encoded), run(request)); assert.equal(JSON.stringify(request), encoded);
  const tie = createJointFixture(); tie.devices[0].poses.reverse();
  assert.deepEqual(run(tie), run(createJointFixture()));
});
void test('small allocations agree with an independent exhaustive assignment oracle across432 capacity combinations', () => {
  const r = bothExits(), p = r.devices[0].poses[0], template = p.exits[0];
  r.sources = [{ id: 'a', sampleRayCapacity: 0 }, { id: 'b', sampleRayCapacity: 0 }];
  r.frame.demands = [-0.75, 0, 0.75].map((x, i) => ({ id: `r${i}`, viewerId: 'viewer', targetId: `t${i}`,
    eyeM: [x, 0, 1.6], targetM: [x, 0, 0.8] }));
  p.exits = [
    { ...template, id: 'wide', sourceId: 'a' },
    { ...template, id: 'center', sourceId: 'a', rect: [-0.25, -1, 0.25, 1] },
    { ...template, id: 'right', sourceId: 'b', rect: [0.5, -1, 1, 1] },
  ];
  const choices = [[0], [0, 1], [0, 2]], sourceFor = [0, 0, 1];
  function brute(ray, exitCaps, sourceCaps) {
    if (ray === 3) return 0;
    let best = brute(ray + 1, exitCaps, sourceCaps);
    for (const e of choices[ray]) {
      const s = sourceFor[e];
      if (exitCaps[e] && sourceCaps[s]) {
        exitCaps[e]--; sourceCaps[s]--;
        best = Math.max(best, 1 + brute(ray + 1, exitCaps, sourceCaps));
        exitCaps[e]++; sourceCaps[s]++;
      }
    }
    return best;
  }
  let cases = 0;
  for (let a = 0; a <= 2; a++) for (let b = 0; b <= 2; b++) for (let c = 0; c <= 2; c++)
    for (let s0 = 0; s0 <= 3; s0++) for (let s1 = 0; s1 <= 3; s1++) {
      const caps = [a, b, c], src = [s0, s1];
      p.exits.forEach((e, i) => { e.sampleRayCapacity = caps[i]; });
      r.sources.forEach((s, i) => { s.sampleRayCapacity = src[i]; });
      const expected = brute(0, caps, src), result = run(r);
      assert.equal(result.bestAllocatedDemandCount, expected);
      assert.equal(result.status, expected === 3 ? 'finite_joint_allocation_found' : 'finite_joint_allocation_impossible');
      cases++;
    }
  assert.equal(cases, 432);
});
void test('fixed six-face one-pose reduction preserves full243x147x18 denominator and original result digest', () => {
  const result = runFixedBaselineReduction();
  assert.equal(result.baselineResultSha256, 'b24881bbcd4262d1dd7b0f7a68de9735552268d12a707001b044fa0ee9f7689b');
  assert.deepEqual(result.results.map(r => r.missingPairs), [0, 708]);
  for (const r of result.results) { assert.equal(r.pairs, 35721); assert.equal(r.rays, 642978); assert.equal(r.posesPerConfiguration, 1); }
  assert.equal(result.physicalAccepted, false); assert.equal(result.fullSceneSimultaneousAccepted, false);
});
