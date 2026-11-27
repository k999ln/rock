// Foreground Linux participant. Eve requires a separately enabled, bundled program.
// Place the downloaded artifacts next to this file. Requires Node 22+.
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
export const EVE_WORKLOAD = 'eve-agent-chain-v1';
export const EVE_DIGEST = 'f55ce73ace6e469e945e223d5533afac296228ecfb9deced2f811c93c0e7b066';
const WIRE_LIMIT = 32 * 1024;
const RECIPE_TEXT_LIMIT = 4 * 1024;
const RESULT_LIMIT = 12 * 1024;
const API = 'https://avoado.si/api/noah/shared-compute';
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const JOB_LIMIT_MS = 750;
const POLL_MS = 5_000;
const REPLY_LIMIT = 4096;

async function readArtifact(name, expected, maxBytes) {
  const file = await open(new URL(name, import.meta.url), 'r');
  try {
    const { size } = await file.stat();
    if (size < 1 || size > maxBytes) throw new Error('配布ファイルのサイズを確認できません。');
    const bytes = Buffer.alloc(size);
    const { bytesRead } = await file.read(bytes, 0, size, 0);
    if (bytesRead !== size || createHash('sha256').update(bytes).digest('hex') !== expected)
      throw new Error('配布ファイルの版が一致しません。');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } finally {
    await file.close();
  }
}

export async function loadModel() {
  return JSON.parse(await readArtifact('./model.json', MODEL_SHA256, 8192));
}

export function loadEveAgents() {
  return readArtifact('./eve-agents.mjs', EVE_DIGEST, 128 * 1024);
}

// Requesters can send four bounded dictionary counts from public material, or a built-in example ID.
function inputFeatures(model, sampleId) {
  if (typeof sampleId !== 'string') return null;
  if (sampleId.startsWith('terms-')) {
    if (sampleId.length > 17) return null;
    const parts = sampleId.slice(6).split('.');
    if (parts.length !== 4) return null;
    const counts = parts.map(Number);
    if (!counts.every((n, i) => Number.isInteger(n) && n >= 0 && n <= 15 && String(n) === parts[i])) return null;
    return counts.some(n => n > 0) ? counts : null;
  }
  const sample = model.samples.find(entry => entry.id === sampleId);
  if (!sample) return null;
  const words = sample.text.toLowerCase().match(/[a-z]+/g) ?? [];
  return model.terms.map(group => words.reduce((n, word) => n + Number(group.includes(word)), 0));
}

// The one-job WASM isolate sees only the approved model parameters and four integers.
async function classify({ features, classes, dot4Wasm }) {
  const { instance } = await WebAssembly.instantiate(Buffer.from(dot4Wasm, 'hex'), {});
  let winner;
  for (const entry of classes) {
    const score = instance.exports.dot4(...features, ...entry.weights);
    if (!winner || score > winner.score) winner = { label: entry.label, score };
  }
  return winner;
}

export function runSample(model, sampleId, signal) {
  signal.throwIfAborted();
  const features = inputFeatures(model, sampleId);
  if (!features) throw new Error('対象外の分類入力です。');
  return isolatedWork({ kind: 'sample', features, classes: model.classes, dot4Wasm: model.dot4Wasm }, signal);
}

function isolatedWork(data, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), {
      workerData: data, env: {}, execArgv: data.kind === 'eve' ? ['--experimental-vm-modules', '--no-warnings'] : [],
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

function validRecipeSize(recipe) {
  return recipe && typeof recipe.source === 'string' && Buffer.byteLength(recipe.source) <= RECIPE_TEXT_LIMIT
    && Buffer.byteLength(JSON.stringify(recipe)) <= WIRE_LIMIT;
}

export function runEveRecipe(program, recipe, signal) {
  if (typeof program !== 'string' || !validRecipeSize(recipe)) throw new Error('Agentの入力サイズを確認してください。');
  return isolatedWork({ kind: 'eve', program, recipe }, signal);
}

async function executeEve({ program, recipe }) {
  if (createHash('sha256').update(program).digest('hex') !== EVE_DIGEST) throw new Error('Agentの版が一致しません。');
  const { SourceTextModule, createContext, runInContext } = await import('node:vm');
  const context = createContext({ URL, TextEncoder, recipeJson: JSON.stringify(recipe) }, {
    codeGeneration: { strings: false, wasm: false },
  });
  const allowed = new SourceTextModule(program, { context });
  await allowed.link(() => { throw new Error('Agentの外部依存は利用できません。'); });
  await allowed.evaluate({ timeout: JOB_LIMIT_MS });
  // Only the pinned entry point receives JSON data. No API, cookie, device token, file or network interface enters this context.
  context.runEveAgents = allowed.namespace.runEveAgents;
  const result = JSON.parse(runInContext('JSON.stringify(runEveAgents(JSON.parse(recipeJson)))', context, { timeout: JOB_LIMIT_MS }));
  if (typeof result?.text !== 'string' || Buffer.byteLength(result.text) > RESULT_LIMIT || !Array.isArray(result.steps))
    throw new Error('Agentの結果を確認できません。');
  return result;
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
    const limit = action === 'claim' && data.workloads?.includes(EVE_WORKLOAD) ? WIRE_LIMIT : REPLY_LIMIT;
    if (requestBytes > WIRE_LIMIT || used + requestBytes + limit > maxBytes) throw new Error('通信枠の上限です。');
    used += requestBytes + limit;
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
        if (size > limit) {
          await reader.cancel();
          throw new Error('応答が大きすぎます。');
        }
        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }
    used -= limit - size;
    if (!response.ok) throw new Error('参加受付が停止しました (HTTP ' + response.status + ')。');
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  };
}

function leaseRemaining(lease) {
  const expires = typeof lease.expiresAt === 'number' ? lease.expiresAt : Date.parse(lease.expiresAt);
  return Math.min(3500, expires - Date.now() - 150);
}

export async function processLease({ lease, model, eveProgram, api, eligible, signal, compute = runSample }) {
  const ids = { jobId: lease.jobId, leaseId: lease.leaseId };
  const remaining = leaseRemaining(lease);
  const eve = lease.workload === EVE_WORKLOAD;
  if (!Number.isFinite(remaining) || remaining < JOB_LIMIT_MS) return false;
  if (eve) {
    if (!eveProgram || lease.artifactSha256 !== EVE_DIGEST || !validRecipeSize(lease.recipe)) return false;
  } else if (lease.workload !== VERSION || lease.artifactSha256 !== MODEL_SHA256 || !inputFeatures(model, lease.sampleId)) return false;
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
    const result = eve ? await runEveRecipe(eveProgram, lease.recipe, local) : await compute(model, lease.sampleId, local);
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
  for (let i = 0; i < argv.length;) {
    const key = argv[i++];
    if (key === '--eve') { out.eve = true; continue; }
    const value = argv[i++];
    if (key === '--device' && UUID.test(value ?? '')) { out.deviceId = value; continue; }
    if (!limits[key] || !/^\d+$/.test(value ?? '')) throw new Error('参加端末のIDと利用上限を確認してください。');
    const [field, max] = limits[key];
    if (Number(value) < 1 || Number(value) > max) throw new Error('利用上限の範囲を超えています。');
    out[field] = Number(value);
  }
  if (!out.deviceId) throw new Error('使い方: node runner.mjs --device <端末ID> [--eve] [--minutes 1..15] [--max-jobs 1..30] [--max-kib 1..256]');
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
  const eveProgram = config.eve ? await loadEveAgents() : null;
  if (eveProgram) process.stderr.write('Eve参加: 他の利用者が同意して送った公開原稿を、この端末の電力・通信で加工します。Ctrl-Cで停止します。\n');
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
      const { lease } = await api('claim', eveProgram ? { workloads: [EVE_WORKLOAD] } : {}, signal);
      if (lease) {
        leases++;
        const completed = await processLease({ lease, model, eveProgram, api, eligible, signal });
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
  parentPort.postMessage(workerData.kind === 'eve' ? await executeEve(workerData) : await classify(workerData));
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return;
    process.stderr.write(String(error.message) + '\n');
    process.exitCode = 1;
  });
}
