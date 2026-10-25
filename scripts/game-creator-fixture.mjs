/** Finite local particle fixture; no author authentication or production executor.
 * Run with node --experimental-strip-types. Only the committed session is used.
 * State slots contain the EXISTING sandbox save bytes, never another save schema.
 */
import {
  constants as C, openSync, closeSync, fstatSync, lstatSync, readSync,
  writeFileSync, fsyncSync, unlinkSync, realpathSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { diagnoseGameIntake, gameIntakeSha256 } from '../lib/game-intake.ts';
import {
  GAME_SANDBOX_RULES, GAME_SANDBOX_SAVE_FORMAT, GAME_SANDBOX_SAVE_VERSION,
  createSandbox, applySandboxCommand, saveSandbox, loadSandbox, sandboxDigest,
} from '../lib/game-sandbox.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SESSION = 'tests/fixtures/game-sandbox-session.json';
const SESSION_HASH = '0df00814e88721d16ca41e30b1dbb8c0ccc536c363e5f82958f292448699ea08';
const SAVE_LIMIT = 4_000_000;
const OWNER = 'synthetic-local-owner';
const FLAGS = C.O_RDONLY | C.O_NOFOLLOW | C.O_NONBLOCK;
const SCENARIOS = ['active', 'expired', 'revoked', 'foreign-owner', 'bad-package'];
const fail = (code, status = 400) => { throw Object.assign(new Error(code), { code, status }); };
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino;
const safeRevision = value => Number.isSafeInteger(value) && value >= 0 && value <= 1000;

function flagsAvailable() {
  if (![C.O_NOFOLLOW, C.O_NONBLOCK, C.O_DIRECTORY].every(value => typeof value === 'number' && value !== 0))
    fail('UNSUPPORTED_FILE_SAFETY', 503);
}
function readFd(fd, limit, privateFile = false) {
  const before = fstatSync(fd);
  if (!before.isFile() || before.size > limit || before.nlink !== 1 ||
      (privateFile && (before.uid !== process.geteuid() || (before.mode & 0o777) !== 0o600)))
    fail('UNSAFE_OR_OVERSIZE_FILE');
  const chunks = []; let size = 0;
  for (;;) {
    const buffer = Buffer.alloc(Math.min(65_536, limit + 1 - size));
    const n = readSync(fd, buffer, 0, buffer.length, null);
    if (!n) break;
    size += n; if (size > limit) fail('UNSAFE_OR_OVERSIZE_FILE');
    chunks.push(buffer.subarray(0, n));
  }
  const after = fstatSync(fd);
  if (after.size !== size || before.size !== after.size || before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs) fail('FILE_CHANGED_DURING_READ', 409);
  return Buffer.concat(chunks);
}
function readRegular(path, limit, privateFile = false) {
  const fd = openSync(path, FLAGS);
  try { return readFd(fd, limit, privateFile); } finally { closeSync(fd); }
}
const utf8 = bytes => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);

export async function diagnoseCreatorFixture(scenario = 'active') {
  flagsAvailable();
  if (!SCENARIOS.includes(scenario)) fail('UNKNOWN_FIXTURE_SCENARIO');
  const bytes = readRegular(join(ROOT, SESSION), 65_536);
  if (await gameIntakeSha256(bytes) !== SESSION_HASH) fail('FIXED_SESSION_CHANGED', 409);
  const session = JSON.parse(utf8(bytes));
  const packageBytes = new TextEncoder().encode(JSON.stringify([
    { bytes: bytes.length, path: 'session.json', sha256: SESSION_HASH },
  ]));
  const packageSha256 = await gameIntakeSha256(packageBytes);
  const observedAt = Date.now(); const expiresAt = observedAt + 60_000;
  const resources = { packageBytes: packageBytes.length, expandedBytes: bytes.length, fileCount: 1,
    memoryBytes: 1_048_576, cpuMillis: 1000, timeMillis: 10_000, outputBytes: SAVE_LIMIT };
  const manifest = { schema: 'rock.game-package/1', gameId: 'particle-local-fixture', revision: '1',
    authorId: 'synthetic-local-author', sourceKind: 'owned-web-bundle', packageFormat: 'file-set', packageSha256,
    rights: { grantId: 'synthetic-local-grant', licenseId: 'fixture-only', expiresAt },
    engine: { id: 'rock-particle-sandbox', version: '1' }, runtime: { id: 'rock-particle-host', version: '1' },
    entry: 'session.json', assets: [{ id: 'session', path: 'session.json', bytes: bytes.length, sha256: SESSION_HASH, licenseId: 'fixture-only' }],
    capabilities: ['render.2d', 'input.pointer', 'save.owner'], resources,
    save: { format: GAME_SANDBOX_SAVE_FORMAT, version: GAME_SANDBOX_SAVE_VERSION, ruleId: GAME_SANDBOX_RULES.id } };
  const context = { ownerId: OWNER, observedAt, packageBytes, files: [{ path: 'session.json', bytes }],
    grants: [{ id: manifest.rights.grantId, ownerId: OWNER, authorId: manifest.authorId, gameId: manifest.gameId,
      revision: '1', packageSha256, licenseId: 'fixture-only', expiresAt, revoked: false }],
    target: { id: 'local-particle-fixture', revision: '1', capabilities: [...manifest.capabilities],
      runtimes: [manifest.runtime], limits: { ...resources } } };
  if (scenario === 'expired') context.observedAt = expiresAt;
  if (scenario === 'revoked') context.grants[0].revoked = true;
  if (scenario === 'foreign-owner') context.ownerId = 'another-synthetic-owner';
  if (scenario === 'bad-package') context.packageBytes = Uint8Array.from(packageBytes, b => b ^ 1);
  const diagnostic = await diagnoseGameIntake(manifest, context);
  return { diagnostic, session, sessionSha256: SESSION_HASH, packageSha256 };
}

function privateDirectory(input) {
  flagsAvailable();
  if (typeof input !== 'string' || !input) fail('PRIVATE_TEMP_DIRECTORY_REQUIRED');
  const fd = openSync(resolve(input), FLAGS | C.O_DIRECTORY);
  try {
    const stat = fstatSync(fd), path = realpathSync(resolve(input));
    if (!stat.isDirectory() || stat.uid !== process.geteuid() || (stat.mode & 0o777) !== 0o700 ||
        dirname(path) !== realpathSync(tmpdir()) || !/^rock-game-fixture-[A-Za-z0-9_-]+$/.test(basename(path)))
      fail('PRIVATE_TEMP_DIRECTORY_REQUIRED');
    const check = () => {
      const current = lstatSync(path);
      if (!current.isDirectory() || !sameFile(stat, current) || current.uid !== stat.uid ||
          (current.mode & 0o777) !== 0o700) fail('FIXTURE_DIRECTORY_CHANGED', 409);
    };
    check(); return { path, check, sync() { check(); fsyncSync(fd); }, close() { closeSync(fd); } };
  } catch (error) { closeSync(fd); throw error; }
}
function unlinkOwn(dir, path, identity) {
  dir.check();
  if (!sameFile(lstatSync(path), identity)) fail('FIXTURE_FILE_CHANGED', 409);
  unlinkSync(path);
}
function acquireLock(dir, recover) {
  const path = join(dir.path, '.creator-fixture.lock'); dir.check();
  const create = () => openSync(path, C.O_WRONLY | C.O_CREAT | C.O_EXCL | C.O_NOFOLLOW | C.O_NONBLOCK, 0o600);
  let fd;
  try { fd = create(); } catch (error) {
    if (error.code !== 'EEXIST' || !recover) fail(error.code === 'EEXIST' ? 'FIXTURE_LOCKED' : 'LOCK_UNAVAILABLE', 409);
    const old = openSync(path, FLAGS);
    try {
      const identity = fstatSync(old), value = JSON.parse(utf8(readFd(old, 256, true)));
      if (Object.keys(value).sort().join(',') !== 'pid,token' || !Number.isSafeInteger(value.pid) || value.pid < 1 ||
          typeof value.token !== 'string' || !/^[a-f0-9-]{36}$/.test(value.token)) fail('UNKNOWN_LOCK', 409);
      try { process.kill(value.pid, 0); fail('LOCK_OWNER_LIVE', 409); }
      catch (status) { if (status.code !== 'ESRCH') throw status; }
      // Explicit recovery only; a live/reused PID or uncertain process state refuses.
      unlinkOwn(dir, path, identity);
    } finally { closeSync(old); }
    fd = create();
  }
  const identity = fstatSync(fd);
  try { writeFileSync(fd, JSON.stringify({ pid: process.pid, token: randomUUID() })); fsyncSync(fd); }
  catch (error) { closeSync(fd); unlinkOwn(dir, path, identity); throw error; }
  return () => { try { unlinkOwn(dir, path, identity); } finally { closeSync(fd); } };
}
const slot = (dir, revision) => {
  if (!safeRevision(revision)) fail('INVALID_REVISION');
  dir.check(); return join(dir.path, `save-${revision}.json`);
};
async function loadSlot(dir, revision, session) {
  const bytes = readRegular(slot(dir, revision), SAVE_LIMIT, true); dir.check();
  let state;
  try { state = await loadSandbox(utf8(bytes)); }
  catch (error) { fail(error.status === 409 ? 'SAVE_VERSION_OR_RULE_CONFLICT' : 'SAVE_VALIDATION_FAILED', error.status ?? 400); }
  // Only a prefix of this exact committed fixture is resumable. An unrelated,
  // valid sandbox save in the directory is never adopted as an authorized session.
  const expected = replay(session, revision);
  if (state.revision !== revision || await sandboxDigest(state) !== await sandboxDigest(expected))
    fail('SAVE_NOT_FIXED_SESSION_PREFIX', 409);
  return { state, bytes };
}
function replay(session, through) {
  if (!safeRevision(through) || through > session.commands.length) fail('INVALID_PREFIX');
  let state = createSandbox(session.create);
  for (const command of session.commands.slice(0, through)) state = applySandboxCommand(state, command, state.revision);
  return state;
}
async function publishSlot(dir, state, session) {
  const raw = await saveSandbox(state), bytes = Buffer.from(raw);
  if (bytes.length > SAVE_LIMIT) fail('SAVE_TOO_LARGE');
  await loadSandbox(raw);
  const path = slot(dir, state.revision); let fd;
  try { fd = openSync(path, C.O_WRONLY | C.O_CREAT | C.O_EXCL | C.O_NOFOLLOW | C.O_NONBLOCK, 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const old = await loadSlot(dir, state.revision, session);
    if (!old.bytes.equals(bytes)) fail('SAVE_SLOT_CONFLICT', 409);
    return { bytes: old.bytes, recovered: true };
  }
  const identity = fstatSync(fd);
  try {
    if (!identity.isFile() || identity.nlink !== 1) fail('UNSAFE_OR_OVERSIZE_FILE');
    writeFileSync(fd, bytes); fsyncSync(fd); dir.check();
    if (!sameFile(lstatSync(path), identity)) fail('FIXTURE_FILE_CHANGED', 409);
  } finally { closeSync(fd); }
  // Immutable revision slots never overwrite prior accepted bytes. A failed/
  // partial new slot is retained as unknown; explicit read refuses it, no reset.
  dir.sync();
  const readback = await loadSlot(dir, state.revision, session);
  if (!readback.bytes.equals(bytes)) fail('SAVE_READBACK_MISMATCH', 409);
  return { bytes: readback.bytes, recovered: false };
}

export async function runCreatorFixture(options) {
  const started = performance.now();
  if (!options || Object.keys(options).some(k => !['operation', 'directory', 'revision', 'through', 'command', 'expectedRevision', 'scenario', 'recoverLock'].includes(k)) ||
      !['start', 'resume', 'command', 'read'].includes(options.operation) ||
      (options.recoverLock !== undefined && typeof options.recoverLock !== 'boolean')) fail('INVALID_OPTIONS');
  const operationFields = { start: ['through'], resume: ['revision', 'through'], command: ['revision', 'command', 'expectedRevision'], read: ['revision'] };
  if (Object.keys(options).some(k => !['operation', 'directory', 'scenario', 'recoverLock', ...operationFields[options.operation]].includes(k)))
    fail('INVALID_OPTIONS');
  const intake = await diagnoseCreatorFixture(options.scenario);
  if (intake.diagnostic.status !== 'launch_candidate' || intake.diagnostic.adapterCandidate !== 'particle-fixture/1')
    return { outcome: 'intake_denied', diagnostic: intake.diagnostic, hostProof: null, productionExchangeEnabled: false };
  const dir = privateDirectory(options.directory); let release;
  try {
    release = acquireLock(dir, options.recoverLock === true);
    const { session } = intake;
    let state, before, replayed = false;
    if (options.operation === 'start') {
      if (options.revision !== undefined || options.command !== undefined || options.expectedRevision !== undefined)
        fail('INVALID_OPTIONS');
      state = replay(session, options.through ?? 1);
    } else {
      if (!safeRevision(options.revision)) fail('INVALID_REVISION');
      ({ state } = await loadSlot(dir, options.revision, session)); before = state;
      if (options.operation === 'resume') {
        const through = options.through ?? session.commands.length;
        if (!safeRevision(through) || through < state.revision || through > session.commands.length) fail('INVALID_PREFIX');
        for (const command of session.commands.slice(state.revision, through)) state = applySandboxCommand(state, command, state.revision);
      } else if (options.operation === 'command') {
        const command = options.command;
        if (!command || !session.commands.some(c => c.id === command.id)) fail('NOT_FIXED_SESSION_COMMAND');
        const expectedRevision = options.expectedRevision ?? state.revision;
        // Existing runtime checks same-ID conflict and stale revisions first.
        state = applySandboxCommand(state, command, expectedRevision);
        replayed = state === before;
        if (!replayed && JSON.stringify(command) !== JSON.stringify(session.commands[before.revision]))
          fail('NOT_NEXT_FIXED_SESSION_COMMAND', 409);
      } else if (options.command !== undefined || options.through !== undefined) fail('INVALID_OPTIONS');
    }
    const saved = await publishSlot(dir, state, session);
    return { outcome: 'host_fixture_saved', diagnostic: intake.diagnostic,
      hostProof: { pid: process.pid, adapter: 'known-particle-session-only', sessionSha256: intake.sessionSha256,
        revision: state.revision, stateDigest: await sandboxDigest(state), saveSha256: await gameIntakeSha256(saved.bytes),
        saveFile: `save-${state.revision}.json`, exactReadback: true, identicalCommandReplay: replayed,
        recoveredExistingSlot: saved.recovered, elapsedMillis: performance.now() - started },
      productionExchangeEnabled: false, authenticatedOwnerStorageAccepted: false };
  } finally { try { release?.(); } finally { dir.close(); } }
}

const HELP = `Local synthetic particle creator fixture (no Wallet or external game).\nUsage: node --experimental-strip-types scripts/game-creator-fixture.mjs start|read|resume|command --directory PRIVATE_TEMP_DIR [--revision N] [--through N] [--command-json JSON] [--expected-revision N] [--scenario active|expired|revoked|foreign-owner|bad-package] [--recover-lock]\nCreate your own mode0700 rock-game-fixture-* directory directly inside the system temporary directory. start defaults to the first committed command; resume reads an explicit saved revision and applies the rest. Immutable save-N.json slots use the existing sandbox format. Preserve unknown slots; no automatic fallback/reset. --recover-lock explicitly removes only a validated fixture lock whose PID no longer exists; live/uncertain/reused PIDs refuse. This assumes an owned private directory, not protection against a hostile same-UID process.\n`;
async function main(args) {
  if (args.length === 1 && args[0] === '--help') { process.stdout.write(HELP); return; }
  const options = { operation: args.shift() };
  const names = { '--directory': 'directory', '--revision': 'revision', '--through': 'through',
    '--command-json': 'command', '--expected-revision': 'expectedRevision', '--scenario': 'scenario' };
  while (args.length) {
    const key = args.shift();
    if (key === '--recover-lock') { if (options.recoverLock) fail('INVALID_OPTIONS'); options.recoverLock = true; continue; }
    const name = names[key]; if (!name || !args.length || Object.hasOwn(options, name)) fail('INVALID_OPTIONS');
    const value = args.shift();
    options[name] = ['revision', 'through', 'expectedRevision'].includes(name)
      ? (/^(0|[1-9][0-9]{0,3})$/.test(value) ? Number(value) : fail('INVALID_REVISION'))
      : name === 'command' ? JSON.parse(value) : value;
  }
  const result = await runCreatorFixture(options);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.outcome === 'intake_denied') process.exitCode = 2;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${JSON.stringify({ outcome: 'refused', code: error.code ?? 'FIXTURE_FAILED', status: error.status ?? 400 })}\n`);
    process.exitCode = 1;
  });
}
