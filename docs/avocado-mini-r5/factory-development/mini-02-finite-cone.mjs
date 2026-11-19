import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createExitGeometry } from '../../../systems/rock-star-os/targets/avocado-mini/spatial/optical-exits.mjs';
import { createJointFixture, runJointAllocation } from './mini-02-joint-allocation.mjs';

// A necessary-condition inspection of one synthetic witness, never a light-output command.
const JOINT = 'a242a99892bd77673da7102c1d02dfbbf6e56c98690d69aa69a42a9183a4ec27';
const GEOMETRY = '58e6a31c54c9295c9d9c59494ba7e8a038d9cafb81ec0fa05b04c9832e876fb8';
const SCHEMA = 'rockstaros.mini-finite-cone-study/1';
const COORDINATES = 'place-world-metres/1';
const CLOCK = 'synthetic-monotonic-ms/1';
const BOUNDS = { min: [-2, -2, 0], max: [2, 2, 3] };
const ANGLE_TOLERANCE_DEG = 1e-7;
// Unit vectors keep products bounded; a generous 64-epsilon radian allowance
// covers normalization/cross/dot/atan2 rounding, including comparison endpoints.
// This only enlarges the unknown band, never the accepted cone.
const ANGLE_ROUNDOFF_GUARD_DEG = 64 * Number.EPSILON * 180 / Math.PI;
const check = (v, code) => { if (!v) throw new Error(code); };
const canonical = v => Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : v !== null && typeof v === 'object'
    ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
    : JSON.stringify(v);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = v => hash(canonical(v));
const id = v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(v);
const hex = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const time = v => Number.isSafeInteger(v) && v >= 0;
const key = v => `${v.deviceId}/${v.poseId}/${v.exitId}`;
const sortBy = (xs, f) => xs.sort((a, b) => f(a) < f(b) ? -1 : f(a) > f(b) ? 1 : 0);
const poseBinding = (deviceId, pose) => digest({ deviceId, poseId: pose.id, sceneSha256: pose.sceneSha256,
  calibrationId: pose.calibrationId, exits: sortBy(structuredClone(pose.exits), e => e.id) });
function fields(v, names) {
  check(v && typeof v === 'object' && !Array.isArray(v)
    && Object.keys(v).sort().join(',') === names.split(',').sort().join(','), 'CONE_FIELDS_INVALID');
}
function dependency() {
  for (const [path, expected] of [
    ['./mini-02-joint-allocation.mjs', JOINT],
    ['../../../systems/rock-star-os/targets/avocado-mini/spatial/optical-exits.mjs', GEOMETRY],
  ]) check(hash(readFileSync(new URL(path, import.meta.url))) === expected, 'CONE_DEPENDENCY_CHANGED');
}
function parse(serialized) {
  check(typeof serialized === 'string' && Buffer.byteLength(serialized) <= 262144, 'CONE_BOUNDED_JSON_REQUIRED');
  let r;
  try { r = JSON.parse(serialized); } catch { throw new Error('CONE_JSON_INVALID'); }
  const pending = [[r, 0]]; let nodes = 0;
  while (pending.length) {
    const [v, depth] = pending.pop();
    check(++nodes <= 20000 && depth <= 18, 'CONE_JSON_TOO_COMPLEX');
    if (typeof v === 'number') check(Number.isFinite(v), 'CONE_FINITE_JSON_REQUIRED');
    else if (v && typeof v === 'object') for (const child of Object.values(v)) pending.push([child, depth + 1]);
  }
  fields(r, 'schema,studyOnly,coordinateFrame,clockDomain,jointRequest,witness,calibrationModels');
  check(r.schema === SCHEMA && r.studyOnly === true, 'CONE_STUDY_SCHEMA_REQUIRED');
  fields(r.witness, 'inputSha256,selectedPoses,assignment');
  check(Array.isArray(r.witness.selectedPoses) && r.witness.selectedPoses.length <= 6
    && Array.isArray(r.witness.assignment) && r.witness.assignment.length <= 128, 'CONE_WITNESS_LIMIT');
  for (const p of r.witness.selectedPoses) {
    fields(p, 'deviceId,poseId');
    check(id(p.deviceId) && id(p.poseId), 'CONE_WITNESS_ID_INVALID');
  }
  for (const a of r.witness.assignment) {
    fields(a, 'demandId,deviceId,poseId,exitId,sourceId');
    check(Object.values(a).every(id), 'CONE_WITNESS_ID_INVALID');
  }
  check(Array.isArray(r.calibrationModels) && r.calibrationModels.length <= 96, 'CONE_MODEL_LIMIT');
  const keys = new Set();
  for (const m of r.calibrationModels) {
    fields(m, 'deviceId,poseId,exitId,sourceId,calibrationId,calibrationSha256,poseBindingSha256,profileRevision,profileSha256,sceneSha256,coordinateFrame,clockDomain,modelKind,axisWorld,halfAngleDeg,angularErrorDeg,observedAtMs,validUntilMs');
    check([m.deviceId, m.poseId, m.exitId, m.sourceId].every(id) && !keys.has(key(m)), 'CONE_MODEL_ID_INVALID_OR_DUPLICATE');
    keys.add(key(m));
  }
  sortBy(r.witness.selectedPoses, p => p.deviceId);
  sortBy(r.witness.assignment, a => a.demandId);
  sortBy(r.calibrationModels, key);
  return r;
}

/** Validate a complete supplied assignment independently of the solver's first result.
 * A rejected witness is NOT proof that all allocations are impossible. */
export function inspectFiniteCone(serialized) {
  dependency();
  const r = parse(serialized);
  let joint;
  try { joint = runJointAllocation(JSON.stringify(r.jointRequest)); }
  catch (error) {
    // These are well-formed but stale bindings; malformed requests still throw closed.
    if (!['JOINT_STALE_PROFILE', 'JOINT_STALE_SCENE_COMPENSATION'].includes(error.message)) throw error;
    return finish(null, 'unavailable', [error.message], []);
  }
  const request = r.jointRequest, frame = request.frame;
  function finish(jointResult, status, reasons, rays) {
    dependency();
    const inputSha256 = digest({ ...r, jointRequest: jointResult ? { inputSha256: jointResult.inputSha256 } : r.jointRequest });
    const result = {
      schema: 'rockstaros.mini-finite-cone-result/1', inputSha256,
      jointInputSha256: jointResult?.inputSha256 ?? null, jointSourceSha256: JOINT, geometrySha256: GEOMETRY,
      status, reasons, rays, declaredDemandCount: jointResult?.demandCount ?? null,
      evaluatedDemandCount: rays.length, allDeclaredDemandsInspected: jointResult ? rays.length === jointResult.demandCount : false,
      upstreamSearchStatus: jointResult?.status ?? null,
      witness: structuredClone(r.witness), counts: jointResult?.counts ?? null,
      allAllocationsEvaluated: false, fullBaselineEvaluated: false, continuousDomainEvaluated: false,
      coordinateFrame: COORDINATES, clockDomain: CLOCK, angleToleranceDeg: ANGLE_TOLERANCE_DEG,
      angleRoundoffGuardDeg: ANGLE_ROUNDOFF_GUARD_DEG,
      acceptance: { physicalVisible: false, lowGlare: false, eyeSafety: false, continuousWholeDomain: false,
        simultaneousPhysicalViewers: false, independentStop: false, manufactured: false,
        measuredCalibration: false, dispatchAllowed: false, grantsAuthority: false },
      limitations: ['synthetic uniform circular cone at ideal enclosure-boundary apertures only',
        'declared angular error must bound axis and ray/coordinate error; unknown is unavailable',
        'digests bind synthetic inputs, not measurement authenticity or issuer authority',
        'no Go horizontal-cone to 3D conversion, real trajectory, occlusion, radiometry or wave optics',
        'all supplied demands retained; full 35721-pair baseline and continuous domain not evaluated',
        'one witness only; rejection never proves absence of a different valid allocation'],
    };
    return { ...result, resultSha256: digest(result) };
  }
  const unavailable = reason => finish(joint, 'unavailable', [reason], []);
  if (r.coordinateFrame !== COORDINATES || r.clockDomain !== CLOCK) return unavailable('coordinate-or-clock-unavailable');
  if (joint.status === 'unsupported') return finish(joint, 'unavailable', joint.unknown, []);
  if (r.witness.inputSha256 !== joint.inputSha256) return unavailable('witness-input-binding-mismatch');

  const selected = new Map(), active = new Map();
  for (const p of r.witness.selectedPoses) {
    const device = request.devices.find(d => d.id === p.deviceId);
    const pose = device?.poses.find(v => v.id === p.poseId);
    if (!pose || selected.has(p.deviceId)) return unavailable('witness-selected-pose-invalid');
    selected.set(p.deviceId, p.poseId);
    for (const exit of pose.exits) active.set(key({ ...p, exitId: exit.id }), { pose, exit });
  }
  if (selected.size !== request.devices.length) return unavailable('witness-one-pose-per-device-required');
  const assigned = new Set(), exitsUsed = new Map(), sourcesUsed = new Map(), rayInputs = [];
  const demands = new Map(frame.demands.map(d => [d.id, d]));
  const sources = new Map(request.sources.map(s => [s.id, s]));
  for (const a of r.witness.assignment) {
    const demand = demands.get(a.demandId), entry = active.get(key(a));
    if (!demand || assigned.has(a.demandId) || !entry || a.sourceId !== entry.exit.sourceId)
      return unavailable('witness-demand-exit-source-invalid');
    assigned.add(a.demandId);
    const geometry = createExitGeometry({ bounds: BOUNDS, exits: [entry.exit] });
    const ray = geometry.ray(demand.eyeM, demand.targetM);
    if (!ray.candidateExitIds.includes(a.exitId)) return unavailable('witness-geometric-path-invalid');
    exitsUsed.set(key(a), (exitsUsed.get(key(a)) ?? 0) + 1);
    sourcesUsed.set(a.sourceId, (sourcesUsed.get(a.sourceId) ?? 0) + 1);
    if (exitsUsed.get(key(a)) > entry.exit.sampleRayCapacity
      || sourcesUsed.get(a.sourceId) > sources.get(a.sourceId).sampleRayCapacity)
      return unavailable('witness-shared-capacity-exceeded');
    rayInputs.push({ a, demand, ...entry, boundaryPointM: ray.boundaryPointM });
  }
  if (assigned.size !== demands.size) return unavailable('witness-complete-demand-set-required');

  const models = new Map(r.calibrationModels.map(m => [key(m), m]));
  if (rayInputs.some(({ a }) => !models.has(key(a)))) return unavailable('calibration-missing');
  // Every supplied model must be internally usable; only assigned rays receive angular verdicts.
  for (const m of r.calibrationModels) {
    const device = request.devices.find(d => d.id === m.deviceId);
    const pose = device?.poses.find(p => p.id === m.poseId);
    const exit = pose?.exits.find(e => e.id === m.exitId);
    if (!exit || m.sourceId !== exit.sourceId) return unavailable('calibration-exit-source-mismatch');
    if (m.modelKind !== 'synthetic-circular-cone' || m.coordinateFrame !== COORDINATES || m.clockDomain !== CLOCK)
      return unavailable('calibration-model-coordinate-or-clock-unavailable');
    if (!hex(m.calibrationSha256) || m.calibrationId !== pose.calibrationId
      || m.poseBindingSha256 !== poseBinding(m.deviceId, pose)
      || m.profileRevision !== request.profile.revision || m.profileSha256 !== request.profile.sha256
      || m.sceneSha256 !== frame.sceneSha256) return unavailable('calibration-binding-mismatch');
    if (!time(m.observedAtMs) || !time(m.validUntilMs) || m.observedAtMs > frame.atMs
      || frame.atMs - m.observedAtMs > frame.maxAgeMs || frame.atMs >= m.validUntilMs)
      return unavailable('calibration-time-unavailable');
    if (!Array.isArray(m.axisWorld) || m.axisWorld.length !== 3 || !m.axisWorld.every(Number.isFinite)
      || Math.abs(Math.hypot(...m.axisWorld) - 1) > 1e-9)
      return unavailable('calibration-unit-axis-unavailable');
    for (const k of ['halfAngleDeg', 'angularErrorDeg']) {
      if (typeof m[k] !== 'number' || !Number.isFinite(m[k]) || m[k] < 0 || m[k] > 90)
        return unavailable('calibration-angular-bound-unavailable');
    }
  }
  const rays = rayInputs.map(({ a, demand, boundaryPointM }) => {
    const m = models.get(key(a));
    // Emission travels from the aperture towards the pupil, opposite the eye->target ray.
    const vector = demand.eyeM.map((v, i) => v - boundaryPointM[i]);
    const length = Math.hypot(...vector), axisLength = Math.hypot(...m.axisWorld);
    const directionWorld = vector.map(v => v / length);
    const axisWorld = m.axisWorld.map(v => v / axisLength);
    const dot = directionWorld.reduce((sum, v, i) => sum + v * axisWorld[i], 0);
    // acos(dot) loses small perpendicular components when dot rounds to +/-1.
    // atan2 retains those components and remains well-conditioned at both poles.
    const cross = [directionWorld[1] * axisWorld[2] - directionWorld[2] * axisWorld[1],
      directionWorld[2] * axisWorld[0] - directionWorld[0] * axisWorld[2],
      directionWorld[0] * axisWorld[1] - directionWorld[1] * axisWorld[0]];
    const angleDeg = Math.atan2(Math.hypot(...cross), dot) * 180 / Math.PI;
    const lowerDeg = Math.max(0, angleDeg - m.angularErrorDeg);
    const upperDeg = Math.min(180, angleDeg + m.angularErrorDeg);
    const margin = ANGLE_TOLERANCE_DEG + ANGLE_ROUNDOFF_GUARD_DEG;
    const status = upperDeg < m.halfAngleDeg - margin ? 'inside'
      : lowerDeg > m.halfAngleDeg + margin ? 'outside' : 'boundary_unknown';
    return { ...a, viewerId: demand.viewerId, targetId: demand.targetId, boundaryPointM, directionWorld,
      angleDeg, lowerDeg, upperDeg, halfAngleDeg: m.halfAngleDeg,
      calibrationSha256: m.calibrationSha256, status };
  });
  const outside = rays.filter(v => v.status === 'outside').map(v => v.demandId);
  const uncertain = rays.filter(v => v.status === 'boundary_unknown').map(v => v.demandId);
  return finish(joint, outside.length ? 'reallocation_required' : uncertain.length ? 'unknown' : 'finite_cone_witness_passed',
    [...outside.map(v => `outside:${v}`), ...uncertain.map(v => `boundary:${v}`)], rays);
}

/** Two synthetic boundary devices, shared source, world-fixed upper/lower targets. */
export function createFiniteConeFixture() {
  const jointRequest = createJointFixture();
  jointRequest.devices = jointRequest.devices[0].poses.map((pose, i) => ({ id: `device${i}`, poses: [pose] }));
  const joint = runJointAllocation(JSON.stringify(jointRequest));
  return { schema: SCHEMA, studyOnly: true, coordinateFrame: COORDINATES, clockDomain: CLOCK,
    jointRequest, witness: { inputSha256: joint.inputSha256, selectedPoses: joint.selectedPoses, assignment: joint.assignment },
    calibrationModels: jointRequest.devices.flatMap(d => d.poses.flatMap(p => p.exits.map(e => ({
      deviceId: d.id, poseId: p.id, exitId: e.id, sourceId: e.sourceId,
      calibrationId: p.calibrationId, calibrationSha256: 'c'.repeat(64),
      poseBindingSha256: poseBinding(d.id, p),
      profileRevision: jointRequest.profile.revision, profileSha256: jointRequest.profile.sha256,
      sceneSha256: jointRequest.frame.sceneSha256, coordinateFrame: COORDINATES, clockDomain: CLOCK,
      modelKind: 'synthetic-circular-cone', axisWorld: e.face === 'floor' ? [0, 0, 1] : [0, 0, -1],
      halfAngleDeg: 45, angularErrorDeg: 0.1, observedAtMs: 90, validUntilMs: 200,
    })))) };
}
