// Linux foreground participant for the fixed, synthetic public-topic-v1 workload.
// Download runner.mjs and model.json into the same directory. Requires Node 22+.
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { open, readFile, readdir } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';
import { Writable } from 'node:stream';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const runCommand = promisify(execFile);
const MODEL_SHA256 = 'c76d26657b9dc9697400af2b6cc063fe44448df227427c6b8b7a426b992bcfdb';
const VERSION = 'public-topic-v1';
const API = 'https://avoado.si/api/noah/shared-compute';
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const JOB_LIMIT_MS = 750;
const POLL_MS = 5_000;
const REPLY_LIMIT = 4096;

export async function loadModel() {
  const file = await open(new URL('./model.json', import.meta.url), 'r');
  try {
    const { size } = await file.stat();
    if (size < 1 || size > 8192) throw new Error('モデルのサイズを確認できません。');
    const bytes = Buffer.alloc(size);
    const { bytesRead } = await file.read(bytes, 0, size, 0);
    if (bytesRead !== size || createHash('sha256').update(bytes).digest('hex') !== MODEL_SHA256)
      throw new Error('モデルの版が一致しません。');
    return JSON.parse(bytes);
  } finally {
    await file.close();
  }
}

// This is a no-import, no-memory WASM dot product. No job can supply text, a module, a URL,
// a filesystem path or a callback. A fresh one-thread isolate handles exactly one sample.
async function classify({ model, sampleId }) {
  const sample = model.samples.find(entry => entry.id === sampleId);
  if (!sample) throw new Error('対象外のサンプルです。');
  const words = sample.text.toLowerCase().match(/[a-z]+/g) ?? [];
  const features = model.terms.map(group => words.reduce((n, word) => n + Number(group.includes(word)), 0));
  const { instance } = await WebAssembly.instantiate(Buffer.from(model.dot4Wasm, 'hex'), {});
  let winner;
  for (const entry of model.classes) {
    const score = instance.exports.dot4(...features, ...entry.weights);
    if (!winner || score > winner.score) winner = { label: entry.label, score };
  }
  return winner;
}

export function runSample(model, sampleId, signal) {
  signal.throwIfAborted();
  if (!model.samples.some(sample => sample.id === sampleId)) throw new Error('対象外のサンプルです。');
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), {
      workerData: { model, sampleId }, env: {}, execArgv: [],
      resourceLimits: { maxOldGenerationSizeMb: 12, maxYoungGenerationSizeMb: 4, stackSizeMb: 2 },
    });
    let stopped = false;
    let result;
    const stop = () => {
      stopped = true;
      void worker.terminate();
    };
    signal.addEventListener('abort', stop, { once: true });
    const deadline = setTimeout(stop, JOB_LIMIT_MS);
    worker.once('error', reject);
    worker.once('message', value => { result = value; });
    worker.once('exit', code => {
      clearTimeout(deadline);
      signal.removeEventListener('abort', stop);
      if (stopped || code !== 0 || !result) reject(new Error('端末の処理を停止しました。'));
      else resolve(result);
    });
  });
}

async function command(file, args, signal) {
  const { stdout } = await runCommand(file, args, {
    encoding: 'utf8', timeout: 800, maxBuffer: 8192, signal,
    env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' },
  });
  return stdout.trim();
}

const readValue = async path => (await readFile(path, 'utf8')).trim();

export async function eligibleLinux({
  platform = process.platform, list = readdir, read = readValue, execute = command, signal,
} = {}) {
  if (platform !== 'linux') return false;
  try {
    const supplies = await list('/sys/class/power_supply');
    let onAc = false;
    for (const supply of supplies) {
      const base = '/sys/class/power_supply/' + supply;
      if (await read(base + '/type') === 'Mains' && await read(base + '/online') === '1') onAc = true;
    }
    if (!onAc) return false;
    const profile = await execute('/usr/bin/powerprofilesctl', ['get'], signal);
    if (!['performance', 'balanced'].includes(profile)) return false;

    // Check CPU package thermal zones. Missing/unsupported/unreadable readings fail closed.
    const zones = (await list('/sys/class/thermal')).filter(name => /^thermal_zone\d+$/.test(name));
    let cpuMeasured = false;
    for (const zone of zones) {
      const base = '/sys/class/thermal/' + zone;
      const type = await read(base + '/type');
      if (!/^(x86_pkg_temp|cpu[-_]thermal|cpu[-_]thermal[-_]zone)$/i.test(type)) continue;
      const temp = await read(base + '/temp');
      if (!/^\d+$/.test(temp) || Number(temp) < 1000 || Number(temp) >= 70_000) return false;
      cpuMeasured = true;
    }
    if (!cpuMeasured) return false;

    // NetworkManager supplies connected default routes for BOTH address families.
    // Reject ambiguous / guessed metering and VPNs without a verified upstream interface.
    const devices = await execute('/usr/bin/nmcli', ['-t', '-e', 'no', '-f', 'DEVICE,TYPE,STATE', 'device', 'status'], signal);
    const active = devices.split('\n').map(row => row.split(':')).filter(parts => parts[2]?.startsWith('connected') && parts[1] !== 'loopback');
    if (!active.length) return false;
    for (const [name, type] of active) {
      if (!/^[a-zA-Z0-9_.-]{1,32}$/.test(name) || !['wifi', 'ethernet'].includes(type)) return false;
      const metered = await execute('/usr/bin/nmcli', ['-g', 'GENERAL.METERED', 'device', 'show', name], signal);
      if (metered !== 'no') return false;
    }
    const defaults = await Promise.all(['-4','-6'].map(flag => execute('/usr/sbin/ip', ['-j', flag, 'route', 'show', 'default'], signal)));
    const routes = defaults.flatMap(value => JSON.parse(value));
    return routes.length > 0 && routes.every(route => active.some(([name]) => name === route.dev));
  } catch {
    return false;
  }
}

export function makeApi({ deviceId, token, maxBytes, request = fetch }) {
  let used = 0;
  return async (action, data, signal) => {
    const body = JSON.stringify({ ...data, action, deviceId, deviceToken: token });
    // Reserve a full response before transmitting. Counts application payload bytes; TLS/HTTP
    // framing belongs to the OS and is not estimated as service data.
    const requestBytes = Buffer.byteLength(body);
    if (used + requestBytes + REPLY_LIMIT > maxBytes) throw new Error('通信枠の上限です。');
    used += requestBytes + REPLY_LIMIT;
    const response = await request(API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]),
    });
    const reader = response.body?.getReader();
    if (!reader) throw new Error('応答を受け取れませんでした。');
    let size = 0;
    const chunks = [];
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > REPLY_LIMIT) {
          await reader.cancel();
          throw new Error('応答が大きすぎます。');
        }
        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }
    used -= REPLY_LIMIT - size;
    if (!response.ok) throw new Error('参加受付が停止しました (HTTP ' + response.status + ')。');
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  };
}

function leaseRemaining(lease) {
  const expires = typeof lease.expiresAt === 'number' ? lease.expiresAt : Date.parse(lease.expiresAt);
  return Math.min(3500, expires - Date.now() - 150);
}

export async function processLease({ lease, model, api, eligible, signal, compute = runSample }) {
  const ids = { jobId: lease.jobId, leaseId: lease.leaseId };
  const remaining = leaseRemaining(lease);
  if (lease.workload !== VERSION || lease.artifactSha256 !== MODEL_SHA256 || !model.samples.some(sample => sample.id === lease.sampleId)
    || !Number.isFinite(remaining) || remaining < JOB_LIMIT_MS) return false;
  const local = AbortSignal.any([signal, AbortSignal.timeout(Math.floor(remaining))]);
  let completed = false;
  try {
    if (!(await eligible(local))) return false;
    // A fresh heartbeat confirms consent and ownership immediately before a sub-second job.
    const heartbeat = await api('heartbeat', ids, local);
    const refreshed = leaseRemaining(heartbeat);
    if (!Number.isFinite(refreshed) || refreshed < JOB_LIMIT_MS) return false;
    local.throwIfAborted();
    const start = performance.now();
    const result = await compute(model, lease.sampleId, local);
    const elapsedMs = Math.ceil(performance.now() - start);
    local.throwIfAborted();
    if (elapsedMs > JOB_LIMIT_MS || !(await eligible(local))) return false;
    await api('complete', { ...ids, result, elapsedMs }, local);
    completed = true;
    return true;
  } finally {
    // Release is best effort. The server's short lease also expires if offline or stopped.
    if (!completed && !signal.aborted) {
      await api('release', ids, AbortSignal.any([signal, AbortSignal.timeout(800)])).catch(() => {});
    }
  }
}

function options(argv) {
  const out = { minutes: 15, maxJobs: 30, maxKiB: 256 };
  const limits = { '--minutes': ['minutes', 15], '--max-jobs': ['maxJobs', 30], '--max-kib': ['maxKiB', 256] };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i], value = argv[i + 1];
    if (key === '--device' && UUID.test(value ?? '')) { out.deviceId = value; continue; }
    if (!limits[key] || !/^\d+$/.test(value ?? '')) throw new Error('参加端末のIDと利用上限を確認してください。');
    const [field, max] = limits[key];
    if (Number(value) < 1 || Number(value) > max) throw new Error('利用上限の範囲を超えています。');
    out[field] = Number(value);
  }
  if (!out.deviceId) throw new Error('使い方: node runner.mjs --device <端末ID> [--minutes 1..15] [--max-jobs 1..30] [--max-kib 1..256]');
  return out;
}

async function readSecret(signal) {
  process.stderr.write('参加画面の端末トークンを貼り付けて Enter: ');
  const muted = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const input = createInterface({ input: process.stdin, output: muted, terminal: !!process.stdin.isTTY, historySize: 0 });
  try {
    const token = await new Promise((resolve, reject) => {
      signal.throwIfAborted();
      signal.addEventListener('abort', () => reject(new Error('停止しました。')), { once: true });
      input.once('line', line => resolve(line.trim()));
      input.once('close', () => reject(new Error('トークンの入力を終了しました。')));
    });
    if (!UUID.test(token)) throw new Error('端末トークンを確認してください。');
    return token;
  } finally { input.close(); process.stderr.write('\n'); }
}

async function main() {
  const config = options(process.argv.slice(2));
  if (!(await eligibleLinux())) throw new Error('参加条件を確認できません。Linux、AC電源、CPU温度70℃未満、省電力オフ、従量制「いいえ」の接続を確認してください。');
  const model = await loadModel();
  const stop = new AbortController();
  const interrupt = () => stop.abort();
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  try {
    const token = await readSecret(stop.signal);
    const signal = AbortSignal.any([stop.signal, AbortSignal.timeout(config.minutes * 60_000)]);
    const api = makeApi({ ...config, token, maxBytes: config.maxKiB * 1024 });
    const eligible = signal => eligibleLinux({ signal });
    let leases = 0;
    process.stderr.write('参加中です。Ctrl-Cで停止します。\n');
    while (!signal.aborted && leases < config.maxJobs) {
      if (!(await eligible(signal))) break;
      const { lease } = await api('claim', {}, signal);
      if (lease) {
        leases++;
        const completed = await processLease({ lease, model, api, eligible, signal });
        if (!completed) break;
        process.stderr.write('検収に提出しました。\n');
      }
      if (leases < config.maxJobs) await sleep(POLL_MS, undefined, { signal });
    }
  } finally {
    stop.abort();
    process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
  }
}

if (!isMainThread) {
  parentPort.postMessage(await classify(workerData));
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return;
    process.stderr.write(String(error.message) + '\n');
    process.exitCode = 1;
  });
}
