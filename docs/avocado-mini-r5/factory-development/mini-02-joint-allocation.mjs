import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createExitGeometry } from '../../../systems/rock-star-os/targets/avocado-mini/spatial/optical-exits.mjs';
import { createStudyRequest, runOpticalStudy } from './mini-02-optical-study.mjs';

// Finite host research only. Sample slots are hypothetical resources, never optical power.
const GEOMETRY = '58e6a31c54c9295c9d9c59494ba7e8a038d9cafb81ec0fa05b04c9832e876fb8';
const FIXTURE = 'a761c757c9f67921ee1e01d9cf60e99165badb1168ca62b9e00ab45fbeca3602';
const BOUNDS = { min: [-2, -2, 0], max: [2, 2, 3] };
const SCHEMA = 'rockstaros.mini-joint-allocation-study/1';
const check = (v, code) => { if (!v) throw new Error(code); };
const canonical = v => Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : v !== null && typeof v === 'object'
    ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
    : JSON.stringify(v);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = v => hash(canonical(v));
const id = v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(v);
const hex = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const integer = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
const sortId = xs => xs.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
function fields(o, expected) {
  check(o && typeof o === 'object' && !Array.isArray(o)
    && Object.keys(o).sort().join(',') === expected.split(',').sort().join(','), 'JOINT_FIELDS_INVALID');
}
function unique(items, min, max) {
  check(Array.isArray(items) && items.length >= min && items.length <= max, 'JOINT_COLLECTION_LIMIT');
  const ids = new Set();
  for (const item of items) {
    check(item && id(item.id) && !ids.has(item.id), 'JOINT_ID_INVALID_OR_DUPLICATE'); ids.add(item.id);
  }
  return ids;
}
const capacity = v => check(v === null || integer(v, 0, 128), 'JOINT_SAMPLE_CAPACITY_INVALID');
function dependency() {
  check(hash(readFileSync(new URL('../../../systems/rock-star-os/targets/avocado-mini/spatial/optical-exits.mjs', import.meta.url))) === GEOMETRY,
    'JOINT_GEOMETRY_SOURCE_CHANGED');
  check(hash(readFileSync(new URL('./mini-02-optical-study.mjs', import.meta.url))) === '6d93d7a482f19163fea735a826fad70df5fa774dffc602f27c69d9f3d9b5fef9',
    'JOINT_BASELINE_SOURCE_CHANGED');
}

function parse(serialized) {
  check(typeof serialized === 'string' && Buffer.byteLength(serialized) <= 131072, 'JOINT_BOUNDED_JSON_REQUIRED');
  let r;
  try { r = JSON.parse(serialized); } catch { throw new Error('JOINT_JSON_INVALID'); }
  const pending = [[r, 0]]; let nodes = 0;
  while (pending.length) {
    const [v, depth] = pending.pop();
    check(++nodes <= 10000 && depth <= 16, 'JOINT_JSON_TOO_COMPLEX');
    if (typeof v === 'number') check(Number.isFinite(v), 'JOINT_FINITE_JSON_REQUIRED');
    else if (v && typeof v === 'object') for (const child of Object.values(v)) pending.push([child, depth + 1]);
  }
  fields(r, 'schema,studyOnly,assumption,geometrySha256,baselineFixtureSha256,profile,frame,sources,devices,searchLimit');
  check(r.schema === SCHEMA && r.studyOnly === true
    && r.assumption === 'ideal_geometry_hypothetical_sample_slots', 'JOINT_STUDY_SCHEMA_REQUIRED');
  check(r.geometrySha256 === GEOMETRY && r.baselineFixtureSha256 === FIXTURE, 'JOINT_BASELINE_CHANGED');
  check(integer(r.searchLimit, 1, 1024), 'JOINT_SEARCH_LIMIT_INVALID');
  fields(r.profile, 'revision,sha256');
  check(integer(r.profile.revision, 1, 1000000) && hex(r.profile.sha256), 'JOINT_PROFILE_INVALID');
  fields(r.frame, 'profileRevision,profileSha256,sceneSha256,worldFixed,demands,atMs,maxAgeMs,deadlineMs,stopConfirmed');
  check(r.frame.profileRevision === r.profile.revision && r.frame.profileSha256 === r.profile.sha256,
    'JOINT_STALE_PROFILE');
  check(hex(r.frame.sceneSha256) && r.frame.worldFixed === true, 'JOINT_FIXED_WORLD_REQUIRED');
  for (const k of ['atMs', 'maxAgeMs', 'deadlineMs']) check(integer(r.frame[k], 0, Number.MAX_SAFE_INTEGER), 'JOINT_FRAME_TIME_INVALID');
  check(r.frame.stopConfirmed === null || typeof r.frame.stopConfirmed === 'boolean', 'JOINT_STOP_INVALID');
  unique(r.frame.demands, 1, 128);
  for (const d of r.frame.demands) {
    fields(d, 'id,viewerId,targetId,eyeM,targetM');
    check(id(d.viewerId) && id(d.targetId), 'JOINT_DEMAND_LABEL_INVALID');
    for (const p of [d.eyeM, d.targetM]) check(Array.isArray(p) && p.length === 3
      && p.every((v, i) => Number.isFinite(v) && v > BOUNDS.min[i] && v < BOUNDS.max[i]), 'JOINT_ENDPOINT_OUTSIDE_BASELINE');
    check(Math.hypot(...d.eyeM.map((v, i) => v - d.targetM[i])) > 1e-9, 'JOINT_COINCIDENT_RAY');
  }
  // A target ID is a world-space scene point, shared across all pupils/viewers and poses.
  const targets = new Map();
  for (const d of r.frame.demands) {
    check(!targets.has(d.targetId) || canonical(targets.get(d.targetId)) === canonical(d.targetM), 'JOINT_WORLD_TARGET_MOVED');
    targets.set(d.targetId, d.targetM);
  }
  const sourceIds = unique(r.sources, 1, 16);
  for (const s of r.sources) { fields(s, 'id,sampleRayCapacity'); capacity(s.sampleRayCapacity); }
  unique(r.devices, 1, 6); let exitCount = 0;
  for (const device of r.devices) {
    fields(device, 'id,poses'); unique(device.poses, 1, 4);
    for (const pose of device.poses) {
      fields(pose, 'id,sceneSha256,calibrationId,settled,exits,angleModel,observedAtMs,validUntilMs');
      check(pose.sceneSha256 === r.frame.sceneSha256, 'JOINT_STALE_SCENE_COMPENSATION');
      check(pose.calibrationId === null || id(pose.calibrationId), 'JOINT_CALIBRATION_INVALID');
      check(pose.settled === null || typeof pose.settled === 'boolean', 'JOINT_SETTLED_INVALID');
      check(pose.angleModel === null || pose.angleModel === 'ideal_unlimited', 'JOINT_ANGLE_MODEL_UNSUPPORTED');
      for (const k of ['observedAtMs', 'validUntilMs']) check(pose[k] === null || integer(pose[k], 0, Number.MAX_SAFE_INTEGER), 'JOINT_POSE_TIME_INVALID');
      unique(pose.exits, 1, 8); exitCount += pose.exits.length;
      for (const e of pose.exits) {
        fields(e, 'id,face,rect,guardM,sourceId,sampleRayCapacity');
        check(sourceIds.has(e.sourceId), 'JOINT_UNKNOWN_SOURCE'); capacity(e.sampleRayCapacity);
      }
      // Existing geometry validates face, aperture, guard and enclosure bounds.
      createExitGeometry({ bounds: BOUNDS, exits: pose.exits });
      sortId(pose.exits);
    }
    sortId(device.poses);
  }
  check(exitCount <= 96, 'JOINT_TOTAL_EXIT_LIMIT');
  sortId(r.devices); sortId(r.sources); sortId(r.frame.demands);
  return r;
}

// Integral max flow: one demand -> one exit -> its shared source. Residual edges allow
// reassignment; a greedy first available exit would incorrectly reject some valid allocations.
function allocate(demands, activeExits, sources) {
  const graph = [];
  const node = () => { graph.push([]); return graph.length - 1; };
  const start = node(), end = node(), rayNodes = demands.map(node), exitNodes = activeExits.map(node);
  const sourceNodes = new Map(sources.map(s => [s.id, node()]));
  function edge(a, b, cap) {
    const forward = { to: b, rev: graph[b].length, cap };
    const reverse = { to: a, rev: graph[a].length, cap: 0 };
    graph[a].push(forward); graph[b].push(reverse); return forward;
  }
  const links = [];
  demands.forEach((d, i) => {
    edge(start, rayNodes[i], 1);
    activeExits.forEach((e, j) => {
      if (e.reachable.has(d.id)) links.push({ demand: d.id, exit: e, edge: edge(rayNodes[i], exitNodes[j], 1) });
    });
  });
  activeExits.forEach((e, j) => edge(exitNodes[j], sourceNodes.get(e.sourceId), e.sampleRayCapacity));
  sources.forEach(s => edge(sourceNodes.get(s.id), end, s.sampleRayCapacity));
  let flow = 0;
  while (flow < demands.length) {
    const previous = Array(graph.length).fill(null), queue = [start]; previous[start] = [-1, -1];
    for (let q = 0; q < queue.length && previous[end] === null; q++) {
      const u = queue[q];
      graph[u].forEach((e, k) => { if (e.cap > 0 && previous[e.to] === null) { previous[e.to] = [u, k]; queue.push(e.to); } });
    }
    if (previous[end] === null) break;
    for (let v = end; v !== start;) {
      const [u, k] = previous[v], e = graph[u][k]; e.cap--; graph[v][e.rev].cap++; v = u;
    }
    flow++;
  }
  return { flow, assignment: links.filter(l => l.edge.cap === 0).map(l => ({ demandId: l.demand,
    deviceId: l.exit.deviceId, poseId: l.exit.poseId, exitId: l.exit.id, sourceId: l.exit.sourceId })) };
}

/** Input bindings are synthetic study consistency checks, not issuer trust or runtime permission. */
export function runJointAllocation(serialized) {
  dependency();
  const r = parse(serialized);
  const base = { schema: 'rockstaros.mini-joint-allocation-result/1', inputSha256: digest(r),
    baselineFixtureSha256: FIXTURE, geometrySha256: GEOMETRY, demandCount: r.frame.demands.length,
    baselineEyeTargetPairs: 35721, baselinePupilRaysPerPair: 18,
    fullBaselineEvaluated: false, continuousDomainEvaluated: false,
    profileBinding: structuredClone(r.profile), sceneSha256: r.frame.sceneSha256,
    counts: { modeledDevices: r.devices.length, declaredSources: r.sources.length,
      modeledPoses: r.devices.reduce((n, d) => n + d.poses.length, 0),
      exitInstancesAcrossExclusivePoses: r.devices.reduce((n, d) => n + d.poses.reduce((m, p) => m + p.exits.length, 0), 0),
      installedEnclosures: null, installedSources: null, sensors: null, imageLocationPassiveSurfaces: 0,
      measuredSimultaneousViewers: null },
    poseCatalog: r.devices.flatMap(d => d.poses.map(p => ({ deviceId: d.id, poseId: p.id, exits: p.exits.length,
      nominalAreaM2: p.exits.reduce((n, e) => n + (e.rect[2] - e.rect[0]) * (e.rect[3] - e.rect[1]), 0),
      effectiveAreaM2: p.exits.reduce((n, e) => n + (e.rect[2] - e.rect[0] - 2 * e.guardM) * (e.rect[3] - e.rect[1] - 2 * e.guardM), 0) }))),
    acceptance: { physicalVisible: false, lowGlare: false, continuousWholeDomain: false,
      simultaneousPhysicalViewers: false, independentStop: false, manufactured: false, grantsAuthority: false },
    limitations: ['ideal empty-boundary rays only; arbitrary moving interior apertures unsupported',
      'hypothetical integer sample slots are not physical ray throughput, radiometry or brightness',
      'calibration labels and settled flags are synthetic declarations, not measurement receipts',
      'no trajectory/latency/occlusion/wave-optics/thermal/human qualification',
      'finite declared demands only; no denominator reduction or full-scene acceptance'],
  };
  function finish(extra) { dependency(); const v = { ...base, ...extra }; return { ...v, resultSha256: digest(v) }; }
  const unknown = [];
  if (r.frame.stopConfirmed !== true) unknown.push('frame:stop-unconfirmed');
  if (r.frame.atMs >= r.frame.deadlineMs) unknown.push('frame:late');
  for (const s of r.sources) if (s.sampleRayCapacity === null) unknown.push(`source:${s.id}:capacity`);
  for (const d of r.devices) for (const p of d.poses) {
    if (p.calibrationId === null || p.settled !== true) unknown.push(`pose:${d.id}/${p.id}:calibration-or-settled`);
    if (p.angleModel === null) unknown.push(`pose:${d.id}/${p.id}:angle-model`);
    if (p.observedAtMs === null || p.validUntilMs === null || p.observedAtMs > r.frame.atMs
      || r.frame.atMs - p.observedAtMs > r.frame.maxAgeMs || r.frame.atMs >= p.validUntilMs)
      unknown.push(`pose:${d.id}/${p.id}:unknown-stale-or-future`);
    for (const e of p.exits) if (e.sampleRayCapacity === null) unknown.push(`exit:${d.id}/${p.id}/${e.id}:capacity`);
  }
  if (unknown.length) return finish({ status: 'unsupported', unknown, searchedConfigurations: 0,
    searchComplete: false, assignment: null, selectedPoses: null, individuallyReachableCount: null });
  const devices = r.devices.map(d => ({ id: d.id, poses: d.poses.map(p => ({ id: p.id,
    exits: p.exits.map(e => {
      const geometry = createExitGeometry({ bounds: BOUNDS, exits: [e] });
      return { ...e, deviceId: d.id, poseId: p.id,
        reachable: new Set(r.frame.demands.filter(ray => geometry.ray(ray.eyeM, ray.targetM).geometricPathAvailable).map(ray => ray.id)) };
    }) })) }));
  const allExits = devices.flatMap(d => d.poses.flatMap(p => p.exits));
  const unreachable = r.frame.demands.filter(d => !allExits.some(e => e.reachable.has(d.id))).map(d => d.id);
  const relaxed = { individuallyReachableCount: r.frame.demands.length - unreachable.length,
    geometricallyUnreachableDemandIds: unreachable,
    relaxation: 'each demand may choose a different pose; not a simultaneous allocation' };
  const totalConfigurations = devices.reduce((n, d) => n * d.poses.length, 1);
  let searched = 0, solution = null, bestFlow = 0, bestAttempt = null; const selected = [];
  function visit(index) {
    if (solution || searched >= r.searchLimit) return;
    if (index < devices.length) {
      for (const pose of devices[index].poses) { selected.push(pose); visit(index + 1); selected.pop(); }
      return;
    }
    searched++;
    const allocation = allocate(r.frame.demands, selected.flatMap(p => p.exits), r.sources);
    if (bestAttempt === null || allocation.flow > bestFlow) {
      bestFlow = allocation.flow;
      const assigned = new Set(allocation.assignment.map(a => a.demandId));
      bestAttempt = { assignment: allocation.assignment,
        selectedPoses: selected.map((p, i) => ({ deviceId: devices[i].id, poseId: p.id })),
        unassignedDemandIds: r.frame.demands.filter(d => !assigned.has(d.id)).map(d => d.id) };
    }
    if (allocation.flow === r.frame.demands.length) solution = { assignment: allocation.assignment,
      selectedPoses: selected.map((p, i) => ({ deviceId: devices[i].id, poseId: p.id })) };
  }
  visit(0);
  return finish({ ...relaxed, totalConfigurations, searchedConfigurations: searched,
    searchComplete: searched === totalConfigurations, bestAllocatedDemandCount: bestFlow,
    bestAttempt,
    status: solution ? 'finite_joint_allocation_found' : searched === totalConfigurations
      ? 'finite_joint_allocation_impossible' : 'search_incomplete',
    assignment: solution?.assignment ?? null, selectedPoses: solution?.selectedPoses ?? null });
}

/** Minimal synthetic up/down counterexample. Does not claim a real two-ray optical engine. */
export function createJointFixture() {
  const scene = 'b'.repeat(64), profile = 'a'.repeat(64);
  const pose = (id, face) => ({ id, sceneSha256: scene, calibrationId: 'synthetic-calibration', settled: true,
    angleModel: 'ideal_unlimited', observedAtMs: 90, validUntilMs: 200,
    exits: [{ id: 'aperture', face, rect: [-2, -2, 2, 2], guardM: 0, sourceId: 'source', sampleRayCapacity: 2 }] });
  return { schema: SCHEMA, studyOnly: true, assumption: 'ideal_geometry_hypothetical_sample_slots',
    geometrySha256: GEOMETRY, baselineFixtureSha256: FIXTURE, profile: { revision: 1, sha256: profile },
    frame: { profileRevision: 1, profileSha256: profile, sceneSha256: scene, worldFixed: true,
      atMs: 100, maxAgeMs: 20, deadlineMs: 120, stopConfirmed: true,
      demands: [{ id: 'down', viewerId: 'viewer', targetId: 'lower', eyeM: [0, 0, 1.6], targetM: [0, 0, 0.8] },
        { id: 'up', viewerId: 'viewer', targetId: 'upper', eyeM: [0, 0, 1.6], targetM: [0, 0, 2] }] },
    sources: [{ id: 'source', sampleRayCapacity: 2 }],
    devices: [{ id: 'switchable', poses: [pose('floor-pose', 'floor'), pose('ceiling-pose', 'ceiling')] }], searchLimit: 128 };
}

/** Reproduce both fixed six-face cases over the original full denominator. Every pair
 * uses one pose and18 hypothetical slots; different pairs are NOT one simultaneous scene.
 * Kept separate from the bounded finite-scene API so its128-demand limit cannot shrink D. */
export function runFixedBaselineReduction() {
  dependency();
  const reference = runOpticalStudy(JSON.stringify(createStudyRequest()));
  check(reference.resultSha256 === 'b24881bbcd4262d1dd7b0f7a68de9735552268d12a707001b044fa0ee9f7689b', 'JOINT_REFERENCE_RESULT_CHANGED');
  const f = reference.fixture, grid = (n, a, b) => Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));
  const eyes = [], targets = [];
  for (const x of grid(9, -1.5, 1.5)) for (const y of grid(9, -1.5, 1.5)) for (const z of f.eyeHeightsM) eyes.push([x, y, z]);
  for (const x of grid(7, -1.5, 1.5)) for (const y of grid(7, -1.5, 1.5)) for (const z of f.targetHeightsM) targets.push([x, y, z]);
  const cases = reference.results.filter(r => ['six-full-faces-ideal', 'six-full-faces-10mm-guard'].includes(r.id));
  const results = cases.map(c => {
    const geometry = createExitGeometry({ bounds: BOUNDS, exits: c.exits });
    let missingPairs = 0, rays = 0, pairs = 0, firstMissing = null;
    for (const eye of eyes) for (const target of targets) {
      const dx = target[0] - eye[0], dy = target[1] - eye[1], length = Math.hypot(dx, dy);
      const right = length > 1e-9 ? [-dy / length, dx / length, 0] : [1, 0, 0];
      const exits = c.exits.map(e => ({ ...e, deviceId: 'fixed-six-face-model', poseId: 'fixed',
        sourceId: 'hypothetical', sampleRayCapacity: 18, reachable: new Set() }));
      const demands = [];
      for (const side of [-0.032, 0.032]) for (const px of f.pupilOffsetsM) for (const pz of f.pupilOffsetsM) {
        const pupil = eye.map((v, i) => v + right[i] * (side + px) + (i === 2 ? pz : 0));
        const ray = geometry.ray(pupil, target), id = `p${demands.length}`;
        demands.push({ id }); rays++;
        for (const e of exits) if (ray.candidateExitIds.includes(e.id)) e.reachable.add(id);
      }
      const a = allocate(demands, exits, [{ id: 'hypothetical', sampleRayCapacity: 18 }]); pairs++;
      if (a.flow !== 18) { missingPairs++; firstMissing ??= { eyeM: eye, targetM: target, allocated: a.flow }; }
    }
    check(pairs === 35721 && rays === 642978 && missingPairs === c.missingPairs, 'JOINT_FIXED_REDUCTION_MISMATCH');
    return { id: c.id, pairs, rays, missingPairs, firstMissing, posesPerConfiguration: 1 };
  });
  dependency();
  return { baselineResultSha256: reference.resultSha256, baselineFixtureSha256: reference.fixtureSha256,
    results, physicalAccepted: false, fullSceneSimultaneousAccepted: false };
}
