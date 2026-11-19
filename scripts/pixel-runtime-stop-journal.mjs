import { constants } from 'node:fs';
import { open, lstat, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import { ExecutorError } from '../packages/rockstaros-runtime/src/executor.mjs';

const SCHEMA = 'rockstaros.pixel-stop-intents/2';
const LEGACY_SCHEMA = 'rockstaros.pixel-stop-intents/1';
const MAX_BYTES = 196608, MAX_RECORDS = 256;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash = /^[a-f0-9]{64}$/;
const fields = ['claimId', 'id', 'requestSha256', 'scopeSha256'];
const fail = code => { throw new ExecutorError(code); };
function binding(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== fields.join(',') ||
      !uuid.test(value.id) || !uuid.test(value.claimId) ||
      !hash.test(value.scopeSha256) || !hash.test(value.requestSha256))
    fail('INVALID_RUNTIME_STOP_BINDING');
  return { id: value.id, scopeSha256: value.scopeSha256,
    claimId: value.claimId, requestSha256: value.requestSha256 };
}
const key = value => [value.id, value.scopeSha256, value.claimId, value.requestSha256].join('\0');

/** Minimal local stop metadata only: no owner name, prompt, token or result.
 * The owning private Unix listener supplies process exclusion. This journal is
 * never an authorization to start work or to read a different execution.
 */
export async function openPixelRuntimeStopJournal(directory, {
  assertOwner = async () => {}, afterRename = async () => {},
} = {}) {
  if (!Number.isInteger(constants.O_NOFOLLOW) || !constants.O_NOFOLLOW ||
      !Number.isInteger(constants.O_NONBLOCK) || !constants.O_NONBLOCK ||
      !Number.isInteger(constants.O_DIRECTORY) || !constants.O_DIRECTORY)
    fail('RUNTIME_STOP_SAFE_OPEN_UNAVAILABLE');
  const uid = userInfo().uid, filename = join(directory, 'runtime-stop-intents.json');
  async function privateDirectory() {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== uid ||
        (info.mode & 0o777) !== 0o700) fail('RUNTIME_STOP_PRIVATE_DIRECTORY_REQUIRED');
  }
  await privateDirectory();
  let durable = new Map(), wanted = new Map(), writing = Promise.resolve();
  const reserved = new Map();
  let uncertain = false, closed = false;
  function live() {
    if (closed) fail('RUNTIME_STOP_JOURNAL_CLOSED');
    if (uncertain) fail('RUNTIME_STOP_JOURNAL_WRITE_UNKNOWN');
  }
  let input;
  try {
    input = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = await input.stat();
    if (!info.isFile() || info.uid !== uid || info.nlink !== 1 ||
        (info.mode & 0o777) !== 0o600 || !Number.isSafeInteger(info.size) ||
        info.size < 1 || info.size > MAX_BYTES) fail('RUNTIME_STOP_PRIVATE_FILE_REQUIRED');
    const bytes = Buffer.alloc(MAX_BYTES + 1); let size = 0;
    while (size < bytes.length) {
      const read = await input.read(bytes, size, bytes.length - size, null);
      if (!read.bytesRead) break;
      size += read.bytesRead;
    }
    if (size > MAX_BYTES) fail('RUNTIME_STOP_JOURNAL_TOO_LARGE');
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size)));
    const legacy = value?.schema === LEGACY_SCHEMA;
    if (!value || Object.keys(value).sort().join(',') !== (legacy ? 'records,schema' : 'records,reservations,schema') ||
        ![SCHEMA, LEGACY_SCHEMA].includes(value.schema) || !Array.isArray(value.records) ||
        value.records.length > MAX_RECORDS) fail('INVALID_RUNTIME_STOP_JOURNAL');
    for (const raw of value.records) {
      const entry = binding(raw), id = key(entry);
      if (durable.has(id)) fail('INVALID_RUNTIME_STOP_JOURNAL');
      durable.set(id, entry);
    }
    if (!legacy) {
      if (!Array.isArray(value.reservations) || value.reservations.length > MAX_RECORDS)
        fail('INVALID_RUNTIME_STOP_JOURNAL');
      for (const raw of value.reservations) {
        const entry = binding(raw), id = key(entry);
        if (reserved.has(id)) fail('INVALID_RUNTIME_STOP_JOURNAL');
        reserved.set(id, entry);
      }
      if (new Set([...reserved.keys(), ...durable.keys()]).size > MAX_RECORDS)
        fail('INVALID_RUNTIME_STOP_JOURNAL');
    }
    wanted = new Map(durable);
  } catch (error) {
    if (error.code !== 'ENOENT' || input) throw error;
  } finally { await input?.close(); }

  async function commit() {
    live(); await assertOwner(); await privateDirectory();
    const next = new Map(wanted);
    const bytes = Buffer.from(JSON.stringify({ schema: SCHEMA, records: [...next.values()], reservations: [...reserved.values()] }));
    if (bytes.length > MAX_BYTES) fail('RUNTIME_STOP_JOURNAL_TOO_LARGE');
    const temporary = join(directory, '.runtime-stop-' + randomUUID() + '.tmp');
    let output, parent, moved = false;
    try {
      output = await open(temporary, constants.O_CREAT | constants.O_EXCL |
        constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      await output.writeFile(bytes); await output.sync(); await output.close(); output = null;
      await assertOwner();
      await rename(temporary, filename); moved = true;
      await afterRename();
      parent = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      await parent.sync(); await parent.close(); parent = null;
      durable = next;
    } catch (error) {
      // Never admit another start after an ambiguous persistence outcome.
      uncertain = true; throw error;
    } finally {
      await output?.close(); await parent?.close();
      if (!moved) await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
  }
  function allocate(entry, id, target) {
    if (target.has(id)) return;
    if (!reserved.has(id) && !wanted.has(id) &&
        new Set([...reserved.keys(), ...wanted.keys()]).size >= MAX_RECORDS)
      fail('RUNTIME_STOP_JOURNAL_LIMIT');
    target.set(id, entry);
  }
  function persist() {
    const result = writing.then(commit).catch(error => { uncertain = true; throw error; });
    writing = result.catch(() => {});
    return result;
  }
  return Object.freeze({
    ready() { live(); },
    has(value) { live(); return wanted.has(key(binding(value))); },
    reserve(value) {
      live(); const entry = binding(value), id = key(entry);
      if (wanted.has(id)) fail('RUNTIME_EXECUTION_FENCED');
      // Admission reserves durable cancellation capacity before a worker exists.
      // Unrelated stop frames can never consume this execution's slot.
      allocate(entry, id, reserved);
      return persist();
    },
    fence(value) {
      live(); const entry = binding(value), id = key(entry);
      if (durable.has(id)) return Promise.resolve();
      // Deny immediately, including while the fsync is still pending.
      allocate(entry, id, wanted);
      return persist();
    },
    async close() { closed = true; await writing; },
  });
}
