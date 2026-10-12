// Synthetic-only hard-kill audit: production processor, persistent local D1/R2.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  readFileSync,
  readdirSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const self = fileURLToPath(import.meta.url);
const root = resolve(dirname(self), '..');
const out = resolve(
  process.env.CSV_CRASH_ARTIFACT_DIR || join(tmpdir(), 'rock-csv-crash-audit'),
);
if (process.platform === 'win32')
  throw new Error('CSV crash audit requires POSIX process-group SIGKILL.');
const owner = 'synthetic-csv-crash-owner';
const content =
  'id,name,note\r\n001, A ,=1+1\r\n001,A,duplicate\r\n002, B ,safe\r\n';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const require = createRequire(join(root, 'package.json'));
if (process.argv[2] === '--child') {
  const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
  let stage = null;
  const gate = async (point) => {
    process.send({ event: 'checkpoint', point, pid: process.pid });
    await new Promise(() => {}); // The supervisor kills the whole process group.
  };
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'csv-process-crash-fixture',
      modules: true,
      script: `export default { async fetch(request, env) {
      if (new URL(request.url).pathname !== '/stream') return new Response('Fixture only', {status:404});
      const bytes = new Uint8Array(await request.arrayBuffer());
      const key = new URL(request.url).searchParams.get('key');
      const options = JSON.parse(request.headers.get('x-fixture-options'));
      const stream = new FixedLengthStream(bytes.byteLength);
      const writing = env.BUCKET.put(key, stream.readable, options);
      const writer = stream.writable.getWriter();
      await writer.write(bytes.slice(0, Math.max(1, Math.floor(bytes.length / 2))));
      await env.CRASH_GATE.fetch('https://fixture.invalid/output-stream');
      await writer.write(bytes.slice(Math.max(1, Math.floor(bytes.length / 2))));
      await writer.close(); await writing;
      return new Response('done');
    } };`,
      compatibilityDate: '2026-04-01',
      d1Databases: { DB: 'csv-crash-db' },
      r2Buckets: { BUCKET: 'csv-crash-files' },
      resourcePersistencePath: process.argv[3],
      host: '127.0.0.1',
      port: 0,
      serviceBindings: {
        CRASH_GATE: async () => {
          await gate('output-stream');
          return new Response('unreachable');
        },
      },
    }),
  );
  const origin = (await mf.ready).origin;
  const rawDb = await mf.getD1Database('DB'),
    rawBucket = await mf.getR2Bucket('BUCKET');
  function statement(sql, source = rawDb.prepare(sql)) {
    return {
      bind(...values) {
        return statement(sql, source.bind(...values));
      },
      first(...args) {
        return source.first(...args);
      },
      all(...args) {
        return source.all(...args);
      },
      async run() {
        const result = await source.run();
        if (
          stage === 'claim' &&
          sql.includes("SET status = 'processing'") &&
          result.meta.changes === 1
        )
          await gate('claim');
        if (
          stage === 'completed' &&
          sql.includes("SET status = 'completed'") &&
          result.meta.changes === 1
        )
          await gate('completed');
        return result;
      },
      raw: source,
    };
  }
  const db = {
    prepare: (sql) => statement(sql),
    batch: (statements) => rawDb.batch(statements.map((s) => s.raw)),
  };
  const bucket = {
    get: (...args) => rawBucket.get(...args),
    async put(key, value, options) {
      if (
        stage === 'output-stream' &&
        key.endsWith('result.csv') &&
        !key.endsWith('spreadsheet-safe.csv')
      ) {
        return fetch(origin + '/stream?key=' + encodeURIComponent(key), {
          method: 'POST',
          body: value,
          headers: { 'x-fixture-options': JSON.stringify(options ?? {}) },
        });
      }
      const result = await rawBucket.put(key, value, options);
      if (stage === 'outputs-partial' && key.endsWith('spreadsheet-safe.csv'))
        await gate('outputs-partial');
      return result;
    },
    async delete(keys) {
      if (stage === 'cleanup' && Array.isArray(keys)) {
        await rawBucket.delete(keys[0]);
        await gate('cleanup');
        return rawBucket.delete(keys.slice(1));
      }
      return rawBucket.delete(keys);
    },
  };
  const { loadRouteFixture } = await import(
    pathToFileURL(join(root, 'tests/route-fixture.mjs'))
  );
  const deps = new Map([
    ['cloudflare:workers', { env: { DB: db, BUCKET: bucket } }],
  ]);
  for (const name of [
    'csv-retention',
    'csv-request-limit',
    'csv-trial-sample',
    'sky-stripe',
    'csv-transform',
  ])
    deps.set(
      './' + name,
      await import(pathToFileURL(join(root, 'lib', name + '.ts'))),
    );
  const store = loadRouteFixture(
    pathToFileURL(join(root, 'lib/csv-job-store.ts')),
    deps,
  );
  const retention = deps.get('./csv-retention');
  async function inspect(id) {
    const row = await rawDb
      .prepare('SELECT * FROM csv_jobs WHERE id=?')
      .bind(id)
      .first();
    const objects = [];
    for (const object of (await rawBucket.list({ prefix: `csv/${id}/` }))
      .objects) {
      const stored = await rawBucket.get(object.key);
      objects.push({
        key: object.key,
        bytes: object.size,
        sha256: digest(Buffer.from(await stored.arrayBuffer())),
      });
    }
    const events = (
      await rawDb
        .prepare(
          'SELECT event,COUNT(*) AS count FROM csv_job_events WHERE job_id=? GROUP BY event ORDER BY event',
        )
        .bind(id)
        .all()
    ).results;
    return { row, objects, events };
  }
  process.on('message', async ({ seq, action, args = {} }) => {
    try {
      let value;
      if (action === 'init') {
        for (const file of readdirSync(join(root, 'drizzle'))
          .filter((f) => f.endsWith('.sql') && !f.startsWith('._'))
          .sort())
          for (const sql of readFileSync(join(root, 'drizzle', file), 'utf8')
            .split('--> statement-breakpoint')
            .filter((s) => s.trim()))
            await rawDb.prepare(sql).run();
        value = true;
      } else if (action === 'create')
        value = await store.createCsvJob(owner, {
          id: args.id,
          name: 'synthetic.csv',
          bytes: new TextEncoder().encode(content),
          specification: {
            trim: ['name'],
            dedupe: { keys: ['id'], mode: 'first' },
            spreadsheetSafe: true,
          },
          sample: true,
        });
      else if (action === 'accept') {
        stage = args.stage ?? null;
        value = await store.acceptCsvJob(args.owner ?? owner, args.id, {
          revision: args.revision,
        });
      } else if (action === 'retry')
        value = await store.retryCsvJob(
          args.owner ?? owner,
          args.id,
          args.revision,
        );
      else if (action === 'list')
        value = await store.listCsvJobs(args.owner ?? owner);
      else if (action === 'delete') {
        stage = args.stage ?? null;
        await store.deleteCsvJob(args.owner ?? owner, args.id);
        value = true;
      } else if (action === 'artifact') {
        const result = await store.csvArtifact(
          args.owner ?? owner,
          args.id,
          args.kind,
        );
        value = {
          sha256: digest(Buffer.from(await result.object.arrayBuffer())),
          name: result.name,
        };
      } else if (action === 'inspect') value = await inspect(args.id);
      else if (action === 'expire') {
        await rawDb
          .prepare('UPDATE csv_jobs SET expires_at=? WHERE id=?')
          .bind(Date.now() - 1, args.id)
          .run();
        value = await retention.purgeExpiredCsvJobs(db, bucket, {
          user: owner,
          id: args.id,
        });
      } else if (action === 'stop') {
        await mf.dispose();
        process.send({ seq, ok: true });
        process.exit(0);
      } else throw Error('Unknown fixture action');
      process.send({ seq, ok: true, value });
    } catch (error) {
      process.send({
        seq,
        ok: false,
        error: {
          name: error.name,
          code: error.code,
          status: error.status,
          message: error.message,
        },
      });
    }
  });
  process.send({
    event: 'ready',
    pid: process.pid,
    origin,
    persistence: process.argv[3],
  });
} else {
  mkdirSync(out, { recursive: true });
  const directory = mkdtempSync(join(out, 'state-'));
  const evidence = {
    startedAt: new Date().toISOString(),
    root,
    persistence: directory,
    sourceSha: spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).stdout.trim(),
    sourceHashes: Object.fromEntries(
      ['lib/csv-job-store.ts', 'lib/csv-retention.ts'].map((p) => [
        p,
        digest(readFileSync(join(root, p))),
      ]),
    ),
    limitations: [
      'Processing after process death remains unrecoverable under the current retry/delete contract, including expired rows.',
      'No approval to change storage keys, attempt or retention policy is implied.',
      'Streaming-write checkpoint uses a real workerd FixedLengthStream into R2; partial cleanup deliberately pauses between actual R2 key deletions.',
      'Production CSV processor is unchanged but runs in a Node host with actual Miniflare storage proxies; this is not production HTTP/auth/browser or cloud-service acceptance.',
    ],
    scope:
      'Actual SIGKILL of Node processor host and workerd process group; production CSV store loaded unchanged; real local persisted Miniflare D1/R2. No provider/payment. API/auth/UI not substituted by this processor-level evidence.',
    cases: [],
  };
  let child,
    seq = 0,
    ready,
    waitCheckpoint;
  const calls = new Map();
  function groupMembers(group) {
    const result = spawnSync('ps', ['-eo', 'pid=,pgid=,stat=,comm='], {
      encoding: 'utf8',
    });
    assert.equal(
      result.status,
      0,
      'inspect only fixture process-group membership',
    );
    return result.stdout.split('\n').flatMap((line) => {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
      return match && Number(match[2]) === group
        ? [
            {
              pid: Number(match[1]),
              group: Number(match[2]),
              state: match[3],
              command: match[4],
            },
          ]
        : [];
    });
  }
  async function start() {
    ready = Promise.withResolvers();
    child = spawn(
      process.execPath,
      ['--experimental-strip-types', self, '--child', directory],
      {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        env: process.env,
      },
    );
    child.stdout.on('data', (d) => process.stdout.write(d));
    child.stderr.on('data', (d) => process.stderr.write(d));
    child.on('message', (m) => {
      if (m.event === 'ready') ready.resolve(m);
      else if (m.event === 'checkpoint') {
        waitCheckpoint?.resolve(m);
      } else {
        const p = calls.get(m.seq);
        if (p) {
          calls.delete(m.seq);
          p.resolve(m);
        }
      }
    });
    child.on('exit', (code, signal) => {
      for (const p of calls.values())
        p.resolve({ ok: false, transportClosed: true, code, signal });
      calls.clear();
    });
    const timer = setTimeout(
      () => ready.reject(Error('Child readiness timeout')),
      15000,
    );
    try {
      return await ready.promise;
    } finally {
      clearTimeout(timer);
    }
  }
  function call(action, args = {}) {
    const seqNo = ++seq,
      p = Promise.withResolvers();
    calls.set(seqNo, p);
    child.send({ seq: seqNo, action, args });
    return p.promise;
  }
  async function ok(action, args) {
    const r = await call(action, args);
    assert.equal(r.ok, true, JSON.stringify(r));
    return r.value;
  }
  async function killAt(action, args, point) {
    waitCheckpoint = Promise.withResolvers();
    const result = call(action, { ...args, stage: point });
    const timer = setTimeout(
      () => waitCheckpoint.reject(Error('Checkpoint timeout: ' + point)),
      15000,
    );
    let hit;
    try {
      hit = await waitCheckpoint.promise;
    } finally {
      clearTimeout(timer);
      waitCheckpoint = null;
    }
    assert.equal(hit.point, point);
    const pid = child.pid,
      killedMembers = groupMembers(pid);
    assert.ok(
      killedMembers.some((member) => member.command.includes('workerd')),
      'actual workerd belongs to the group being killed',
    );
    process.kill(-pid, 'SIGKILL');
    const response = await result;
    assert.equal(response.transportClosed, true);
    assert.equal(response.signal, 'SIGKILL');
    const deadline = Date.now() + 5000;
    let survivors;
    do {
      survivors = groupMembers(pid).filter(
        (member) => !member.state.startsWith('Z'),
      );
      if (!survivors.length) break;
      assert.ok(Date.now() < deadline, 'fixture group terminates');
      await new Promise((resolve) => setTimeout(resolve, 10));
    } while (survivors.length);
    const restarted = await start();
    return {
      checkpoint: hit,
      killedPid: pid,
      killedMembers,
      liveGroupMembersAfterKill: survivors,
      closed: response,
      restarted,
    };
  }
  try {
    await start();
    await ok('init');
    for (const point of [
      'claim',
      'output-stream',
      'outputs-partial',
      'completed',
      'cleanup',
    ]) {
      const id = randomUUID(),
        quote = await ok('create', { id });
      let interrupted;
      if (point === 'cleanup') {
        const done = await ok('accept', { id, revision: quote.revision });
        assert.equal(done.status, 'completed');
        interrupted = await killAt('delete', { id }, point);
      } else
        interrupted = await killAt(
          'accept',
          { id, revision: quote.revision },
          point,
        );
      const initial = await ok('inspect', { id });
      const record = { point, id, ...interrupted, afterRestart: initial };
      assert.equal(initial.row.user_id, owner);
      assert.equal(initial.row.payment_status, 'sample');
      assert.equal(initial.row.attempt, 1);
      assert.equal(
        initial.row.expires_at - initial.row.created_at,
        7 * 24 * 60 * 60 * 1000,
        'existing retention duration unchanged',
      );
      const foreign = await call('accept', {
        id,
        revision: initial.row.revision,
        owner: 'synthetic-other-owner',
      });
      assert.equal(foreign.error.status, 404);
      record.foreignOwnerStatus = foreign.error.status;
      if (['claim', 'output-stream', 'outputs-partial'].includes(point)) {
        assert.equal(initial.row.status, 'processing');
        assert.equal(initial.row.revision, 1);
        assert.equal(initial.row.result_key, null);
        const repeated = await Promise.all([
          call('accept', { id, revision: 1 }),
          call('accept', { id, revision: 1 }),
        ]);
        assert.ok(
          repeated.every((r) => r.ok && r.value.status === 'processing'),
        );
        const retry = await call('retry', { id, revision: 1 });
        assert.equal(retry.error.status, 409);
        const removal = await call('delete', { id });
        assert.equal(removal.error.code, 'REMOVAL_BUSY');
        const after = await ok('inspect', { id });
        assert.equal(after.row.attempt, 1);
        assert.equal(after.row.revision, 1);
        assert.deepEqual(after.objects, initial.objects);
        record.replay = {
          acceptStatuses: repeated.map((r) => r.value.status),
          retry,
          delete: removal,
        };
        if (point === 'claim') {
          record.expiredPurge = await ok('expire', { id });
          record.afterExpiredPurge = await ok('inspect', { id });
          assert.equal(record.expiredPurge.scanned, 0);
          assert.equal(record.afterExpiredPurge.objects.length, 1);
        }
        if (point === 'output-stream')
          assert.equal(
            initial.objects.length,
            1,
            'incomplete streaming R2 put is not an exposed output',
          );
        if (point === 'outputs-partial')
          assert.equal(
            initial.objects.length,
            3,
            'input + result + safe output persisted before report',
          );
      } else if (point === 'completed') {
        assert.equal(initial.row.status, 'completed');
        assert.equal(initial.row.revision, 2);
        assert.equal(initial.objects.length, 5);
        record.artifacts = {};
        for (const kind of [
          'result',
          'spreadsheet-safe',
          'report-json',
          'report-html',
        ]) {
          record.artifacts[kind] = await ok('artifact', { id, kind });
          const foreign = await call('artifact', {
            id,
            kind,
            owner: 'synthetic-other-owner',
          });
          assert.equal(foreign.error.status, 404);
        }
        assert.equal(record.artifacts.result.sha256, initial.row.output_sha256);
        const repeated = await Promise.all([
          ok('accept', { id, revision: 0 }),
          ok('accept', { id, revision: 1 }),
        ]);
        assert.ok(
          repeated.every((r) => r.status === 'completed' && r.attempt === 1),
        );
        assert.deepEqual(
          (await ok('inspect', { id })).objects,
          initial.objects,
        );
      } else {
        assert.equal(initial.row.status, 'cleanup_pending');
        assert.equal(initial.row.revision, 3);
        assert.equal(initial.objects.length, 4);
        const download = await call('artifact', { id, kind: 'result' });
        assert.equal(download.error.status, 410);
        await ok('delete', { id });
        record.afterCleanup = await ok('inspect', { id });
        assert.equal(record.afterCleanup.row, null);
        assert.deepEqual(record.afterCleanup.objects, []);
        assert.deepEqual(record.afterCleanup.events, []);
      }
      evidence.cases.push(record);
      writeFileSync(
        join(out, 'csv-process-crash-summary.json'),
        JSON.stringify(evidence, null, 2) + '\n',
      );
      console.log('PASS checkpoint', point);
    }
    evidence.finishedAt = new Date().toISOString();
    evidence.result =
      'PASS existing-contract crash audit; processing recovery remains unresolved';
    writeFileSync(
      join(out, 'csv-process-crash-summary.json'),
      JSON.stringify(evidence, null, 2) + '\n',
    );
    await ok('stop');
    console.log(
      'CSV hard-kill audit: 5 checkpoints observed; processing recovery remains unresolved. Evidence: ' +
        join(out, 'csv-process-crash-summary.json'),
    );
  } catch (error) {
    evidence.error = { message: error.message, stack: error.stack };
    writeFileSync(
      join(out, 'csv-process-crash-summary.json'),
      JSON.stringify(evidence, null, 2) + '\n',
    );
    if (child?.pid)
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {}
    throw error;
  }
}
