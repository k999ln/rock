import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePlaceProfile } from '../systems/rock-star-os/targets/avocado-mini/spatial/place-profile.mjs';
import { createExitGeometry } from '../systems/rock-star-os/targets/avocado-mini/spatial/optical-exits.mjs';

const box = (min, max) => ({ min, max });
function fixture() {
  return {
    schema: 'rockstaros.mini-place-profile-local/1', placeId: 'synthetic-place', revision: 1,
    requirements: {
      domainM: box([-2, -2, 0], [2, 2, 3]), eyeDomainM: box([-1.5, -1.5, 1.2], [1.5, 1.5, 1.9]),
      eyeOrientationRad: box([-Math.PI, -Math.PI, -Math.PI], [Math.PI, Math.PI, Math.PI]),
      targetDomainM: box([-1.5, -1.5, 0.8], [1.5, 1.5, 2]),
      targetSizeM: box([0.02, 0.02, 0.02], [1, 1, 1]),
      targetOrientationRad: box([-Math.PI, -Math.PI, -Math.PI], [Math.PI, Math.PI, Math.PI]),
      ipdM: [0.06, 0.07], pupilDiameterM: [0.002, 0.006], concurrentPeople: 2,
      maxActiveSources: 4, maxOpticalExits: 6,
      occluders: [{ id: 'desk', kind: 'furniture', boundsM: box([-1, -1, 0], [0, 0, 0.7]) }],
      illuminationLux: [10, 500], movementPathsM: [[[-1, -1, 0], [1, 1, 0]]],
      installationDomainsM: [box([-2, -2, 0], [2, 2, 3])],
      noImageLocationPlateOrMembrane: true, bareEye: true, wholeDomain: true, lowGlareRequired: true,
    },
    counts: { activeSources: 1, opticalExits: 6, sensors: 2, imageLocationPassiveSurfaces: 0 },
    observationRegions: [{ id: 'unmeasured', boundsM: box([-2, -2, 0], [2, 2, 3]), status: 'unknown', reason: 'No calibrated sensor measurement' }],
    inputRegions: [],
    necessaryCondition: { state: 'not_tested', samplePairs: 0, missingPairs: 0, assumptions: [], exclusions: [], generatorRevision: 'synthetic-only/1' },
  };
}
const validate = value => validatePlaceProfile(value, { expectedRevision: 1 });
function rejectsChange(change, code) {
  const input = fixture(); change(input); assert.throws(() => validate(input), code);
}

void test('roundtrip, canonical digest and independent source/exit/sensor/passive counts', () => {
  const input = fixture(); const result = validate(input);
  assert.deepEqual(result.profile, input);
  const reordered = Object.fromEntries(Object.entries(input).reverse());
  assert.equal(validate(reordered).sha256, result.sha256);
  assert.equal(validate(JSON.parse(JSON.stringify(input))).sha256, result.sha256);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.profile.counts, { activeSources: 1, opticalExits: 6, sensors: 2, imageLocationPassiveSurfaces: 0 });
  assert.equal(validatePlaceProfile(input, { expectedRevision: 1, expectedHash: result.sha256 }).sha256, result.sha256);
  input.requirements.targetSizeM = box([0.02, 0.02, 0.02], [0.02, 0.02, 0.02]);
  assert.equal(validate(input).physicalAccepted, false);
});
void test('snapshot is detached and deeply frozen; rejected edits preserve old profile', () => {
  const input = fixture(); const old = JSON.stringify(input); const result = validate(input);
  assert.throws(() => { result.profile.requirements.domainM.min[0] = 0; }, TypeError);
  const bad = structuredClone(input); bad.requirements.domainM.min[0] = 10;
  assert.throws(() => validate(bad));
  assert.equal(JSON.stringify(input), old);
  input.counts.sensors = 3;
  assert.equal(result.profile.counts.sensors, 2);
});
void test('revision chain requires caller-held revision and exact previous digest', () => {
  const input = fixture(); const first = validate(input);
  const next = structuredClone(input); next.revision = 2; next.counts.sensors = 3;
  const options = { expectedRevision: 2, previousProfile: input, previousHash: first.sha256 };
  assert.equal(validatePlaceProfile(next, options).profile.revision, 2);
  assert.throws(() => validatePlaceProfile(next, { expectedRevision: 1 }), /STALE_REVISION/);
  assert.throws(() => validatePlaceProfile(next, { expectedRevision: 2 }), /PREVIOUS_REQUIRED/);
  assert.throws(() => validatePlaceProfile(next, { ...options, previousHash: '0'.repeat(64) }), /PREVIOUS_HASH_MISMATCH/);
  const third = structuredClone(next); third.revision = 3;
  assert.throws(() => validatePlaceProfile(third, { ...options, expectedRevision: 3 }), /REVISION_CHAIN_INVALID/);
  assert.throws(() => validatePlaceProfile(input, { expectedRevision: 1, expectedHash: '0'.repeat(64) }), /HASH_MISMATCH/);
  assert.throws(() => validatePlaceProfile(input), /EXPECTATION_REQUIRED/);
});
void test('no requirement shrink or silent changes across revisions, even lighting or people', () => {
  const input = fixture(); const first = validate(input);
  const changes = [
    p => {
      p.requirements.domainM.min[0] = -1.8;
      p.requirements.installationDomainsM[0].min[0] = -1.8;
      p.observationRegions[0].boundsM.min[0] = -1.8;
    },
    p => { p.requirements.eyeDomainM.max[2] = 1.8; },
    p => { p.requirements.targetSizeM.max[0] = 0.03; },
    p => { p.requirements.concurrentPeople = 1; },
    p => { p.requirements.illuminationLux[1] = 100; },
    p => { p.requirements.occluders = []; },
    p => { p.requirements.maxOpticalExits = 100; },
  ];
  for (const change of changes) {
    const next = structuredClone(input); next.revision = 2; change(next);
    assert.throws(() => validatePlaceProfile(next, { expectedRevision: 2, previousProfile: input, previousHash: first.sha256 }), /REQUIREMENTS_CHANGED/);
  }
  assert.equal(validate(input).sha256, first.sha256);
});
void test('required geometry, finite numbers, orientation and containment are strict', () => {
  for (const field of Object.keys(fixture().requirements)) rejectsChange(p => { delete p.requirements[field]; }, /FIELDS_INVALID/);
  rejectsChange(p => { p.requirements.domainM.min[0] = NaN; }, /JSON_REQUIRED/);
  rejectsChange(p => { p.requirements.domainM.max[0] = -2; }, /BOUNDS_INVALID/);
  rejectsChange(p => { p.requirements.eyeDomainM.min[0] = -3; }, /DOMAIN_INVALID/);
  rejectsChange(p => { p.requirements.eyeOrientationRad.max[0] = 4; }, /ORIENTATION_INVALID/);
  rejectsChange(p => { p.requirements.pupilDiameterM = [0.006, 0.002]; }, /RANGE_INVALID/);
  rejectsChange(p => { p.requirements.movementPathsM[0][1][0] = 9; }, /PATH_INVALID/);
});
void test('unknown fields and authority/status promotion fail closed', () => {
  rejectsChange(p => { p.grant = 'approved'; }, /FIELDS_INVALID/);
  rejectsChange(p => { p.requirements.futureFlag = true; }, /FIELDS_INVALID/);
  rejectsChange(p => { p.physicalAccepted = true; }, /FIELDS_INVALID/);
  rejectsChange(p => { p.necessaryCondition.state = 'qualified'; }, /SAMPLE_INVALID/);
  rejectsChange(p => { p.observationRegions[0].status = 'measured_available'; }, /REGION_INVALID/);
  rejectsChange(p => { p.observationRegions[0].available = true; }, /FIELDS_INVALID/);
  rejectsChange(p => { p.observationRegions[0].reason = ''; }, /REGION_INVALID/);
});
void test('JSON input is bounded and cannot hide unhashable values or accessors', () => {
  rejectsChange(p => { p.counts.sensors = undefined; }, /JSON_REQUIRED/);
  rejectsChange(p => { p.counts.sensors = 1n; }, /JSON_REQUIRED/);
  rejectsChange(p => { p.observationRegions = Array(1); }, /JSON_REQUIRED/);
  rejectsChange(p => { p.self = p; }, /TOO_LARGE/);
  rejectsChange(p => { p.extra = new Date(); }, /JSON_REQUIRED/);
  let called = false; const input = fixture();
  Object.defineProperty(input, 'hidden', { enumerable: true, get() { called = true; return 1; } });
  assert.throws(() => validate(input), /JSON_REQUIRED/); assert.equal(called, false);
});
void test('plate/membrane, relaxed glare or excess part counts are rejected', () => {
  for (const field of ['noImageLocationPlateOrMembrane', 'bareEye', 'wholeDomain', 'lowGlareRequired'])
    rejectsChange(p => { p.requirements[field] = false; }, /REQUIREMENTS_RELAXED/);
  rejectsChange(p => { p.counts.imageLocationPassiveSurfaces = 1; }, /PASSIVE_SURFACE_FORBIDDEN/);
  rejectsChange(p => { p.counts.activeSources = 5; }, /TOO_MANY_DISPLAY_PARTS/);
  rejectsChange(p => { p.counts.opticalExits = 7; }, /TOO_MANY_DISPLAY_PARTS/);
  rejectsChange(p => { p.counts.sensors = -1; }, /COUNTS_INVALID/);
});
void test('unknown/unlisted observation and input never imply availability or change D', () => {
  const input = fixture(); const domain = structuredClone(input.requirements.domainM);
  const result = validate(input);
  assert.deepEqual(result.profile.requirements.domainM, domain);
  assert.deepEqual(result.availability, { observation: false, input: false, visibility: false, unlistedRegions: false });
  const unknown = structuredClone(input.observationRegions[0]); unknown.status = 'unavailable';
  input.inputRegions.push(unknown);
  assert.equal(validate(input).availability.input, false);
});
void test('sample success and failure remain separate from bench, physical and comfort', () => {
  for (const [state, misses] of [['sample_passed', 0], ['sample_failed', 708]]) {
    const input = fixture();
    input.necessaryCondition = { state, samplePairs: 35721, missingPairs: misses,
      assumptions: ['ideal emitting area 80m2; not six small heads'], exclusions: ['real optics, occlusion, glare'], generatorRevision: 'synthetic-six-exits/1' };
    const result = validate(input);
    assert.deepEqual(result.stages, { requirements: 'fixed_local_input', necessaryCondition: state, bench: 'pending', physical: 'pending', comfort: 'pending' });
    for (const flag of ['wholeRangeAccepted', 'physicalAccepted', 'comfortAccepted', 'grantsAuthority']) assert.equal(result[flag], false);
  }
  rejectsChange(p => { p.necessaryCondition.state = 'sample_passed'; }, /SAMPLE_STATE_INVALID/);
});
void test('existing optical geometry: a seam ray passes ideal area but fails a 10mm guard', () => {
  const bounds = box([-2, -2, 0], [2, 2, 3]);
  const axes = { west: 0, east: 0, south: 1, north: 1, floor: 2, ceiling: 2 };
  function exits(guardM) {
    return Object.entries(axes).map(([face, axis]) => {
      const t = [0, 1, 2].filter(a => a !== axis);
      return { id: face, face, rect: [bounds.min[t[0]], bounds.min[t[1]], bounds.max[t[0]], bounds.max[t[1]]], guardM };
    });
  }
  const ideal = createExitGeometry({ bounds, exits: exits(0) }).ray([0, 0, 1.5], [1, 1, 1.5]);
  const guard = createExitGeometry({ bounds, exits: exits(0.01) }).ray([0, 0, 1.5], [1, 1, 1.5]);
  assert.equal(ideal.geometricPathAvailable, true); assert.equal(guard.geometricPathAvailable, false);
  assert.equal(ideal.physicalVisible, false); assert.equal(guard.physicalVisible, false);
});
