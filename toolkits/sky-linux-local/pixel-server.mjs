import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { readFile, writeFile, mkdir, open, rename, unlink, lstat } from 'node:fs/promises';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createLinuxLocalManager } from '../../scripts/sky-linux-local-runtime.mjs';
import { isLocalRuntimeHost, isLocalRuntimeRequest } from '../../lib/sky-private-loopback.mjs';

if (process.platform !== 'linux' || process.arch !== 'arm64') throw new Error('Pixel内Linuxで起動してください。');
const base = join(homedir(), 'sky-private');
const root = join(base, 'app');
const port = 5199;
function execute(args, { input, timeout = 240000, signal, onProgress } = {}) {
  // Separate single-writer evidence for the Python worker parent. Never save stdin/env.
  const mono = () => process.hrtime.bigint().toString();
  let evidence = null, evidenceDirectory = null, writes = Promise.resolve();
  try {
    if (args.length === 3 && args[0] === 'python3' && args[1] === join(base, 'worker.py') && args[2] === 'run' &&
        typeof input === 'string' && Buffer.byteLength(input) <= 32000) {
      const data = JSON.parse(input);
      if (typeof data.jobId === 'string' && /^[a-f0-9-]{36}$/.test(data.jobId)) {
        const meta = text => typeof text === 'string' ? { bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex') } : null;
        evidenceDirectory = join(base, 'jobs', data.jobId);
        evidence = { schema: 'rockstaros.pixel-worker-parent-diagnostics/1', evidenceOnly: true, jobId: data.jobId,
          observationId: randomUUID(),
          clock: 'Node process.hrtime; compare durations within this record, not absolute Python timestamps',
          input: meta(data.input), instructions: meta(data.instructions),
          modelSha256: /^[a-f0-9]{64}$/.test(data.modelSha256) ? data.modelSha256 : null,
          requestedTimeoutMs: timeout, deadlineEpochMs: Number.isSafeInteger(data.deadline) ? data.deadline : null,
          maxOutputTokens: Number.isSafeInteger(data.maxOutputTokens) ? data.maxOutputTokens : null,
          spawnRequestedMonotonicNs: mono(), terminalObserved: false };
      }
    }
  } catch { /* Diagnostics cannot authorize or prevent an existing execution. */ }
  const persistEvidence = () => {
    if (!evidence) return;
    const raw = JSON.stringify(evidence);
    if (Buffer.byteLength(raw) > 8192) return;
    writes = writes.then(async () => {
      let temporary;
      try {
        const uid = userInfo().uid;
        // Require the existing private base, and private owned job directories.
        const info = await lstat(base);
        if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== uid || (info.mode & 0o077)) return;
        await mkdir(evidenceDirectory, { recursive: true, mode: 0o700 });
        for (const path of [join(base, 'jobs'), evidenceDirectory]) {
          const stat = await lstat(path);
          if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== uid || (stat.mode & 0o077)) return;
        }
        // A restarted/duplicate launcher must not replace an earlier job's evidence.
        const owner = join(evidenceDirectory, 'parent-diagnostics.owner');
        let claim, created = false, ownerIdentity;
        try {
          claim = await open(owner, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK);
        } catch (error) {
          if (error.code !== 'ENOENT') return;
          // Exclusive creation fails closed if another observer wins this race.
          claim = await open(owner, 'wx', 0o600);
          created = true;
        }
        try {
          const stat = await claim.stat();
          if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== uid || (stat.mode & 0o077) || stat.size !== (created ? 0 : 36)) return;
          if (created) {
            await claim.writeFile(evidence.observationId);
            await claim.sync();
          } else {
            const bytes = Buffer.alloc(37);
            const { bytesRead } = await claim.read(bytes, 0, bytes.length, 0);
            if (bytesRead !== 36 || bytes.subarray(0, bytesRead).toString('utf8') !== evidence.observationId) return;
          }
          ownerIdentity = await claim.stat();
        } finally { await claim.close(); }
        temporary = join(evidenceDirectory, `.parent-diagnostics-${randomUUID()}`);
        const file = await open(temporary, 'wx', 0o600);
        try { await file.writeFile(raw); await file.sync(); } finally { await file.close(); }
        // A replaced owner name must not let an older observer publish over it.
        const currentOwner = await lstat(owner);
        if (!currentOwner.isFile() || currentOwner.isSymbolicLink() || currentOwner.nlink !== 1 ||
            currentOwner.uid !== uid || (currentOwner.mode & 0o077) || currentOwner.size !== 36 ||
            currentOwner.dev !== ownerIdentity.dev || currentOwner.ino !== ownerIdentity.ino) return;
        await rename(temporary, join(evidenceDirectory, 'parent-diagnostics.json'));
        const directory = await open(evidenceDirectory, 'r');
        try { await directory.sync(); } finally { await directory.close(); }
      } catch { /* Missing evidence stays unknown; job/error routing is unchanged. */ }
      finally { if (temporary) await unlink(temporary).catch(() => {}); }
    }).catch(() => {});
  };
  const child = spawn(args[0], args.slice(1), { stdio: ['pipe', 'pipe', 'pipe'], env: process.env, detached: true });
  if (evidence) { evidence.workerPid = child.pid ?? null; persistEvidence(); }
  const terminate = reason => {
    if (evidence) evidence[`${reason}RequestedMonotonicNs`] ??= mono();
    try { process.kill(-child.pid, 'SIGTERM'); if (evidence) evidence.sigtermSent = true; }
    catch { /* Already exited. A requested signal is not an observed exit cause. */ }
    persistEvidence();
  };
  const abort = () => terminate('abort');
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const promise = new Promise((resolve, reject) => {
    let text = '', error = '', pending = '';
    const timer = setTimeout(() => terminate('timeout'), timeout);
    child.stdout.on('data', chunk => { text += chunk; pending += chunk; if (text.length > 150000) abort();
      const lines = pending.split('\n'); pending = lines.pop();
      for (const line of lines) { try { const v = JSON.parse(line); if (v.progress) onProgress?.(v.progress); } catch { /* Final result checked by prepare. */ } }
    });
    child.stderr.on('data', chunk => { error = (error + chunk).slice(-4000); });
    child.on('error', e => {
      if (evidence) {
        evidence.spawnErrorObservedMonotonicNs = mono();
        evidence.spawnErrorCode = typeof e.code === 'string' && /^[A-Z0-9_]{1,40}$/.test(e.code) ? e.code : null;
        persistEvidence();
      }
      clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(e);
    });
    child.on('close', (code, exitSignal) => {
      if (evidence) {
        evidence.terminalObserved = true; evidence.closeObservedMonotonicNs = mono();
        evidence.returnCode = code; evidence.signal = exitSignal ?? null;
        evidence.signalOrigin = 'unknown; timeout/abort request timestamps do not attest the exit cause';
        persistEvidence();
      }
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      let message = '端末内Linuxの処理が完了しませんでした。空き容量・通信・選んだAIを確認してください。';
      try { const result = JSON.parse(text.trim().split('\n').at(-1)); if (typeof result.error === 'string') message = result.error.slice(0, 300); } catch { /* Keep plain fallback. */ }
      if (code === 0) resolve(text.trim()); else reject(new Error(message, { cause: error }));
    });
    child.stdin.on('error', () => {}); child.stdin.end(input);
  });
  return { child, promise };
}
const manager = await createLinuxLocalManager({ root, stateDir: join(base, 'state'), environment: {
  id: 'pixel-linux', spawn: execute, bootId: (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim(),
  phaseLabels: { stopped: 'AIの実行を停止しました。成果とSkyの画面は残っています' },
  async prepare(lock, worker, options) {
    const raw = await execute(['python3', join(root, 'toolkits/sky-linux-local/prepare-pixel.py'), '--progress'], { ...options, input: JSON.stringify(lock.model), timeout: 900000 }).promise;
    const result = JSON.parse(raw.split('\n').at(-1));
    if (result.error) throw new Error(result.error);
    return result;
  },
  async stop() {
    const result = JSON.parse(await execute(['python3', join(base, 'worker.py'), 'stop-all'], { timeout: 30000 }).promise);
    if (!result.confirmed) throw new Error('端末内のAIを停止できたか確認できません。');
  },
} });
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']], ['/sky', ['index.html', 'text/html; charset=utf-8']], ['/eve', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']], ['/app.css', ['app.css', 'text/css; charset=utf-8']],
]);
const server = createServer(async (request, response) => {
  const send = (status, value, type = 'application/json; charset=utf-8') => {
    response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" });
    response.end(type.startsWith('application/json') ? JSON.stringify(value) : value);
  };
  // A top-level Android browser intent can be cross-site. Static files carry no
  // owner data; mutations below still require matching Origin/Host and Fetch Site.
  if (!isLocalRuntimeHost(request, port)) return send(403, { error: 'このPixelのSkyから操作してください。' });
  const path = request.url?.split('?')[0];
  if (assets.has(path) && request.method === 'GET') {
    const [name, type] = assets.get(path); return send(200, await readFile(join(root, 'ui', name)), type);
  }
  if (path !== '/__sky/linux' || request.method !== 'POST' || request.headers['content-type'] !== 'application/json' || !isLocalRuntimeRequest(request, port)) return send(404, { error: 'この操作は利用できません。' });
  try {
    let body = '';
    for await (const chunk of request) { body += chunk; if (Buffer.byteLength(body) > 32000) return send(413, { error: '入力が長すぎます。' }); }
    return send(200, await manager.action(JSON.parse(body)));
  } catch (error) { return send(400, { error: error.message }); }
});
let closing = false;
async function close() { if (closing) return; closing = true; await manager.close(); server.closeAllConnections(); server.close(); }
process.on('SIGINT', () => void close()); process.on('SIGTERM', () => void close());
server.listen(port, '127.0.0.1', async () => {
  await mkdir(base, { recursive: true, mode: 0o700 });
  await writeFile(join(base, 'server.pid'), String(process.pid), { mode: 0o600 });
  console.log('SkyはこのPixel内の http://127.0.0.1:5199/ で使えます。');
});
