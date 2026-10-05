// Local fixture supervisor storage. This is not an authentication boundary or
// a distributed lease. Unknown/dead owners require explicit local recovery.
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

const owned = new Set();
const MAX_BYTES = 5_000_000;
const directoryOf = (directory) => realpathSync(resolve(directory));

function readJson(file) {
  const info = lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES)
    throw new Error('Unsafe or oversized autonomy state file');
  return JSON.parse(readFileSync(file, 'utf8'));
}

function durableWrite(file, value, flag = 'wx') {
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(payload) > MAX_BYTES)
    throw new Error('Autonomy state size limit');
  const fd = openSync(file, flag, 0o600);
  try {
    writeFileSync(fd, payload);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function syncDirectory(directory) {
  const fd = openSync(directory, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

// Acquisition, release and dead-owner recovery use the same short synchronous
// guard. A crash inside this section is deliberately fail-closed: a leftover
// guard requires manual inspection, never an automatic age-based deletion.
function withLockGuard(root, callback) {
  const path = join(root, '.lock-guard');
  let fd;
  try {
    fd = openSync(path, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST')
      throw new Error(
        'Autonomy lock guard busy; retry or inspect interrupted lock maintenance',
      );
    throw error;
  }
  try {
    return callback();
  } finally {
    closeSync(fd);
    unlinkSync(path);
  }
}

function publishOnce(root, file, value) {
  const temporary = join(root, `.publish-${randomUUID()}.tmp`);
  try {
    durableWrite(temporary, value);
    linkSync(temporary, file);
    syncDirectory(root);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function validateState(state) {
  if (
    state?.schema !== 'amc-autonomy/1' ||
    state.mode !== 'fixture' ||
    !Number.isSafeInteger(state.revision) ||
    state.revision < 0
  )
    throw new Error('Invalid fixture autonomy state');
}

export function readAutonomyRun(directory) {
  const state = readJson(join(directoryOf(directory), 'state.json'));
  validateState(state);
  return state;
}

export async function withAutonomyLock(directory, callback) {
  const root = directoryOf(directory);
  const lock = join(root, '.supervisor-lock');
  const token = randomUUID();
  withLockGuard(root, () => {
    try {
      mkdirSync(lock, { mode: 0o700 });
    } catch (error) {
      if (error.code === 'EEXIST')
        throw new Error('Autonomy supervisor locked; inspect before recovery');
      throw error;
    }
    durableWrite(join(lock, 'owner.json'), {
      pid: process.pid,
      hostname: hostname(),
      uid: process.getuid?.() ?? null,
      token,
      createdAt: new Date().toISOString(),
    });
  });
  try {
    owned.add(root);
    return await callback();
  } finally {
    owned.delete(root);
    withLockGuard(root, () => {
      if (readJson(join(lock, 'owner.json')).token !== token)
        throw new Error(
          'Autonomy lock owner changed; refusing to release another owner',
        );
      unlinkSync(join(lock, 'owner.json'));
      rmdirSync(lock);
    });
  }
}

export async function createAutonomyRun(directory, state) {
  validateState(state);
  if (state.revision !== 0)
    throw new Error('Initial autonomy revision must be zero');
  mkdirSync(resolve(directory), { recursive: true, mode: 0o700 });
  return withAutonomyLock(directory, () => {
    publishOnce(
      directoryOf(directory),
      join(directoryOf(directory), 'state.json'),
      state,
    );
    syncDirectory(directoryOf(directory));
    return readAutonomyRun(directory);
  });
}

export function writeAutonomyRun(directory, state, expectedRevision) {
  const root = directoryOf(directory);
  if (!owned.has(root))
    throw new Error('Autonomy write requires exclusive supervisor lock');
  validateState(state);
  const previous = readAutonomyRun(root);
  if (
    previous.revision !== expectedRevision ||
    state.revision !== expectedRevision + 1
  )
    throw new Error('Autonomy revision conflict');
  const temporary = join(root, `.state-${randomUUID()}.tmp`);
  try {
    durableWrite(temporary, state);
    renameSync(temporary, join(root, 'state.json'));
    syncDirectory(root);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
  return readAutonomyRun(root);
}

export function readAutonomyControl(directory) {
  const root = directoryOf(directory);
  // Cancel always wins, and neither flag is consumed by the worker.
  for (const command of ['cancel', 'stop']) {
    const path = join(root, `${command}.json`);
    if (existsSync(path)) {
      if (readJson(path).command !== command)
        throw new Error('Invalid autonomy control');
      return command;
    }
  }
  return null;
}

export function requestAutonomyControl(directory, command) {
  if (!['stop', 'cancel'].includes(command))
    throw new Error('Use stop or cancel');
  const root = directoryOf(directory);
  readAutonomyRun(root);
  const path = join(root, `${command}.json`);
  try {
    publishOnce(root, path, { command, requestedAt: new Date().toISOString() });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (readJson(path).command !== command)
      throw new Error('Invalid autonomy control');
  }
  syncDirectory(root);
  return readAutonomyControl(root);
}

export async function resumeAutonomyRun(directory) {
  return withAutonomyLock(directory, () => {
    const root = directoryOf(directory);
    if (readAutonomyControl(root) === 'cancel')
      throw new Error('Cancelled run cannot resume');
    const state = readAutonomyRun(root);
    if (
      state.currentOperation?.status === 'intent' ||
      ['handoff', 'cancelled'].includes(state.phase)
    )
      throw new Error(
        'Unknown operation requires human reconciliation; cannot resume',
      );
    const stop = join(root, 'stop.json');
    if (existsSync(stop)) unlinkSync(stop);
    syncDirectory(root);
    return state;
  });
}

export function recoverAutonomyLock(directory) {
  const root = directoryOf(directory);
  const lock = join(root, '.supervisor-lock');
  return withLockGuard(root, () => {
    const owner = readJson(join(lock, 'owner.json'));
    if (
      owner.hostname !== hostname() ||
      owner.uid !== (process.getuid?.() ?? null) ||
      !Number.isSafeInteger(owner.pid) ||
      owner.pid <= 0
    )
      throw new Error(
        'Cannot establish local lock ownership; manual inspection required',
      );
    try {
      process.kill(owner.pid, 0);
      throw new Error(
        'Supervisor owner is still alive; stop it before recovery',
      );
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    // Removing this dead-process lock never clears the persisted operation intent.
    unlinkSync(join(lock, 'owner.json'));
    rmdirSync(lock);
    syncDirectory(root);
    return readAutonomyRun(root);
  });
}
