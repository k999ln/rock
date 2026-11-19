import { createServer } from 'node:net';
import { mkdir, lstat, chmod, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { userInfo } from 'node:os';
import { executionDigest, parseLocalTextRequest, ExecutorError } from '../packages/rockstaros-runtime/src/executor.mjs';
import { openPixelRuntimeStopJournal } from './pixel-runtime-stop-journal.mjs';

const INPUT_LIMIT = 24000, OUTPUT_LIMIT = 110000;
const SCHEMA = 'rockstaros.pixel-runtime-bridge/1';
const RESPONSE = 'rockstaros.pixel-runtime-response/1';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash = /^[a-f0-9]{64}$/;
const check = (value, code) => { if (!value) throw new ExecutorError(code); };
const fields = (value, keys) => check(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort((a,b)=>a.localeCompare(b)).join(',') === [...keys].sort((a,b)=>a.localeCompare(b)).join(','), 'INVALID_RUNTIME_BRIDGE_FRAME');
const notFound = () => ({ schema: RESPONSE, state: 'not_found' });

/** A kernel restart may leave the old pathname behind without its listener.
 * Keep durable stop metadata in the same directory; never unlink or replace a
 * previous listener merely because a new process wants the endpoint.
 */
export function pixelRuntimeSocketPath(directory, bootId) {
  check(typeof bootId === 'string' && uuid.test(bootId), 'INVALID_RUNTIME_BOOT_ID');
  return resolve(directory, `runtime-${bootId}.sock`);
}

/** Private transport only. The existing manager remains the executor/store.
 * Android validates the cloud grant. The guest receives only one bounded local
 * text binding, never the account token, arbitrary code, endpoint or shell.
 */
export async function startPixelRuntimeBridge({ manager, socketPath }) {
  check(['linux', 'darwin'].includes(process.platform) && manager?.executeText && manager?.describeText && manager?.snapshot, 'PRIVATE_RUNTIME_BRIDGE_REQUIRED');
  const path = resolve(socketPath), directory = dirname(path), uid = userInfo().uid;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const dir = await lstat(directory);
  check(dir.isDirectory() && !dir.isSymbolicLink() && dir.uid === uid && (dir.mode & 0o077) === 0, 'PRIVATE_RUNTIME_DIRECTORY_REQUIRED');
  try { await lstat(path); check(false, 'RUNTIME_SOCKET_ALREADY_PRESENT'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const tasks = new Map(), sockets = new Set(); let closed = false, socketIdentity;
  const stopIntents = await openPixelRuntimeStopJournal(directory, { assertOwner: async () => {
    check(!closed && socketIdentity, 'RUNTIME_BRIDGE_CLOSED');
    const current = await lstat(path);
    check(current.isSocket() && current.ino === socketIdentity.ino && current.dev === socketIdentity.dev,
      'RUNTIME_SOCKET_CHANGED');
  } });
  const stopBinding = c => ({ id: c.id, scopeSha256: c.scopeSha256, claimId: c.claimId, requestSha256: c.requestSha256 });
  function matching(c, binding) {
    return c.scopeSha256 === binding?.scopeSha256 && c.claimId === binding?.claimId;
  }
  function locate(c) {
    check(uuid.test(c.id) && uuid.test(c.claimId) && hash.test(c.scopeSha256) && hash.test(c.requestSha256), 'INVALID_RUNTIME_BRIDGE_BINDING');
    const run = manager.snapshot().runs.find(r => r.job.id === c.id);
    if (run) return run.surface === 'runtime' && run.runtimeBinding?.requestSha256 === c.requestSha256 && matching(c, run.runtimeBinding?.hostBinding) ? { run } : null;
    const task = tasks.get(c.id);
    return task && task.requestSha256 === c.requestSha256 && matching(c, task) ? { task } : null;
  }
  async function read(c) {
    const found = locate(c);
    if (!found) return notFound();
    if (!found.run) return { schema: RESPONSE, state: found.task.settled ? 'unknown' : 'starting', id: c.id, requestSha256: c.requestSha256, claimId: c.claimId };
    const r = found.run, base = { schema: RESPONSE, id: c.id, threadId: r.threadId, claimId: c.claimId, requestSha256: c.requestSha256 };
    if (r.stop !== 'none' || r.error || !['active', 'review', 'completed'].includes(r.job.status))
      return { ...base, state: 'unknown', stopConfirmed: r.stop === 'confirmed', text: null };
    if (r.job.status === 'active') return { ...base, state: 'running' };
    check(typeof r.text === 'string' && r.text.trim() && Number.isSafeInteger(r.durationMs) && r.durationMs >= 0, 'RUNTIME_RESULT_INVALID');
    return { ...base, state: 'review', text: r.text, outputSha256: await executionDigest(r.text), durationMs: r.durationMs,
      model: { id: r.agent.modelId, scheme: 'gguf-sha256', sha256: r.modelSha256 } };
  }
  async function handle(c) {
    check(!closed, 'RUNTIME_BRIDGE_CLOSED');
    check(c?.schema === SCHEMA, 'INVALID_RUNTIME_BRIDGE_FRAME');
    if (c.action === 'runtime-capabilities') {
      fields(c, ['schema', 'action']);
      return { schema: RESPONSE, state: 'capabilities', protocol: 1, scopedExecution: true, worker: await manager.describeText() };
    }
    // Opt-in preparation negotiation keeps installed execution clients unchanged.
    // The private host validates account approval; no account token enters guest.
    if (c.action === 'runtime-agent-capabilities') {
      fields(c, ['schema', 'action']);
      check(typeof manager.prepareTextAgent === 'function', 'AGENT_PREPARATION_UNSUPPORTED');
      return {schema: RESPONSE, state: 'agent_capabilities', protocol: 1, pinnedAgentPreparation: true, downloads: false};
    }
    if (c.action === 'runtime-agent-prepare') {
      fields(c, ['schema', 'action', 'request', 'scopeSha256', 'claimId', 'requestSha256', 'authorization']);
      check(typeof manager.prepareTextAgent === 'function', 'AGENT_PREPARATION_UNSUPPORTED');
      check(hash.test(c.scopeSha256) && uuid.test(c.claimId) && hash.test(c.requestSha256), 'INVALID_RUNTIME_BRIDGE_BINDING');
      const r = c.request;
      fields(r, ['id', 'threadId', 'agent', 'model', 'deadline']);
      check(uuid.test(r.id) && uuid.test(r.threadId), 'INVALID_AGENT_PREPARATION');
      const digest = await executionDigest(r);
      check(digest === c.requestSha256, 'COMMAND_DIGEST_MISMATCH');
      const a = c.authorization;
      fields(a, ['scopeSha256', 'preparationId', 'requestSha256', 'permission', 'maximumCostMinor', 'expiresAt']);
      check(a.scopeSha256 === c.scopeSha256 && a.preparationId === r.id && a.requestSha256 === digest &&
        a.permission === 'agent.prepare' && a.maximumCostMinor === 0 && a.expiresAt === r.deadline, 'RUNTIME_AUTHORIZATION_BINDING_MISMATCH');
      check(!closed, 'RUNTIME_BRIDGE_CLOSED');
      const agent = await manager.prepareTextAgent({agent: r.agent, model: r.model, deadline: r.deadline});
      check(!closed, 'RUNTIME_BRIDGE_CLOSED');
      return {schema: RESPONSE, state: 'agent_prepared', id: r.id, threadId: r.threadId, claimId: c.claimId,
        requestSha256: digest, agent, model: {...r.model}};
    }
    // Separate negotiation preserves the strict response shape of installed v1 clients.
    if (c.action === 'runtime-stop-capabilities') {
      fields(c, ['schema', 'action']);
      stopIntents.ready();
      return { schema: RESPONSE, state: 'stop_capabilities', protocol: 1, durableExactBinding: true, contentFreeStatus: true };
    }
    if (c.action === 'runtime-stop-intent') {
      fields(c, ['schema', 'action', 'id', 'scopeSha256', 'claimId', 'requestSha256']);
      const found = locate(c), fenced = stopIntents.fence(stopBinding(c));
      const task = tasks.get(c.id);
      if (found && (!found.run || found.run.job.status === 'active')) task?.controller.abort();
      await fenced;
      if (found?.run && !task && found.run.stop === 'none' && found.run.job.status === 'active')
        await manager.action({ action: 'stop', jobId: c.id });
      // A timed-out run can be terminal while its worker stop is still unconfirmed.
      // Retry only the same fenced binding, through the manager's real stop receipt.
      if (found?.run && found.run.job.status === 'cancelled' && found.run.stop === 'unconfirmed')
        await manager.action({ action: 'stop', jobId: c.id });
      return { schema: RESPONSE, state: 'fenced', id: c.id, claimId: c.claimId,
        requestSha256: c.requestSha256, fenceDurable: true, stopConfirmed: false };
    }
    if (c.action === 'runtime-stop-status') {
      fields(c, ['schema', 'action', 'id', 'scopeSha256', 'claimId', 'requestSha256']);
      const found = locate(c), fenced = stopIntents.has(stopBinding(c));
      let state = !found || !found.run && found.task.settled ? 'stop_absent' : 'stop_pending';
      if (found?.run) {
        if (found.run.stop === 'confirmed') state = 'stop_confirmed';
        else if (found.run.stop === 'none' && !found.run.error && ['review', 'completed'].includes(found.run.job.status)) state = 'stop_finished';
        else if (found.run.stop === 'unconfirmed' || found.run.error) state = 'stop_unknown';
      }
      return { schema: RESPONSE, state, id: c.id, claimId: c.claimId, requestSha256: c.requestSha256,
        fenceDurable: fenced, stopConfirmed: state === 'stop_confirmed' };
    }
    if (c.action === 'runtime-read' || c.action === 'runtime-cancel') {
      fields(c, ['schema', 'action', 'id', 'scopeSha256', 'claimId', 'requestSha256']);
      if (c.action === 'runtime-read') return read(c);
      const found = locate(c);
      if (!found) return notFound();
      const task = tasks.get(c.id);
      if (!found.run || found.run.job.status === 'active') task?.controller.abort();
      if (!task && found.run && found.run.stop === 'none' && found.run.job.status === 'active')
        await manager.action({ action: 'stop', jobId: c.id });
      return { schema: RESPONSE, state: 'cancel_requested', id: c.id, claimId: c.claimId, requestSha256: c.requestSha256, stopConfirmed: false };
    }
    check(c.action === 'runtime-start', 'INVALID_RUNTIME_BRIDGE_ACTION');
    await manager.assertExecutionAllowed?.();
    fields(c, ['schema', 'action', 'request', 'scopeSha256', 'claimId', 'requestSha256', 'authorization']);
    check(hash.test(c.scopeSha256) && uuid.test(c.claimId) && hash.test(c.requestSha256), 'INVALID_RUNTIME_BRIDGE_BINDING');
    const request = parseLocalTextRequest(c.request), digest = await executionDigest(request);
    check(digest === c.requestSha256, 'COMMAND_DIGEST_MISMATCH');
    const a = c.authorization;
    fields(a, ['scopeSha256', 'jobId', 'requestSha256', 'executorId', 'permission', 'maximumCostMinor', 'expiresAt']);
    check(a.scopeSha256 === c.scopeSha256 && a.jobId === request.id && a.requestSha256 === digest && a.executorId === 'pixel-linux-gguf' && a.permission === 'text.generate' && a.maximumCostMinor === 0 && a.expiresAt === request.deadline, 'RUNTIME_AUTHORIZATION_BINDING_MISMATCH');
    check(!closed, 'RUNTIME_BRIDGE_CLOSED');
    const lookup = { ...c, id: request.id };
    check(!stopIntents.has(stopBinding(lookup)), 'RUNTIME_EXECUTION_FENCED');
    const prior = locate(lookup);
    if (prior) return read(lookup);
    check(!tasks.has(request.id) && !manager.snapshot().runs.some(r => r.job.id === request.id), 'REQUEST_ID_CONFLICT');
    check(tasks.size < 100, 'RUNTIME_BRIDGE_RECORD_LIMIT');
    await stopIntents.reserve(stopBinding(lookup));
    // A stop, another start or bridge shutdown may arrive during the fsync.
    check(!closed, 'RUNTIME_BRIDGE_CLOSED');
    check(!stopIntents.has(stopBinding(lookup)), 'RUNTIME_EXECUTION_FENCED');
    const admitted = locate(lookup);
    if (admitted) return read(lookup);
    check(!tasks.has(request.id) && !manager.snapshot().runs.some(r => r.job.id === request.id), 'REQUEST_ID_CONFLICT');
    check(tasks.size < 100, 'RUNTIME_BRIDGE_RECORD_LIMIT');
    const task = { scopeSha256: c.scopeSha256, claimId: c.claimId, requestSha256: digest, controller: new AbortController(), settled: false };
    tasks.set(request.id, task);
    task.promise = manager.executeText(request, task.controller.signal, { scopeSha256: c.scopeSha256, claimId: c.claimId }).then(() => { task.settled = true; }, () => { task.settled = true; });
    return { schema: RESPONSE, state: 'starting', id: request.id, claimId: c.claimId, requestSha256: digest };
  }
  const server = createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
    socket.setTimeout(15000, () => socket.destroy());
    let body = Buffer.alloc(0), dispatched = false;
    const send = value => {
      if (socket.destroyed) return;
      const encoded = Buffer.from(JSON.stringify(value) + '\n');
      if (encoded.length > OUTPUT_LIMIT) return socket.destroy();
      socket.end(encoded);
    };
    socket.on('data', bytes => {
      if (dispatched) return;
      body = Buffer.concat([body, bytes]);
      if (body.length > INPUT_LIMIT) { dispatched = true; send({ schema: RESPONSE, error: 'RUNTIME_BRIDGE_FRAME_TOO_LARGE' }); return; }
      const end = body.indexOf(10);
      if (end < 0) return;
      dispatched = true;
      void (async () => {
        try { check(end === body.length - 1, 'INVALID_RUNTIME_BRIDGE_FRAME'); send(await handle(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body.subarray(0, end))))); }
        catch (error) { send({ schema: RESPONSE, error: error instanceof ExecutorError ? error.code : 'RUNTIME_BRIDGE_UNAVAILABLE' }); }
      })();
    });
  });
  try {
    await new Promise((done, fail) => { server.once('error', fail); server.listen(path, done); });
    await chmod(path, 0o600); socketIdentity = await lstat(path);
  } catch (error) { server.close(); await stopIntents.close(); throw error; }
  let closePromise;
  return Object.freeze({
    socketPath: path,
    close: () => closePromise ??= (async () => {
      closed = true;
      for (const [id, task] of tasks) {
        const run = manager.snapshot().runs.find(r => r.job.id === id);
        if (!run || run.job.status === 'active') task.controller.abort();
      }
      for (const socket of sockets) socket.destroy();
      await new Promise(done => server.close(done));
      await stopIntents.close();
      try { const current = await lstat(path); check(current.ino === socketIdentity.ino && current.dev === socketIdentity.dev, 'RUNTIME_SOCKET_CHANGED'); await unlink(path); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    })(),
  });
}
