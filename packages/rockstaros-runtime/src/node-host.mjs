import { mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { userInfo } from 'node:os';
import { describeAdapter } from '../../../lib/rockstar-adapters.ts';
import { ExecutorError } from './executor.mjs';
export { saveNodeHostCredentials, loadNodeHostCredentials, validateNodeUnlockPhrase, CredentialVaultError } from './credential-vault.mjs';

const platform = () => ({ darwin: 'macos', win32: 'windows', linux: 'linux' })[process.platform];
const assert = (value, code) => { if (!value) throw new ExecutorError(code); };
const copy = value => structuredClone(value);
const own = () => `local-uid:${userInfo().uid}`;

/** Private job journal, not a customer database or billing ledger. One process per directory.
 * A stale lock requires explicit inspection/recovery; never infer that a PID is dead. */
export async function openNodeExecutorJournal(directory, linkedIdentity) {
  assert(['darwin', 'linux'].includes(process.platform) && Number.isSafeInteger(userInfo().uid) && userInfo().uid >= 0, 'UNSUPPORTED_PRIVATE_STORE_PLATFORM');
  if (linkedIdentity !== undefined) assert(linkedIdentity && Object.keys(linkedIdentity).length === 2 && typeof linkedIdentity.owner === 'string' && /^[A-Za-z0-9._:-]{1,160}$/.test(linkedIdentity.owner) && /^[a-f0-9-]{36}$/i.test(linkedIdentity.deviceId), 'INVALID_LINKED_JOURNAL_IDENTITY');
  const root = resolve(directory), owner = linkedIdentity?.owner ?? own();
  const binding = linkedIdentity ? { owner, deviceId: linkedIdentity.deviceId, localUid: userInfo().uid } : null;
  await mkdir(root, { recursive: true, mode: 0o700 });
  const info = await stat(root); assert(info.uid === userInfo().uid && (info.mode & 0o077) === 0, 'PRIVATE_DIRECTORY_REQUIRED');
  const lockPath = join(root, 'executor.lock'), statePath = join(root, 'executions.json');
  const lock = await open(lockPath, 'wx', 0o600); await lock.writeFile(JSON.stringify({ pid: process.pid, owner }));
  let data = { schema: 1, owner, records: {}, ...(binding ? { binding } : {}) }, chain = Promise.resolve(), closed = false, closing = false, closePromise;
  try {
    try { const s = await stat(statePath); assert(s.size <= 5000000 && s.uid === userInfo().uid && (s.mode & 0o077) === 0, 'INVALID_JOURNAL'); data = JSON.parse(await readFile(statePath, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    assert(JSON.stringify(data.binding ?? null) === JSON.stringify(binding), 'JOURNAL_DEVICE_BINDING_MISMATCH');
    assert(data.schema === 1 && data.owner === owner && data.records && typeof data.records === 'object' && !Array.isArray(data.records) && Object.keys(data.records).length <= 100, 'JOURNAL_OWNER_OR_SCHEMA_MISMATCH');
    const bindingPath = join(root, 'host-binding.json'); let existingBinding = false;
    try {
      const info = await stat(bindingPath); assert(info.uid === userInfo().uid && (info.mode & 0o077) === 0 && info.size <= 2048, 'INVALID_JOURNAL_BINDING');
      assert(JSON.stringify(JSON.parse(await readFile(bindingPath, 'utf8'))) === JSON.stringify(binding), 'JOURNAL_DEVICE_BINDING_MISMATCH'); existingBinding = true;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (binding && !existingBinding) {
      const file = await open(bindingPath, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify(binding)); await file.sync(); } finally { await file.close(); }
      const dir = await open(root, 'r'); try { await dir.sync(); } finally { await dir.close(); }
    }
  } catch (e) { await lock.close(); await unlink(lockPath); throw e; }
  const serial = fn => { assert(!closing, 'JOURNAL_CLOSED'); const next = chain.then(() => { assert(!closed, 'JOURNAL_CLOSED'); return fn(); }); chain = next.catch(() => {}); return next; };
  async function commit(next) {
    const bytes = JSON.stringify(next); assert(Buffer.byteLength(bytes) <= 5000000, 'JOURNAL_FULL');
    const temp = join(root, 'executions.json.tmp'), f = await open(temp, 'w', 0o600);
    try { await f.writeFile(bytes); await f.sync(); } finally { await f.close(); }
    await rename(temp, statePath); const directoryFd = await open(root, 'r'); try { await directoryFd.sync(); } finally { await directoryFd.close(); }
    data = next;
  }
  return Object.freeze({ owner,
    get: id => serial(() => copy(data.records[id] ?? null)),
    claim: value => serial(async () => {
      assert(value.owner === owner && /^[a-f0-9-]{36}$/i.test(value.id), 'JOURNAL_OWNER_OR_ID_MISMATCH');
      if (data.records[value.id]) return { created: false, record: copy(data.records[value.id]) };
      assert(Object.keys(data.records).length < 100, 'JOURNAL_FULL');
      await commit({ ...data, records: { ...data.records, [value.id]: copy(value) } }); return { created: true, record: copy(value) };
    }),
    replace: (id, revision, value) => serial(async () => {
      assert(data.records[id]?.revision === revision && value.revision === revision + 1 && value.owner === owner && value.id === id && value.digest === data.records[id].digest, 'JOURNAL_REVISION_CONFLICT');
      await commit({ ...data, records: { ...data.records, [id]: copy(value) } });
    }),
    close() { return closePromise ??= (async () => { closing = true; await chain; closed = true; await lock.close(); await unlink(lockPath); })(); },
  });
}
async function json(response, maximum = 200000) {
  assert(response.ok && response.headers.get('content-type')?.includes('application/json') && response.body, 'LOCAL_MODEL_RESPONSE_REJECTED');
  const reader = response.body.getReader(), parts = []; let length = 0;
  try { while (true) { const p = await reader.read(); if (p.done) break; length += p.value.byteLength; assert(length <= maximum, 'LOCAL_MODEL_RESPONSE_TOO_LARGE'); parts.push(p.value); } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(length); let at = 0; for (const part of parts) { bytes.set(part, at); at += part.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

/** Existing local GGUF only. Metadata is from the trusted local daemon, not hardware attestation. */
export function createOllamaExecutor({ fetchImpl = fetch } = {}) {
  let busy = false;
  const base = 'http://127.0.0.1:11434';
  const validPin = pin => assert(pin?.scheme === 'ollama-manifest-sha256' && /^[a-f0-9]{64}$/.test(pin.sha256) && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/.test(pin.id), 'INVALID_OLLAMA_PIN');
  async function installed(pin, signal) {
    validPin(pin);
    const tags = await json(await fetchImpl(base + '/api/tags', { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) }));
    assert(Array.isArray(tags.models) && tags.models.length <= 100, 'LOCAL_MODEL_METADATA_INVALID');
    const candidate = tags.models.find(m => m.name === pin.id && m.digest === pin.sha256);
    assert(candidate, 'MODEL_PIN_NOT_INSTALLED');
    const local = v => (v.remote_model === undefined || v.remote_model === '') && (v.remote_host === undefined || v.remote_host === '');
    assert(local(candidate), 'REMOTE_MODEL_NOT_ALLOWED');
    assert(candidate.details?.format === 'gguf' && Number.isSafeInteger(candidate.size) && candidate.size > 0, 'LOCAL_MODEL_METADATA_UNSUPPORTED');
    const info = await json(await fetchImpl(base + '/api/show', { method: 'POST', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: pin.id }) }));
    assert(local(info), 'REMOTE_MODEL_NOT_ALLOWED');
    assert(info.details?.format === 'gguf' && Array.isArray(info.capabilities) && info.capabilities.includes('completion'), 'LOCAL_MODEL_METADATA_UNSUPPORTED');
  }
  return Object.freeze({
    async describe(pin) {
      assert(!busy, 'EXECUTOR_BUSY'); await installed(pin, AbortSignal.timeout(5000));
      return describeAdapter('node-ollama', 'executor', platform(), { 'text.generate': true, 'model.pin': true });
    },
    async generate(request, signal) {
      assert(!busy, 'EXECUTOR_BUSY'); busy = true;
      try {
        await installed(request.model, signal); const start = performance.now();
        const result = await json(await fetchImpl(base + '/api/chat', { method: 'POST', redirect: 'error', signal,
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: request.model.id, stream: false, keep_alive: '30s',
            messages: [{ role: 'system', content: request.agent.instructions }, { role: 'user', content: request.input }],
            options: { num_predict: request.maxOutputTokens, temperature: 0, num_ctx: 2048 } }) }));
        assert(!result.remote_model && !result.remote_host && !result.message?.tool_calls?.length && result.done === true && result.done_reason !== 'length' && result.model === request.model.id && typeof result.message?.content === 'string' && result.message.content.trim(), 'LOCAL_MODEL_RESULT_INCOMPLETE');
        await installed(request.model, signal);
        return { text: result.message.content, model: copy(request.model), durationMs: Math.round(performance.now() - start) };
      } finally { busy = false; }
    },
  });
}
export const nodeHostDescriptor = (now = Date.now()) => describeAdapter('node-private-host', 'host', platform(), { 'identity.owner-local': true, 'store.cas': true }, now);
export const textOutputDescriptor = (now = Date.now()) => describeAdapter('text-output', 'output', platform(), { 'output.text': true }, now);
