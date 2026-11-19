import { createHash } from 'node:crypto';

// Local, synthetic planning input only. No storage, grants, device I/O or optical qualification.
const schema = 'rockstaros.mini-place-profile-local/1';
const check = (ok, code) => { if (!ok) throw new Error(code); };
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value !== null && typeof value === 'object'
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, required) => {
  check(object(value) && Object.keys(value).length === required.length
    && required.every(key => Object.hasOwn(value, key)), 'PROFILE_FIELDS_INVALID');
};
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 240;
const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const list = (value, min = 0) => check(Array.isArray(value) && value.length >= min && value.length <= 128, 'PROFILE_LIST_INVALID');
const range = (value, min, max) => check(Array.isArray(value) && value.length === 2
  && value.every(Number.isFinite) && value[0] >= min && value[1] <= max && value[0] <= value[1], 'PROFILE_RANGE_INVALID');
function bounds(value) {
  keys(value, ['min', 'max']);
  check(vector(value.min) && vector(value.max) && value.min.every((n, i) => n < value.max[i]), 'PROFILE_BOUNDS_INVALID');
}
const contained = (inner, outer) => inner.min.every((n, i) => n >= outer.min[i] && inner.max[i] <= outer.max[i]);
const pointInside = (point, box) => vector(point) && point.every((n, i) => n >= box.min[i] && n <= box.max[i]);
function freeze(value) {
  if (value !== null && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
// Reject non-JSON values before hashing: no silently dropped fields, getters or sparse arrays.
function jsonCopy(input) {
  let nodes = 0;
  const visit = (value, depth) => {
    check(++nodes <= 20000 && depth <= 24, 'PROFILE_TOO_LARGE');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number') { check(Number.isFinite(value), 'PROFILE_JSON_REQUIRED'); return; }
    check(object(value) || Array.isArray(value), 'PROFILE_JSON_REQUIRED');
    check(Object.getPrototypeOf(value) === (Array.isArray(value) ? Array.prototype : Object.prototype), 'PROFILE_JSON_REQUIRED');
    const names = Reflect.ownKeys(value).filter(key => !(Array.isArray(value) && key === 'length'));
    check(names.every(key => typeof key === 'string') && (!Array.isArray(value)
      || (names.length === value.length && names.every((key, i) => key === String(i)))), 'PROFILE_JSON_REQUIRED');
    for (const key of names) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      check(descriptor.enumerable && Object.hasOwn(descriptor, 'value'), 'PROFILE_JSON_REQUIRED');
      visit(descriptor.value, depth + 1);
    }
  };
  visit(input, 0);
  const encoded = canonical(input);
  check(Buffer.byteLength(encoded) <= 262144, 'PROFILE_TOO_LARGE');
  return JSON.parse(encoded);
}
function inspect(profile) {
  keys(profile, ['schema', 'placeId', 'revision', 'requirements', 'counts', 'observationRegions', 'inputRegions', 'necessaryCondition']);
  check(profile.schema === schema && text(profile.placeId) && integer(profile.revision, 1, Number.MAX_SAFE_INTEGER), 'PROFILE_ID_OR_REVISION_INVALID');
  const r = profile.requirements;
  keys(r, ['domainM', 'eyeDomainM', 'eyeOrientationRad', 'targetDomainM', 'targetSizeM', 'targetOrientationRad',
    'ipdM', 'pupilDiameterM', 'concurrentPeople', 'maxActiveSources', 'maxOpticalExits', 'occluders', 'illuminationLux',
    'movementPathsM', 'installationDomainsM', 'noImageLocationPlateOrMembrane', 'bareEye', 'wholeDomain', 'lowGlareRequired']);
  for (const box of [r.domainM, r.eyeDomainM, r.targetDomainM]) bounds(box);
  check(contained(r.eyeDomainM, r.domainM) && contained(r.targetDomainM, r.domainM), 'PROFILE_DOMAIN_INVALID');
  for (const orientation of [r.eyeOrientationRad, r.targetOrientationRad]) {
    keys(orientation, ['min', 'max']);
    check(vector(orientation.min) && vector(orientation.max)
      && orientation.min.every((n, i) => n >= -Math.PI && orientation.max[i] <= Math.PI && n <= orientation.max[i]), 'PROFILE_ORIENTATION_INVALID');
  }
  keys(r.targetSizeM, ['min', 'max']);
  check(vector(r.targetSizeM.min) && vector(r.targetSizeM.max)
    && r.targetSizeM.min.every((n, i) => n > 0 && n <= r.targetSizeM.max[i]), 'PROFILE_TARGET_SIZE_INVALID');
  range(r.ipdM, 0.001, 1); range(r.pupilDiameterM, 0.0001, 0.1); range(r.illuminationLux, 0, 1000000);
  check(integer(r.concurrentPeople, 1, 128) && integer(r.maxActiveSources, 1, 128)
    && integer(r.maxOpticalExits, 1, 128), 'PROFILE_COUNTS_INVALID');
  check(r.noImageLocationPlateOrMembrane === true && r.bareEye === true
    && r.wholeDomain === true && r.lowGlareRequired === true, 'PROFILE_REQUIREMENTS_RELAXED');
  list(r.occluders);
  const ids = new Set();
  for (const item of r.occluders) {
    keys(item, ['id', 'kind', 'boundsM']); bounds(item.boundsM);
    check(text(item.id) && !ids.has(item.id) && ['furniture', 'body', 'wall'].includes(item.kind)
      && contained(item.boundsM, r.domainM), 'PROFILE_OCCLUDER_INVALID'); ids.add(item.id);
  }
  list(r.movementPathsM, 1);
  for (const path of r.movementPathsM) {
    list(path, 2); check(path.every(point => pointInside(point, r.domainM)), 'PROFILE_PATH_INVALID');
  }
  list(r.installationDomainsM, 1);
  for (const box of r.installationDomainsM) { bounds(box); check(contained(box, r.domainM), 'PROFILE_INSTALLATION_INVALID'); }
  keys(profile.counts, ['activeSources', 'opticalExits', 'sensors', 'imageLocationPassiveSurfaces']);
  check(Object.values(profile.counts).every(n => integer(n, 0, 128)), 'PROFILE_COUNTS_INVALID');
  check(profile.counts.imageLocationPassiveSurfaces === 0, 'PROFILE_PASSIVE_SURFACE_FORBIDDEN');
  check(profile.counts.activeSources <= r.maxActiveSources && profile.counts.opticalExits <= r.maxOpticalExits, 'PROFILE_TOO_MANY_DISPLAY_PARTS');
  for (const regions of [profile.observationRegions, profile.inputRegions]) {
    list(regions); const regionIds = new Set();
    for (const region of regions) {
      keys(region, ['id', 'boundsM', 'status', 'reason']); bounds(region.boundsM);
      check(text(region.id) && !regionIds.has(region.id) && contained(region.boundsM, r.domainM)
        && ['unknown', 'unavailable'].includes(region.status) && text(region.reason), 'PROFILE_REGION_INVALID');
      regionIds.add(region.id);
    }
  }
  const n = profile.necessaryCondition;
  keys(n, ['state', 'samplePairs', 'missingPairs', 'assumptions', 'exclusions', 'generatorRevision']);
  check(['not_tested', 'sample_passed', 'sample_failed'].includes(n.state)
    && integer(n.samplePairs, 0, Number.MAX_SAFE_INTEGER) && integer(n.missingPairs, 0, n.samplePairs), 'PROFILE_SAMPLE_INVALID');
  list(n.assumptions); list(n.exclusions);
  check(n.assumptions.every(text) && n.exclusions.every(text) && text(n.generatorRevision), 'PROFILE_SAMPLE_INVALID');
  check(n.state === 'not_tested' ? n.samplePairs === 0 && n.missingPairs === 0
    : n.samplePairs > 0 && n.assumptions.length > 0 && (n.state === 'sample_passed' ? n.missingPairs === 0 : n.missingPairs > 0), 'PROFILE_SAMPLE_STATE_INVALID');
  return profile;
}

/** Validate an untrusted local profile against a caller-held revision/hash (never an approval).
 * Later revisions require the previous profile and its independently held digest. Requirements
 * are immutable in this batch; owner-approved requirement changes need a separate shared contract.
 * Observation/input regions here are unqualified, so even omitted/unknown areas stay unavailable.
 */
export function validatePlaceProfile(input, options) {
  check(object(options), 'PROFILE_EXPECTATION_REQUIRED');
  const allowed = ['expectedRevision', 'expectedHash', 'previousProfile', 'previousHash'];
  check(Object.keys(options).every(key => allowed.includes(key)) && integer(options.expectedRevision, 1, Number.MAX_SAFE_INTEGER), 'PROFILE_EXPECTATION_REQUIRED');
  const profile = inspect(jsonCopy(input));
  check(profile.revision === options.expectedRevision, 'PROFILE_STALE_REVISION');
  if (profile.revision === 1) {
    check(options.previousProfile === undefined && options.previousHash === undefined, 'PROFILE_REVISION_CHAIN_INVALID');
  } else {
    check(options.previousProfile !== undefined && /^[a-f0-9]{64}$/.test(options.previousHash), 'PROFILE_PREVIOUS_REQUIRED');
    const previous = inspect(jsonCopy(options.previousProfile));
    check(digest(previous) === options.previousHash, 'PROFILE_PREVIOUS_HASH_MISMATCH');
    check(previous.placeId === profile.placeId && previous.revision === profile.revision - 1, 'PROFILE_REVISION_CHAIN_INVALID');
    check(canonical(previous.requirements) === canonical(profile.requirements), 'PROFILE_REQUIREMENTS_CHANGED');
  }
  const sha256 = digest(profile);
  if (options.expectedHash !== undefined) check(options.expectedHash === sha256, 'PROFILE_HASH_MISMATCH');
  return freeze({ profile, sha256, requirementsSha256: digest(profile.requirements),
    stages: { requirements: 'fixed_local_input', necessaryCondition: profile.necessaryCondition.state,
      bench: 'pending', physical: 'pending', comfort: 'pending' },
    availability: { observation: false, input: false, visibility: false, unlistedRegions: false },
    wholeRangeAccepted: false, physicalAccepted: false, comfortAccepted: false, grantsAuthority: false });
}
