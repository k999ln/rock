// Pure, local static intake. Caller supplies authenticated owner, registry rights,
// and locally read bytes. Nothing here executes a game, grants a capability,
// verifies a signature, unpacks an archive, writes a save, or contacts a service.
import {
  GAME_SANDBOX_RULES,
  GAME_SANDBOX_SAVE_FORMAT,
  GAME_SANDBOX_SAVE_VERSION,
} from './game-sandbox.ts';

export type GameResources = {
  packageBytes: number; expandedBytes: number; fileCount: number;
  memoryBytes: number; cpuMillis: number; timeMillis: number; outputBytes: number;
};
export type GameManifest = {
  schema: 'rock.game-package/1'; gameId: string; revision: string;
  authorId: string; sourceKind: 'owned-web-bundle'; packageFormat: 'file-set';
  packageSha256: string;
  rights: { grantId: string; licenseId: string; expiresAt: number };
  engine: { id: string; version: string }; runtime: { id: string; version: string };
  entry: string;
  assets: { id: string; path: string; sha256: string; bytes: number; licenseId: string }[];
  capabilities: string[]; resources: GameResources;
  save: { format: string; version: number; ruleId: string };
};
export type GameIntakeContext = {
  // Trusted host inputs, never taken from game metadata. Registry lookup and
  // authenticated owner resolution remain the consumer's responsibility.
  ownerId: string; observedAt: number; // UTC epoch milliseconds
  // file-set/1 package bytes = canonical JSON array of {bytes,path,sha256},
  // sorted by ASCII path (exact case). Binds every observed file to the package
  // digest in the registry grant. It is an index, never an executable archive.
  packageBytes: Uint8Array;
  files: { path: string; bytes: Uint8Array }[];
  grants: { id: string; ownerId: string; authorId: string; gameId: string;
    revision: string; packageSha256: string; licenseId: string; expiresAt: number;
    revoked: boolean }[];
  target: { id: string; revision: string; capabilities: string[];
    runtimes: { id: string; version: string }[]; limits: GameResources };
  // Optional metadata from the owner's save store; not an import of arbitrary
  // game bytes. Actual format/digest validation is still loadSandbox's job.
  save?: { ownerId: string; gameId: string; revision: string;
    format: string; version: number; ruleId: string };
};
export type GameDiagnostic = {
  schema: 'rock.game-diagnostic/1'; method: 'static-local';
  status: 'invalid_manifest' | 'rights_blocked' | 'unsupported' | 'missing_capability' | 'launch_candidate';
  reasons: string[]; gameId: string | null; revision: string | null;
  manifestSha256: string | null; packageSha256: string | null;
  ownerId: string; observedAt: number; targetId: string; targetRevision: string;
  adapterCandidate: string | null;
  checks: { isolation: 'unverified'; launch: 'unverified'; input: 'unverified'; save: 'unverified' };
  measurements: { installationMillis: null; firstAttemptCount: null;
    firstSuccessCount: null; recoveryMillis: null };
};

const resourceKeys = ['packageBytes', 'expandedBytes', 'fileCount', 'memoryBytes', 'cpuMillis', 'timeMillis', 'outputBytes'] as const;
const allowedCapabilities = ['input.pointer', 'input.keyboard', 'render.2d', 'save.owner', 'game.points.issue'] as const;
// Fixed diagnostic adapters, NOT a registry of installed/accepted executors.
const adapters = [
  { id: 'particle-fixture/1', engine: 'rock-particle-sandbox', engineVersion: '1', runtime: 'rock-particle-host', runtimeVersion: '1' },
  { id: 'browser-starter-fixture/1', engine: 'mini-browser-starter', engineVersion: '1', runtime: 'browser-esm', runtimeVersion: '1' },
] as const;
const digestPattern = /^[a-f0-9]{64}$/;
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object_required');
  const proto = Object.getPrototypeOf(value) as unknown;
  if (proto !== Object.prototype && proto !== null) throw new Error('plain_object_required');
  return value as Record<string, unknown>;
}
function fields(value: unknown, keys: readonly string[]) {
  const v = object(value);
  if (Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) throw new Error('unexpected_fields');
  return v;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !idPattern.test(value)) throw new Error('invalid_id');
  return value;
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error('invalid_positive_integer');
  return value;
}
function hash(value: unknown): string {
  if (typeof value !== 'string' || !digestPattern.test(value)) throw new Error('invalid_sha256');
  return value;
}
function relativePath(value: unknown): string {
  // A deliberately narrow portable file-set namespace. No decoding, aliases,
  // absolute paths, URL schemes, drive letters, dot segments or backslashes.
  if (typeof value !== 'string' || value.length > 240 || !/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(value)
    || value.split('/').some(p => p === '.' || p === '..')) throw new Error('unsafe_path');
  return value;
}
function resources(value: unknown): GameResources {
  const v = fields(value, resourceKeys);
  return Object.fromEntries(resourceKeys.map(k => [k, integer(v[k])])) as GameResources;
}
function manifest(value: unknown): GameManifest {
  const candidate = object(value);
  if (!Object.hasOwn(candidate, 'rights') || candidate.rights === null) throw new Error('rights_missing');
  const m = fields(value, ['schema', 'gameId', 'revision', 'authorId', 'sourceKind', 'packageFormat', 'packageSha256', 'rights', 'engine', 'runtime', 'entry', 'assets', 'capabilities', 'resources', 'save']);
  if (m.schema !== 'rock.game-package/1' || m.sourceKind !== 'owned-web-bundle' || m.packageFormat !== 'file-set') throw new Error('unsupported_package_format');
  const rights = fields(m.rights, ['grantId', 'licenseId', 'expiresAt']);
  const engine = fields(m.engine, ['id', 'version']);
  const runtime = fields(m.runtime, ['id', 'version']);
  const save = fields(m.save, ['format', 'version', 'ruleId']);
  if (!Array.isArray(m.assets) || m.assets.length < 1 || m.assets.length > 128) throw new Error('asset_count');
  const assets = m.assets.map((raw: unknown) => {
    const a = fields(raw, ['id', 'path', 'sha256', 'bytes', 'licenseId']);
    return { id: id(a.id), path: relativePath(a.path), sha256: hash(a.sha256), bytes: integer(a.bytes), licenseId: id(a.licenseId) };
  });
  for (const key of ['id', 'path'] as const) {
    if (new Set(assets.map(a => a[key].toLowerCase())).size !== assets.length) throw new Error('duplicate_asset_' + key);
  }
  // File-set paths share a case-insensitive portable namespace. A file may
  // not occupy any implicit parent directory, regardless of asset ordering.
  const paths = new Set(assets.map(a => a.path.toLowerCase()));
  for (const path of paths) {
    for (let slash = path.indexOf('/'); slash !== -1; slash = path.indexOf('/', slash + 1)) {
      if (paths.has(path.slice(0, slash))) throw new Error('file_directory_collision');
    }
  }
  if (!Array.isArray(m.capabilities) || m.capabilities.length > 16 || !m.capabilities.every(c => typeof c === 'string' && c.length <= 128)) throw new Error('invalid_capabilities');
  if (new Set(m.capabilities).size !== m.capabilities.length) throw new Error('duplicate_capability');
  return {
    schema: m.schema, sourceKind: m.sourceKind, packageFormat: m.packageFormat,
    gameId: id(m.gameId), revision: id(m.revision), authorId: id(m.authorId), packageSha256: hash(m.packageSha256),
    rights: { grantId: id(rights.grantId), licenseId: id(rights.licenseId), expiresAt: integer(rights.expiresAt) },
    engine: { id: id(engine.id), version: id(engine.version) }, runtime: { id: id(runtime.id), version: id(runtime.version) },
    entry: relativePath(m.entry), assets, capabilities: [...m.capabilities] as string[], resources: resources(m.resources),
    save: { format: id(save.format), version: integer(save.version), ruleId: id(save.ruleId) },
  };
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}
export async function gameIntakeSha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export async function diagnoseGameIntake(input: unknown, context: GameIntakeContext): Promise<GameDiagnostic> {
  id(context.ownerId); integer(context.observedAt); id(context.target.id); id(context.target.revision);
  const limits = resources(context.target.limits);
  const result: GameDiagnostic = {
    schema: 'rock.game-diagnostic/1', method: 'static-local', status: 'invalid_manifest', reasons: [],
    gameId: null, revision: null, manifestSha256: null, packageSha256: null,
    ownerId: context.ownerId, observedAt: context.observedAt, targetId: context.target.id, targetRevision: context.target.revision,
    adapterCandidate: null, checks: { isolation: 'unverified', launch: 'unverified', input: 'unverified', save: 'unverified' },
    measurements: { installationMillis: null, firstAttemptCount: null, firstSuccessCount: null, recoveryMillis: null },
  };
  const fail = (status: GameDiagnostic['status'], reason: string) => ({ ...result, status, reasons: [reason] });
  let m: GameManifest;
  try { m = manifest(input); } catch (error) {
    const reason = error instanceof Error ? error.message : 'invalid_manifest';
    return fail(reason === 'rights_missing' ? 'rights_blocked' : 'invalid_manifest', reason);
  }
  result.gameId = m.gameId; result.revision = m.revision; result.packageSha256 = m.packageSha256;
  result.manifestSha256 = await gameIntakeSha256(new TextEncoder().encode(canonical(m)));
  if (resourceKeys.some(k => m.resources[k] > limits[k])) return fail('missing_capability', 'resource_limit');
  if (context.packageBytes.byteLength > limits.packageBytes || context.files.length > limits.fileCount) return fail('missing_capability', 'resource_limit');
  if (context.packageBytes.byteLength !== m.resources.packageBytes || context.files.length !== m.resources.fileCount
    || m.assets.length !== context.files.length) return fail('invalid_manifest', 'package_size_or_count_mismatch');
  if (await gameIntakeSha256(context.packageBytes) !== m.packageSha256) return fail('invalid_manifest', 'package_hash_mismatch');
  const files = new Map<string, Uint8Array>();
  let expandedBytes = 0;
  for (const f of context.files) {
    try { relativePath(f.path); } catch { return fail('invalid_manifest', 'unsafe_path'); }
    const key = f.path.toLowerCase();
    if (files.has(key)) return fail('invalid_manifest', 'duplicate_file_path');
    expandedBytes += f.bytes.byteLength;
    if (!Number.isSafeInteger(expandedBytes) || expandedBytes > limits.expandedBytes) return fail('missing_capability', 'resource_limit');
    files.set(key, f.bytes);
  }
  if (expandedBytes !== m.resources.expandedBytes) return fail('invalid_manifest', 'expanded_size_mismatch');
  for (const asset of m.assets) {
    const bytes = context.files.find(f => f.path === asset.path)?.bytes;
    if (!bytes || bytes.byteLength !== asset.bytes || await gameIntakeSha256(bytes) !== asset.sha256) return fail('invalid_manifest', 'asset_hash_or_size_mismatch');
  }
  const index = m.assets.map(a => ({ path: a.path, bytes: a.bytes, sha256: a.sha256 }))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  if (await gameIntakeSha256(new TextEncoder().encode(canonical(index))) !== m.packageSha256) return fail('invalid_manifest', 'file_set_index_mismatch');
  if (!m.assets.some(a => a.path === m.entry)) return fail('invalid_manifest', 'entry_not_in_assets');
  const grants = context.grants.filter(g => g.id === m.rights.grantId);
  const grant = grants.length === 1 ? grants[0] : undefined;
  if (!grant || grant.revoked !== false || grant.ownerId !== context.ownerId || grant.authorId !== m.authorId
    || grant.gameId !== m.gameId || grant.revision !== m.revision || grant.packageSha256 !== m.packageSha256
    || grant.licenseId !== m.rights.licenseId || grant.expiresAt !== m.rights.expiresAt
    || !Number.isSafeInteger(grant.expiresAt) || grant.expiresAt <= context.observedAt
    || m.assets.some(a => a.licenseId !== grant.licenseId)) return fail('rights_blocked', 'rights_missing_expired_or_mismatched');
  const adapter = adapters.find(a => a.engine === m.engine.id && a.engineVersion === m.engine.version
    && a.runtime === m.runtime.id && a.runtimeVersion === m.runtime.version);
  if (!adapter) return fail('unsupported', 'unknown_engine_or_runtime_version');
  if (m.capabilities.some(c => !(allowedCapabilities as readonly string[]).includes(c))) return fail('unsupported', 'forbidden_capability');
  if (!context.target.runtimes.some(r => r.id === m.runtime.id && r.version === m.runtime.version)
    || m.capabilities.some(c => !context.target.capabilities.includes(c))) return fail('missing_capability', 'target_capability_missing');
  if (adapter.id === 'particle-fixture/1' && (m.save.format !== GAME_SANDBOX_SAVE_FORMAT
    || m.save.version !== GAME_SANDBOX_SAVE_VERSION || m.save.ruleId !== GAME_SANDBOX_RULES.id)) return fail('unsupported', 'particle_save_contract_mismatch');
  const save = context.save;
  if (save && (save.ownerId !== context.ownerId || save.gameId !== m.gameId || save.revision !== m.revision
    || save.format !== m.save.format || save.version !== m.save.version || save.ruleId !== m.save.ruleId)) return fail('unsupported', 'save_owner_or_version_mismatch');
  return { ...result, status: 'launch_candidate', adapterCandidate: adapter.id };
}
