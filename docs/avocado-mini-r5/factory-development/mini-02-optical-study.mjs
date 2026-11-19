import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExitGeometry } from '../../../systems/rock-star-os/targets/avocado-mini/spatial/optical-exits.mjs';

// Host study only. The registered aperture supplies an ideal geometric ray, not light or permission.
export const PINNED_GEOMETRY_SHA256 = '58e6a31c54c9295c9d9c59494ba7e8a038d9cafb81ec0fa05b04c9832e876fb8';
const canonical = v => Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : v !== null && typeof v === 'object'
    ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
    : JSON.stringify(v);
const sha256 = v => createHash('sha256').update(v).digest('hex');
const digest = v => sha256(canonical(v));
const check = (v, code) => { if (!v) throw new Error(code); };
const geometryUrl = new URL('../../../systems/rock-star-os/targets/avocado-mini/spatial/optical-exits.mjs', import.meta.url);
const verifyGeometrySource = () => check(sha256(readFileSync(geometryUrl)) === PINNED_GEOMETRY_SHA256, 'STUDY_GEOMETRY_SOURCE_CHANGED');
const axis = { west: 0, east: 0, south: 1, north: 1, floor: 2, ceiling: 2 };
const bounds = { min: [-2, -2, 0], max: [2, 2, 3] };
const grid = (n, a, b) => Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));
const fixture = {
  id: 'mini-v09-six-exits-243x147x18/1', enclosureM: bounds,
  servicePlanM: [3, 3], eyeXY: { countPerAxis: 9, minM: -1.5, maxM: 1.5 }, eyeHeightsM: [1.2, 1.6, 1.9],
  targetXY: { countPerAxis: 7, minM: -1.5, maxM: 1.5 }, targetHeightsM: [0.8, 1.4, 2],
  interpupillaryDistanceM: 0.064, pupilOffsetsM: [-0.002, 0, 0.002],
  pupilOrientation: 'horizontal perpendicular to target-eye XY; [1,0,0] for vertical alignment',
  targetExtentMode: 'sampled points only; not a whole extended scene',
  viewerPositionsAreSimultaneous: false, requiredSimultaneousViewers: null,
  imageLocationPassiveSurfaces: 0, opticalAngleAndFocus: 'ideal unlimited at every exit position',
  illuminationLux: null, permittedLuminance: null, placementErrorM: null, trackingLatencyMs: null,
  physicalEnclosureVolumeM3: null, occlusion: 'empty-path optimistic bound; actual body/furniture unmeasured',
  requirements: ['no image-location plate/membrane/scattering surface', 'few display parts',
    'whole requested volume including above/below', 'fixed world scene', 'low glare'],
};

function fixedCandidate(id, count, widthM, guardM, extra = {}) {
  return { id, model: 'fixed-boundary-apertures', faces: Object.keys(axis).slice(0, count), widthM, guardM,
    physicalEnclosures: null, activeImageSources: null, sensors: null, imageLocationPassiveSurfaces: 0,
    modeledPoseCount: 1, measuredSimultaneousViewers: null, steering: 'ideal unlimited', ...extra };
}
const candidates = [
  fixedCandidate('four-sides-300mm', 4, 0.3, 0),
  fixedCandidate('six-faces-300mm', 6, 0.3, 0),
  fixedCandidate('six-faces-1200mm', 6, 1.2, 0),
  fixedCandidate('four-full-faces', 4, 4, 0),
  fixedCandidate('six-full-faces-ideal', 6, 4, 0),
  fixedCandidate('six-full-faces-10mm-guard', 6, 4, 0.01),
  fixedCandidate('six-full-faces-30mm-guard', 6, 4, 0.03,
    { sensitivityOnly: '10mm frame plus hypothetical20mm aperture erosion; not a measured tracking tolerance' }),
  { id: 'relocatable-or-switched-exits', model: 'unsupported', physicalEnclosures: null, activeImageSources: null,
    opticalExitCount: null, sensors: null, imageLocationPassiveSurfaces: 0, modeledPoseCount: null,
    measuredSimultaneousViewers: null, reasons: ['no world-space exit trajectories or reachable pose set',
      'no per-frame joint allocation for both pupils, all scene points and viewers',
      'no latency/settling/duty-cycle/radiometry/independent-stop measurements'] },
  { id: 'existing-go-leairr-relay', model: 'unsupported', physicalEnclosures: null, activeImageSources: 1,
    opticalExitCount: null, sensors: null, imageLocationPassiveSurfaces: 0, modeledPoseCount: null,
    measuredSimultaneousViewers: null, reasons: ['existing E1 prescription is not a calibrated room-boundary ray generator',
      'vertical cone, effective aperture, source-relay mapping and simultaneous scene unqualified',
      'brightness/glare, occlusion, power/thermal and independent optical cutoff unaccepted'] },
];
const exclusions = ['finite pupil points and eye/target grid only', 'no occlusion or physical optical engine',
  'no wave optics/scattering/etendue/radiometry/aberration qualification',
  'no simultaneous scene/viewer or motion/latency qualification', 'no safety/comfort/electrical/thermal qualification'];

/** JSON data is intentionally the API boundary: no JS getters, prototypes or toJSON callbacks. */
export function createStudyRequest() {
  return structuredClone({ schema: 'rockstaros.mini-optical-study-request/1',
    geometrySha256: PINNED_GEOMETRY_SHA256, fixture, candidates });
}

function parseRequest(serialized) {
  check(typeof serialized === 'string' && Buffer.byteLength(serialized) <= 32768, 'STUDY_BOUNDED_JSON_REQUIRED');
  let request;
  try { request = JSON.parse(serialized); } catch { throw new Error('STUDY_JSON_INVALID'); }
  const pending = [[request, 0]]; let nodes = 0;
  while (pending.length) {
    const [value, depth] = pending.pop();
    check(++nodes <= 2000 && depth <= 20, 'STUDY_JSON_TOO_COMPLEX');
    if (typeof value === 'number') check(Number.isFinite(value), 'STUDY_FINITE_JSON_REQUIRED');
    else if (value && typeof value === 'object') for (const child of Object.values(value)) pending.push([child, depth + 1]);
  }
  check(request && !Array.isArray(request) && typeof request === 'object'
    && Object.keys(request).sort().join(',') === 'candidates,fixture,geometrySha256,schema', 'STUDY_FIELDS_INVALID');
  check(request.schema === 'rockstaros.mini-optical-study-request/1', 'STUDY_SCHEMA_UNSUPPORTED');
  check(request.geometrySha256 === PINNED_GEOMETRY_SHA256, 'STUDY_GEOMETRY_REVISION_MISMATCH');
  check(canonical(request.fixture) === canonical(fixture), 'STUDY_DOMAIN_OR_ASSUMPTIONS_CHANGED');
  check(Array.isArray(request.candidates) && request.candidates.length === candidates.length, 'STUDY_CANDIDATES_MISSING');
  const seen = new Set();
  for (const candidate of request.candidates) {
    check(candidate && typeof candidate === 'object' && !Array.isArray(candidate), 'STUDY_CANDIDATE_INVALID');
    const reference = candidates.find(c => c.id === candidate.id);
    check(reference && !seen.has(candidate.id), 'STUDY_CANDIDATE_UNKNOWN_OR_DUPLICATE');
    check(canonical(candidate) === canonical(reference), 'STUDY_CANDIDATE_CHANGED');
    seen.add(candidate.id);
  }
  // Candidate order is not a physical variable. Always evaluate the same ordered catalog.
  return createStudyRequest();
}

function exitsFor(candidate) {
  return candidate.faces.map(face => {
    const t = [0, 1, 2].filter(i => i !== axis[face]);
    const center = t.map(i => (bounds.min[i] + bounds.max[i]) / 2);
    const half = t.map(i => Math.min(candidate.widthM / 2, (bounds.max[i] - bounds.min[i]) / 2));
    return { id: face, face, rect: [center[0] - half[0], center[1] - half[1], center[0] + half[0], center[1] + half[1]], guardM: candidate.guardM };
  });
}
const acceptance = () => ({ continuousWholeDomain: false, physicalVisible: false, simultaneousViewers: false,
  lowGlare: false, independentStop: false, manufactured: false, grantsAuthority: false });

function evaluate(candidate, eyes, targets, fixtureSha256) {
  const counts = { physicalEnclosures: candidate.physicalEnclosures, activeImageSources: candidate.activeImageSources,
    opticalExits: candidate.faces?.length ?? candidate.opticalExitCount, sensors: candidate.sensors,
    imageLocationPassiveSurfaces: candidate.imageLocationPassiveSurfaces, modeledPoseCount: candidate.modeledPoseCount,
    sampledViewerPositions: eyes.length, measuredSimultaneousViewers: candidate.measuredSimultaneousViewers };
  const common = { id: candidate.id, candidateSha256: digest(candidate), fixtureSha256, counts,
    requiredEyeTargetPairs: eyes.length * targets.length, requiredPupilRaysPerPair: 18,
    acceptance: acceptance() };
  if (candidate.model === 'unsupported') return { ...common, status: 'unsupported', reasons: candidate.reasons,
    evaluatedPairs: 0, missingPairs: null, nominalApertureAreaM2: null, effectiveApertureAreaM2: null };
  const exits = exitsFor(candidate), geometry = createExitGeometry({ bounds, exits });
  let missingPairs = 0, firstMissing = null, pupilRays = 0;
  for (const eye of eyes) for (const target of targets) {
    const dx = target[0] - eye[0], dy = target[1] - eye[1], length = Math.hypot(dx, dy);
    const right = length > 1e-9 ? [-dy / length, dx / length, 0] : [1, 0, 0];
    let pass = true;
    for (const side of [-0.032, 0.032]) for (const px of fixture.pupilOffsetsM) for (const pz of fixture.pupilOffsetsM) {
      const pupil = eye.map((v, i) => v + right[i] * (side + px) + (i === 2 ? pz : 0));
      const ray = geometry.ray(pupil, target); pupilRays++;
      if (!ray.geometricPathAvailable) {
        pass = false;
        firstMissing ??= { eyeCenterM: eye, targetM: target, pupilM: pupil,
          boundaryPointM: ray.boundaryPointM, boundaryFaces: ray.boundaryFaces };
      }
    }
    if (!pass) missingPairs++;
  }
  return { ...common, status: missingPairs ? 'necessary_condition_failed' : 'sampled_necessary_condition_passed',
    evaluatedPairs: eyes.length * targets.length, pupilRays, missingPairs, firstMissing,
    nominalApertureAreaM2: exits.reduce((sum, e) => sum + (e.rect[2] - e.rect[0]) * (e.rect[3] - e.rect[1]), 0),
    effectiveApertureAreaM2: exits.reduce((sum, e) => sum + (e.rect[2] - e.rect[0] - 2 * e.guardM) * (e.rect[3] - e.rect[1] - 2 * e.guardM), 0),
    opticalSteering: 'already unlimited in this necessary condition; does not add exit positions', exits };
}

function boundaryDiagnostics() {
  const configurations = candidates.filter(c => ['four-full-faces', 'six-full-faces-ideal', 'six-full-faces-10mm-guard'].includes(c.id));
  return configurations.map(c => {
    const geometry = createExitGeometry({ bounds, exits: exitsFor(c) });
    const eye = [0, 0, 1.6]; let missed = 0, first = null, last = null;
    for (const offset of grid(201, -0.025, 0.025)) {
      const target = [1, 1 + offset, 1.4];
      if (!geometry.ray(eye, target).geometricPathAvailable) { missed++; first ??= offset; last = offset; }
    }
    return { candidateId: c.id, supplementaryOnly: true, pupilModel: 'one center ray, not binocular acceptance',
      vertical: { belowAvailable: geometry.ray(eye, [0, 0, 0.8]).geometricPathAvailable,
        aboveAvailable: geometry.ray(eye, [0, 0, 2]).geometricPathAvailable },
      seamSweep: { eyeM: eye, targetBaseM: [1, 1, 1.4], offsetAxis: 'y', offsetRangeM: [-0.025, 0.025],
        sampleCount: 201, missedSamples: missed, firstMissingOffsetM: first, lastMissingOffsetM: last },
      continuousProof: false, physicalAccepted: false };
  });
}

/** Same fixed fixture for every candidate. Unknown physical feasibility is never encoded as zero loss. */
export function runOpticalStudy(serializedRequest) {
  const input = parseRequest(serializedRequest), eyes = [], targets = [];
  verifyGeometrySource();
  for (const x of grid(9, -1.5, 1.5)) for (const y of grid(9, -1.5, 1.5)) for (const z of fixture.eyeHeightsM) eyes.push([x, y, z]);
  for (const x of grid(7, -1.5, 1.5)) for (const y of grid(7, -1.5, 1.5)) for (const z of fixture.targetHeightsM) targets.push([x, y, z]);
  const fixtureSha256 = digest(fixture);
  const result = { schema: 'rockstaros.mini-optical-study-result/1', inputSha256: digest(input), fixtureSha256,
    geometrySha256: PINNED_GEOMETRY_SHA256, fixture: structuredClone(fixture),
    sampleCounts: { eyes: eyes.length, targets: targets.length, eyeTargetPairs: eyes.length * targets.length, pupilRaysPerPair: 18 },
    results: input.candidates.map(c => evaluate(c, eyes, targets, fixtureSha256)), diagnostics: boundaryDiagnostics(),
    exclusions: [...exclusions], physicalCandidateSelected: false, wholeUnitAccepted: false, acceptance: acceptance() };
  verifyGeometrySource();
  return { ...result, resultSha256: digest(result) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  check(process.argv.length <= 3 && [undefined, '--json', '--summary'].includes(process.argv[2]), 'STUDY_CLI_ARGUMENT_UNSUPPORTED');
  const result = runOpticalStudy(JSON.stringify(createStudyRequest()));
  const output = process.argv[2] === '--json' ? result : {
    inputSha256: result.inputSha256, resultSha256: result.resultSha256, sampleCounts: result.sampleCounts,
    results: result.results.map(r => ({ id: r.id, status: r.status, missingPairs: r.missingPairs,
      nominalAreaM2: r.nominalApertureAreaM2, effectiveAreaM2: r.effectiveApertureAreaM2 })),
    diagnostics: result.diagnostics, physicalCandidateSelected: false,
  };
  console.log(JSON.stringify(output, null, 2));
}
