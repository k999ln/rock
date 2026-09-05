// Protocol checks only. Synthetic identity headers simulate the Sites gateway on
// a loopback-only Worker; never send these headers to a deployed site.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  mkdtempSync,
  cpSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(join(tmpdir(), 'rock-api-check-'));
const state = join(temporary, 'state');
const wrangler = join(root, 'node_modules/wrangler/bin/wrangler.js');
const environment = {
  ...process.env,
  CI: 'true',
  WRANGLER_SEND_METRICS: 'false',
  WRANGLER_LOG_PATH: join(temporary, 'wrangler.log'),
};
const socket = createServer();
await new Promise((resolve, reject) => {
  socket.once('error', reject);
  socket.listen(0, '127.0.0.1', resolve);
});
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const base = `http://127.0.0.1:${port}`;
const alice = `api-check-${randomUUID()}`,
  bob = `api-check-${randomUUID()}`;
let worker,
  logs = '',
  assertions = 0;
function check(actual, expected) {
  assert.deepEqual(actual, expected);
  assertions++;
}
async function call(method = 'GET', body, options = {}) {
  const response = await fetch(`${base}${options.path ?? '/api/jobs'}`, {
    method,
    headers: {
      ...(options.user === null
        ? {}
        : { 'oai-authenticated-user-id': options.user ?? alice }),
      ...(method === 'GET'
        ? {}
        : {
            Origin: options.origin ?? base,
            'Content-Type': 'application/json',
          }),
    },
    ...(body === undefined
      ? {}
      : { body: options.raw ? body : JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  });
  if (response.status !== (options.status ?? 200))
    throw new Error(
      `${method} ${options.path ?? '/api/jobs'}: expected ${options.status ?? 200}, received ${response.status}: ${(await response.text()).slice(0, 2000)}`,
    );
  check(response.status, options.status ?? 200);
  check(response.headers.get('cache-control'), 'no-store');
  return response.json();
}
async function stop() {
  if (!worker || worker.exitCode !== null) return;
  const exited = new Promise((resolve) => worker.once('exit', resolve));
  worker.kill('SIGTERM');
  await exited;
}
async function start() {
  worker = spawn(
    process.execPath,
    [
      wrangler,
      'dev',
      '--config',
      join(temporary, 'dist/server/wrangler.json'),
      '--local',
      '--ip',
      '127.0.0.1',
      '--port',
      String(port),
      '--persist-to',
      state,
    ],
    {
      cwd: root,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  worker.stdout.on('data', (chunk) => {
    logs = (logs + chunk).slice(-20000);
  });
  worker.stderr.on('data', (chunk) => {
    logs = (logs + chunk).slice(-20000);
  });
  for (let attempt = 0; attempt < 120; attempt++) {
    if (worker.exitCode !== null) throw new Error(`Worker exited: ${logs}`);
    try {
      const response = await fetch(`${base}/api/jobs`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.status === 401) return;
    } catch {
      /* Wait for the loopback Worker, not an external service. */
    }
    await delay(250);
  }
  throw new Error(`Worker startup timed out: ${logs}`);
}
try {
  // Workerd discovers extra *.js modules, including ExFAT AppleDouble metadata.
  // Verify the actual build bytes from a metadata-free temporary snapshot.
  cpSync(join(root, 'dist'), join(temporary, 'dist'), {
    recursive: true,
    filter: (source) => !source.split(/[\\/]/).at(-1).startsWith('._'),
  });
  cpSync(join(root, 'drizzle'), join(temporary, 'migrations'), {
    recursive: true,
    filter: (source) => !source.split(/[\\/]/).at(-1).startsWith('._'),
  });
  const config = JSON.parse(
    readFileSync(join(root, 'wrangler.local.jsonc'), 'utf8'),
  );
  config.d1_databases[0].migrations_dir = join(temporary, 'migrations');
  const configPath = join(temporary, 'wrangler.json');
  writeFileSync(configPath, JSON.stringify(config));
  const migrated = spawnSync(
    process.execPath,
    [
      wrangler,
      'd1',
      'migrations',
      'apply',
      'DB',
      '--local',
      '--config',
      configPath,
      '--persist-to',
      state,
    ],
    {
      cwd: root,
      env: environment,
      encoding: 'utf8',
      timeout: 60000,
    },
  );
  assert.equal(migrated.status, 0, migrated.stdout + migrated.stderr);
  await start();
  await call('GET', undefined, { user: null, status: 401 });
  for (let attempt = 0; attempt < 20; attempt++) {
    await call('POST', {}, { origin: 'https://not-rock.invalid', status: 403 });
    await call('POST', '{', { raw: true, status: 400 });
  }
  await call('POST', 'x'.repeat(12001), { raw: true, status: 413 });
  await call(
    'POST',
    { id: randomUUID(), title: 'test', templateId: 'unknown' },
    { status: 400 },
  );
  const input = {
    id: randomUUID(),
    title: 'API検証用の記事',
    templateId: 'article',
  };
  let { job } = await call('POST', input, { status: 201 });
  check((await call('POST', input, { status: 201 })).job, job);
  check((await call('GET', undefined, { user: bob })).jobs, []);
  await call('POST', input, { user: bob, status: 409 });
  const command = (overrides = {}) => ({
    id: randomUUID(),
    action: 'record',
    stepId: 'citations',
    tool: 'mr-citations',
    transport: 'browser',
    outcome: 'passed',
    sample: false,
    durationMs: 15,
    ...overrides,
  });
  const patch = (value, options) =>
    call(
      'PATCH',
      { jobId: job.id, revision: job.revision, command: value },
      options,
    );
  await patch(command(), { user: bob, status: 404 });
  await patch(command({ stepId: 'free-article', tool: 'mr-free-article' }), {
    status: 400,
  });
  await patch(
    { id: randomUUID(), action: 'complete', note: 'まだ確認前' },
    { status: 400 },
  );
  for (const extra of [
    { sample: true },
    { outcome: 'needs_review' },
    { outcome: 'failed' },
  ]) {
    ({ job } = await patch(command(extra)));
    check(job.steps[0].passed, false);
  }
  const concurrent = await Promise.all([
    fetch(`${base}/api/jobs`, {
      method: 'PATCH',
      headers: { Origin: base, 'oai-authenticated-user-id': alice },
      body: JSON.stringify({
        jobId: job.id,
        revision: job.revision,
        command: command({ outcome: 'needs_review' }),
      }),
      signal: AbortSignal.timeout(10000),
    }),
    fetch(`${base}/api/jobs`, {
      method: 'PATCH',
      headers: { Origin: base, 'oai-authenticated-user-id': alice },
      body: JSON.stringify({
        jobId: job.id,
        revision: job.revision,
        command: command({ outcome: 'needs_review' }),
      }),
      signal: AbortSignal.timeout(10000),
    }),
  ]);
  check(
    concurrent.map((response) => response.status).sort((a, b) => a - b),
    [200, 409],
  );
  job = (await call()).jobs.find((item) => item.id === job.id);
  const receipt = command(),
    priorRevision = job.revision;
  ({ job } = await patch(receipt));
  check(job.steps[0].passed, true);
  check(
    (
      await call('PATCH', {
        jobId: job.id,
        revision: priorRevision,
        command: receipt,
      })
    ).job,
    job,
  );
  await patch({ ...receipt, durationMs: 999 }, { status: 409 });
  await call(
    'PATCH',
    { jobId: job.id, revision: priorRevision, command: command() },
    { status: 409 },
  );
  ({ job } = await patch(
    command({ stepId: 'free-article', tool: 'mr-free-article' }),
  ));
  check(job.status, 'review');
  await patch(
    { id: randomUUID(), action: 'complete', note: '' },
    { status: 400 },
  );
  ({ job } = await patch({
    id: randomUUID(),
    action: 'complete',
    note: 'テスト用原稿を確認。外部送信なし。',
  }));
  check(job.status, 'completed');
  await patch(command(), { status: 409 });
  check((await call('GET', undefined, { path: '/api/fund' })).totalRuns, 0);
  await stop();
  await start();
  check(
    (await call()).jobs.find((item) => item.id === job.id),
    job,
  );
  check((await call('GET', undefined, { user: bob })).jobs, []);
  console.log(
    `仕事API: ${assertions} assertions passed (認証境界・分離・競合・順序・再送・再起動後の保存)`,
  );
} catch (error) {
  console.error(logs.slice(-4000));
  throw error;
} finally {
  await stop();
  rmSync(temporary, { recursive: true, force: true });
}
