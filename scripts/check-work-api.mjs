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
  }).catch((cause) => {
    throw new Error(
      `${method} ${options.path ?? '/api/work-jobs'}: transport failed (expected ${options.status ?? 200})`,
      { cause },
    );
  });
  if (response.status !== (options.status ?? 200))
    throw new Error(
      `${method} ${options.path ?? '/api/work-jobs'}: expected ${options.status ?? 200}, received ${response.status}: ${(await response.text()).slice(0, 2000)}`,
    );
  check(response.status, options.status ?? 200);
  check(
    response.headers.get('cache-control'),
    options.path?.startsWith('/api/amc') ? 'private, no-store' : 'no-store',
  );
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

  // AMC is an authenticated WorkJob, not a browser-only link or a claimed AI run.
  const amcPath = '/api/amc';
  const amcBrief = {
    request: 'jevで仮想通貨のbot作成して',
    goal: '依頼すると担当と次の行動がわかる',
    intent: '自分が担当と進捗を把握し、実売買なしで試作を確かめる',
  };
  const amcInput = { id: randomUUID(), brief: amcBrief };
  await call('GET', undefined, { path: amcPath, user: null, status: 401 });
  for (const method of ['POST', 'PATCH']) {
    await call(method, {}, { path: amcPath, user: null, status: 401 });
    await call(
      method,
      {},
      {
        path: amcPath,
        origin: 'https://not-rock.invalid',
        status: 403,
      },
    );
  }
  await call('POST', new Uint8Array([0xff]), {
    path: amcPath,
    raw: true,
    status: 400,
  });
  await call('POST', 'x'.repeat(2 * 1024 * 1024 + 1), {
    path: amcPath,
    raw: true,
    status: 413,
  });
  await call(
    'POST',
    { ...amcInput, brief: { ...amcBrief, request: 'パンを焼きたい' } },
    {
      path: amcPath,
      status: 400,
    },
  );
  await call(
    'POST',
    { id: randomUUID(), importGoal: { schema: 'amc-goal/1' } },
    {
      path: amcPath,
      status: 400,
    },
  );
  let { job: amcJob } = await call('POST', amcInput, {
    path: amcPath,
    status: 201,
  });
  check(amcJob.templateId, 'amc');
  check(amcJob.revision, 0);
  check(amcJob.status, 'active');
  check(amcJob.amcGoal.requestBrief.request, amcBrief.request);
  check(amcJob.amcGoal.requestBrief.goal, amcBrief.goal);
  check(amcJob.amcGoal.requestBrief.intent, amcBrief.intent);
  check(amcJob.amcGoal.tasks.length, 7);
  check(
    amcJob.amcGoal.tasks.every((task) => task.status === 'pending'),
    true,
  );
  check(
    amcJob.steps.every((step) => !step.passed),
    true,
  );
  check(
    amcJob.amcGoal.eventLog.map((event) => event.type),
    ['approve_plan'],
  );
  check(
    (await call('POST', amcInput, { path: amcPath, status: 201 })).job,
    amcJob,
  );
  await call(
    'POST',
    { ...amcInput, brief: { ...amcBrief, intent: '異なる目的' } },
    {
      path: amcPath,
      status: 409,
    },
  );
  const amcList = (await call('GET', undefined, { path: amcPath })).jobs;
  check(
    amcList.map((item) => item.id),
    [amcJob.id],
  );
  check(amcList[0].amcGoal, undefined);
  check(amcList[0].steps, []);
  check(amcList[0].events, []);
  check(
    (await call('GET', undefined, { path: `${amcPath}?id=${amcJob.id}` })).job,
    amcJob,
  );
  check((await call('GET', undefined, { path: amcPath, user: bob })).jobs, []);
  await call('GET', undefined, {
    path: `${amcPath}?id=${amcJob.id}`,
    user: bob,
    status: 404,
  });
  check(
    (await call()).jobs.some((item) => item.templateId === 'amc'),
    false,
  );
  await call('POST', { ...amcInput, templateId: 'amc' }, { status: 400 });
  await call('POST', amcInput, { path: amcPath, user: bob, status: 409 });
  const amcCommand = (type, extra = {}) => {
    const id = randomUUID();
    return {
      id,
      action: 'amc_event',
      event: {
        id,
        type,
        actor: 'owner-reported',
        role: 'owner',
        expectedRevision: amcJob.amcGoal.revision,
        ...extra,
      },
    };
  };
  const amcPatch = (value, options = {}) =>
    call(
      'PATCH',
      {
        jobId: amcJob.id,
        revision: amcJob.revision,
        command: value,
      },
      { path: amcPath, ...options },
    );
  await amcPatch(amcCommand('pause', { reason: 'wait' }), {
    user: bob,
    status: 404,
  });
  for (const action of [
    {
      id: randomUUID(),
      action: 'complete',
      note: '未実行なので完成していない',
    },
    { id: randomUUID(), action: 'cancel' },
    {
      id: randomUUID(),
      action: 'record',
      stepId: amcJob.steps[0].id,
      tool: amcJob.steps[0].tool,
      transport: 'browser',
      outcome: 'passed',
      sample: false,
      durationMs: 1,
    },
  ]) {
    await amcPatch(action, { status: 400 });
    await amcPatch(action, { path: '/api/work-jobs', status: 400 });
  }
  await amcPatch(
    amcCommand('accept_goal', {
      role: 'owner',
      accepted: true,
      evidence: ['evidence/claim.md'],
      criterionResults: [],
    }),
    { status: 400 },
  );
  const beforeAmcRevision = amcJob.revision;
  const competingAmcCommands = [
    amcCommand('pause', { reason: '本人の判断待ち A' }),
    amcCommand('pause', { reason: '本人の判断待ち B' }),
  ];
  const amcConcurrent = await Promise.all(
    competingAmcCommands.map((value) =>
      fetch(`${base}${amcPath}`, {
        method: 'PATCH',
        headers: {
          Origin: base,
          'Content-Type': 'application/json',
          'oai-authenticated-user-id': alice,
        },
        body: JSON.stringify({
          jobId: amcJob.id,
          revision: amcJob.revision,
          command: value,
        }),
        signal: AbortSignal.timeout(10000),
      }),
    ),
  );
  check(
    amcConcurrent.map((response) => response.status).sort((a, b) => a - b),
    [200, 409],
  );
  const winningIndex = amcConcurrent.findIndex(
    (response) => response.status === 200,
  );
  const concurrentAmcResults = await Promise.all(
    amcConcurrent.map((response) => response.json()),
  );
  amcJob = concurrentAmcResults[winningIndex].job;
  check(amcJob.amcGoal.state, 'paused');
  check(
    amcJob.amcGoal.eventLog.at(-1).id,
    competingAmcCommands[winningIndex].id,
  );
  check(
    (
      await call(
        'PATCH',
        {
          jobId: amcJob.id,
          revision: beforeAmcRevision,
          command: competingAmcCommands[winningIndex],
        },
        { path: amcPath },
      )
    ).job,
    amcJob,
  );
  await amcPatch(
    {
      ...competingAmcCommands[winningIndex],
      event: {
        ...competingAmcCommands[winningIndex].event,
        reason: '同一IDの別操作',
      },
    },
    { status: 409 },
  );
  await amcPatch(
    amcCommand('resume', { expectedRevision: amcJob.amcGoal.revision - 1 }),
    { status: 409 },
  );
  await call(
    'PATCH',
    {
      jobId: amcJob.id,
      revision: beforeAmcRevision,
      command: amcCommand('resume'),
    },
    { path: amcPath, status: 409 },
  );
  // Even a valid AMC command must use its dedicated size/privacy boundary.
  await amcPatch(amcCommand('resume'), { path: '/api/work-jobs', status: 400 });
  check(
    (await call('GET', undefined, { path: `${amcPath}?id=${amcJob.id}` })).job,
    amcJob,
  );
  ({ job: amcJob } = await amcPatch(amcCommand('resume')));
  check(amcJob.amcGoal.state, 'active');
  check(
    amcJob.amcGoal.tasks.every((task) => task.status === 'pending'),
    true,
  );
  const importedAmc = (
    await call(
      'POST',
      {
        id: randomUUID(),
        importGoal: amcJob.amcGoal,
      },
      { path: amcPath, status: 201 },
    )
  ).job;
  check(importedAmc.amcGoal, amcJob.amcGoal);
  check(importedAmc.revision, 0);
  // Goal remains below its own cap while accumulated WorkJob receipts exceed
  // the storage boundary. Reject the new record and retain the saved revision.
  const largeReason = 'x'.repeat(100_000);
  for (let index = 0; index < 5; index += 1) {
    ({ job: amcJob } = await amcPatch(
      amcCommand('pause', { reason: largeReason }),
    ));
    ({ job: amcJob } = await amcPatch(amcCommand('resume')));
  }
  check(
    new TextEncoder().encode(JSON.stringify(amcJob.amcGoal)).byteLength <
      1_500_000,
    true,
  );
  await amcPatch(amcCommand('pause', { reason: largeReason }), { status: 413 });
  check(
    (await call('GET', undefined, { path: `${amcPath}?id=${amcJob.id}` })).job,
    amcJob,
  );
  check(await call('GET', undefined, { path: '/api/jobs' }), []);
  check((await call('GET', undefined, { path: '/api/fund' })).totalRuns, 0);
  await stop();
  await start();
  check(
    (await call()).jobs.find((item) => item.id === job.id),
    job,
  );
  check((await call('GET', undefined, { user: bob })).jobs, []);
  check(
    (await call('GET', undefined, { path: `${amcPath}?id=${amcJob.id}` })).job,
    amcJob,
  );
  check(
    (await call('GET', undefined, { path: `${amcPath}?id=${importedAmc.id}` }))
      .job,
    importedAmc,
  );
  check((await call('GET', undefined, { path: amcPath, user: bob })).jobs, []);
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
