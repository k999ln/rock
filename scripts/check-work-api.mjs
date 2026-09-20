// Protocol checks only. Synthetic identity headers simulate the Sites gateway on
// a loopback-only Worker; never send these headers to a deployed site.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  mkdtempSync,
  cpSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(join(tmpdir(), 'rock-api-check-'));
const state = join(temporary, 'state');
let base;
const alice = `api-check-${randomUUID()}`,
  bob = `api-check-${randomUUID()}`;
let worker,
  assertions = 0;
function check(actual, expected) {
  assert.deepEqual(actual, expected);
  assertions++;
}
async function call(method = 'GET', body, options = {}) {
  const response = await fetch(`${base}${options.path ?? '/api/work-jobs'}`, {
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
      `${method} ${options.path ?? '/api/work-jobs'}: expected ${options.status ?? 200}, received ${response.status}: ${(await response.text()).slice(0, 2000)}`,
    );
  check(response.status, options.status ?? 200);
  check(response.headers.get('cache-control'), 'no-store');
  return response.json();
}
async function stop() {
  await worker?.dispose();
  worker = undefined;
}
async function start() {
  const directory = join(temporary, 'dist/server');
  const config = JSON.parse(
    readFileSync(join(directory, 'wrangler.json'), 'utf8'),
  );
  // Exercise the exact API bundle in workerd/D1 directly. Wrangler's additional
  // hot-reload proxy has a known unread-POST transport failure (#15203); it is
  // not part of the deployed Worker. This suite does not test static asset routing.
  worker = new Miniflare(
    convertV4MiniflareOptions({
      name: config.name,
      rootPath: directory,
      modulesRoot: directory,
      modules: [
        config.main,
        ...readdirSync(directory, { recursive: true, encoding: 'utf8' }).filter(
          (file) => file !== config.main && /\.m?js$/.test(file),
        ),
      ].map((file) => ({ type: 'ESModule', path: resolve(directory, file) })),
      compatibilityDate: config.compatibility_date,
      compatibilityFlags: config.compatibility_flags,
      bindings: config.vars,
      d1Databases: Object.fromEntries(
        config.d1_databases.map((db) => [db.binding, db.database_id]),
      ),
      resourcePersistencePath: state,
      host: '127.0.0.1',
      port: 0,
    }),
  );
  base = (await worker.ready).origin;
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
  await start();
  check(
    (
      await call('GET', undefined, {
        path: '/api/health',
        user: null,
        status: 503,
      })
    ).status,
    'unavailable',
  );
  const database = await worker.getD1Database('DB');
  for (const file of readdirSync(join(temporary, 'migrations'))
    .filter((file) => file.endsWith('.sql'))
    .sort()) {
    for (const sql of readFileSync(join(temporary, 'migrations', file), 'utf8')
      .split('--> statement-breakpoint')
      .filter((sql) => sql.trim()))
      await database.prepare(sql).run();
  }
  check(
    (await call('GET', undefined, { path: '/api/health', user: null })).status,
    'ok',
  );
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
    fetch(`${base}/api/work-jobs`, {
      method: 'PATCH',
      headers: { Origin: base, 'oai-authenticated-user-id': alice },
      body: JSON.stringify({
        jobId: job.id,
        revision: job.revision,
        command: command({ outcome: 'needs_review' }),
      }),
      signal: AbortSignal.timeout(10000),
    }),
    fetch(`${base}/api/work-jobs`, {
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
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [join(root, 'scripts/verify-backend.mjs'), base],
      { cwd: root, stdio: 'inherit' },
    );
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Operations API verification exited ${code}`)),
    );
  });
  console.log(
    `仕事API: ${assertions} assertions passed (認証境界・分離・競合・順序・再送・再起動後の保存)`,
  );
} finally {
  await stop();
  rmSync(temporary, { recursive: true, force: true });
}
