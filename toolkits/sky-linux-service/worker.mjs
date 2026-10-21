import { readFile, writeFile, mkdir, realpath, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createPrivateKey, createHash, sign, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'linux') throw new Error('Dedicated Linux required');
if (process.getuid?.() === 0) throw new Error('Use a dedicated non-root workspace user');
const origin = new URL(process.env.SKY_LINUX_BROKER_ORIGIN ?? '');
if (
  origin.protocol !== 'https:' ||
  origin.username ||
  origin.password ||
  origin.pathname !== '/'
)
  throw new Error('Exact HTTPS broker origin required');
const workspaceId = process.env.SKY_LINUX_WORKSPACE_ID,
  keyId = process.env.SKY_LINUX_WORKER_KEY_ID;
if (!workspaceId || !keyId) throw new Error('Workspace assignment required');
const keyPath = await realpath(process.env.SKY_LINUX_WORKER_KEY_FILE);
if (!keyPath.startsWith(homedir() + '/.config/') || ((await stat(keyPath)).mode & 0o077))
  throw new Error('Worker key must be a private 0600 file under ~/.config/');
const privateKey = createPrivateKey(await readFile(keyPath));
const script = fileURLToPath(new URL('./metered-worker.py', import.meta.url));
const outbox = join(homedir(), 'sky-private', 'service-outbox');
await mkdir(outbox, { recursive: true, mode: 0o700 });
async function post(body) {
  const response = await fetch(new URL('/api/internal/sky/linux', origin), {
    method: 'POST',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(`Broker ${response.status}; no automatic job resubmission`);
  return response.json();
}
async function request(action, fields = {}) {
  const request = {
    schema: 'sky.linux-worker-request/1',
    workspaceId,
    issuedAt: Date.now(),
    action,
    ...fields,
  };
  const signature = sign(
    null,
    Buffer.from(`sky.linux-worker-request/1:live:${JSON.stringify(request)}`),
    privateKey,
  ).toString('base64url');
  return post({ keyId, request, signature });
}
function runPython(action, input) {
  const child = spawn('/usr/bin/python3', [script, action], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { PATH: '/usr/bin:/bin', HOME: homedir(), LANG: 'C.UTF-8' },
    detached: true,
  });
  const promise = new Promise((resolve, reject) => {
    let output = '',
      errors = '';
    child.stdout.on('data', (b) => {
      output += b;
      if (output.length > 100000) child.kill('SIGTERM');
    });
    child.stderr.on('data', (b) => {
      errors = (errors + b).slice(-1000);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0)
        reject(
          new Error(
            `Linux worker failed (${code}); output held for operator reconciliation`,
            { cause: errors },
          ),
        );
      else {
        try {
          resolve(JSON.parse(output));
        } catch (error) {
          reject(error);
        }
      }
    });
    child.stdin.end(JSON.stringify(input));
  });
  return { child, promise };
}
const { workspace: initial, setup } = await request('status');
if (setup?.requestedAt && !setup.verifiedAt) {
  const probe = await runPython('probe', {}).promise;
  await request('setup-ready', {
    contractDigest: initial.payload.contractDigest,
    setupChallenge: setup.challenge,
    probeSha256: createHash('sha256').update(JSON.stringify(probe)).digest('hex'),
  });
}
const queued = initial.payload.jobs.find((j) => j.state === 'queued');
if (!queued) {
  console.log('No queued jobs.');
  process.exit(0);
}
const claimId = randomUUID();
await request('claim', {
  revision: initial.revision,
  jobId: queued.id,
  claimId,
});
// Broker claims once. A crash leaves running/unknown state; a new worker never retries that job.
const execution = runPython('run', {
  jobId: queued.id,
  modelId: queued.listing.model.id,
  modelSha256: queued.listing.model.sha256,
  instructions: queued.listing.agent.instructions,
  input: queued.run.input,
  cpuLimitMs: queued.cpuLimitMs,
});
let done = false,
  failed = false;
const stop = async () => {
  failed = true;
  await runPython('stop', { jobId: queued.id }).promise;
};
const heartbeat = (async () => {
  while (!done) {
    await new Promise((r) =>
      setTimeout(
        r,
        Math.min(
          10000,
          Math.max(1000, initial.payload.terms.leaseSeconds * 400),
        ),
      ),
    );
    if (done) break;
    try {
      const { workspace } = await request('status');
      await request('heartbeat', {
        revision: workspace.revision,
        jobId: queued.id,
        claimId,
      });
    } catch {
      await stop();
      break;
    }
  }
})();
process.once('SIGTERM', () => void stop());
process.once('SIGINT', () => void stop());
let output;
try {
  output = await execution.promise;
} finally {
  done = true;
  await heartbeat;
}
if (failed) output.outcome = 'cancelled';
const event = {
  schema: 'sky.linux-event/1',
  id: randomUUID(),
  workspaceId,
  issuedAt: Date.now(),
  kind: 'result',
  payload: {
    jobId: queued.id,
    claimId,
    contractDigest: initial.payload.contractDigest,
    listingDigest: queued.listing.digest,
    inputSha256: queued.inputSha256,
    outcome: output.outcome,
    cpuMs: output.cpuMs,
    durationMs: output.durationMs,
    text: output.text ?? '',
    meter: output.meter,
  },
};
const signature = sign(
  null,
  Buffer.from(`sky.linux-event-signature/1:live:${JSON.stringify(event)}`),
  privateKey,
).toString('base64url');
// Preserve a lost response for explicit reconciliation; never execute the model again to recover a receipt.
await writeFile(
  join(outbox, `${event.id}.json`),
  JSON.stringify({ keyId, event, signature }),
  { mode: 0o600 },
);
await post({ keyId, event, signature });
console.log('Completed one admitted job; final receipt accepted.');
