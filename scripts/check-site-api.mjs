// Protocol checks only. Synthetic identity headers simulate the Sites gateway on
// a loopback-only Worker; never send these headers to a deployed site.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { File } from 'node:buffer';
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
const operator = `api-check-operator-${randomUUID()}`;
const paymentSecret = 'api-check-only-payment-webhook-secret';
const paymentProvider = 'api-check-market';
let worker,
  bucket,
  assertions = 0;
function check(actual, expected) {
  assert.deepEqual(actual, expected);
  assertions++;
}
async function call(method = 'GET', body, options = {}) {
  if (
    method === 'POST' &&
    options.path === '/api/csv-operations' &&
    body &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    !body.idempotencyKey
  )
    body = { ...body, idempotencyKey: randomUUID() };
  const response = await request(method, body, options);
  if (response.status !== (options.status ?? 200))
    throw new Error(
      `${method} ${options.path ?? '/api/work-jobs'}: expected ${options.status ?? 200}, received ${response.status}: ${(await response.text()).slice(0, 2000)}`,
    );
  check(response.status, options.status ?? 200);
  if (options.noStore !== false)
    check(response.headers.get('cache-control'), 'no-store');
  return response.json();
}
async function request(method = 'GET', body, options = {}) {
  const headers = {
    ...(options.user === null
      ? {}
      : { 'oai-authenticated-user-id': options.user ?? alice }),
    ...(method === 'GET' ? {} : { Origin: options.origin ?? base }),
    ...(method === 'GET' || options.form
      ? {}
      : {
          'Content-Type':
            options.contentType ??
            (options.raw ? 'text/plain' : 'application/json'),
        }),
    ...options.headers,
  };
  return fetch(`${base}${options.path ?? '/api/work-jobs'}`, {
    method,
    headers,
    ...(body === undefined
      ? {}
      : { body: options.form || options.raw ? body : JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  });
}
const csvSpecification = {
  renames: {},
  order: [],
  trim: [],
  dedupe: { keys: [], mode: 'report_only' },
  sort: [],
  outputEncoding: 'utf8',
  spreadsheetSafe: false,
};
function csvUpload(id = randomUUID(), user = alice, fields = {}) {
  const form = new FormData();
  form.set('id', id);
  form.set(
    'file',
    new File(['sku,name\r\n001,Example\r\n'], 'catalog.csv', {
      type: 'text/csv',
    }),
  );
  form.set('specification', JSON.stringify(csvSpecification));
  for (const [key, value] of Object.entries(fields))
    form.set(key, String(value));
  return request('POST', form, {
    path: '/api/csv-jobs',
    user,
    form: true,
  });
}
async function waitForCsvJob(
  id,
  user = alice,
  predicate = (job) => job.status === 'delivered',
) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const { jobs } = await call('GET', undefined, {
      path: '/api/csv-jobs',
      user,
    });
    const job = jobs.find((item) => item.id === id);
    if (job && predicate(job)) return job;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`CSV job ${id} did not reach its expected state`);
}
function monthJstNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;
}
async function providerEvent(event, options = {}) {
  const body = JSON.stringify({ provider: paymentProvider, ...event });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', paymentSecret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  return call('POST', body, {
    path: '/api/csv-payments/webhook',
    raw: true,
    contentType: 'application/json',
    headers: { 'x-csv-signature': `t=${timestamp},v1=${signature}` },
    ...options,
  });
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
      bindings: {
        ...config.vars,
        CSV_OPERATOR_ID_SHA256: createHash('sha256')
          .update(operator)
          .digest('hex'),
        CSV_PAYMENT_WEBHOOK_SECRET: paymentSecret,
        CSV_PAYMENT_PROVIDER: paymentProvider,
      },
      r2Buckets: Object.fromEntries(
        (config.r2_buckets ?? []).map(({ binding, bucket_name }) => [
          binding,
          bucket_name,
        ]),
      ),
      d1Databases: Object.fromEntries(
        config.d1_databases.map((db) => [db.binding, db.database_id]),
      ),
      resourcePersistencePath: state,
      host: '127.0.0.1',
      port: 0,
    }),
  );
  base = (await worker.ready).origin;
  bucket = await worker.getR2Bucket(
    config.r2_buckets?.find(({ binding }) => binding === 'BUCKET')?.binding ??
      'BUCKET',
  );
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
  const database = await worker.getD1Database('DB');
  for (const file of readdirSync(join(temporary, 'migrations'))
    .filter((file) => file.endsWith('.sql'))
    .sort()) {
    for (const sql of readFileSync(join(temporary, 'migrations', file), 'utf8')
      .split('--> statement-breakpoint')
      .filter((sql) => sql.trim()))
      await database.prepare(sql).run();
  }
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

  // CSV order, durable lease, buyer delivery, payment ledger, and operator controls.
  await call('GET', undefined, {
    path: '/api/csv-operations',
    user: alice,
    status: 403,
  });
  const unpaidId = randomUUID();
  const unpaidResponse = await csvUpload(unpaidId, alice, {
    paymentStatus: 'paid_to_owner',
    paymentMethod: 'self-declared',
  });
  check(unpaidResponse.status, 201);
  check(unpaidResponse.headers.get('cache-control'), 'no-store');
  const { job: unpaidJob } = await unpaidResponse.json();
  check(unpaidJob.quoteMinor, 3000);
  check(unpaidJob.currency, 'JPY');
  check(unpaidJob.paymentStatus, 'unpaid');
  await call(
    'POST',
    { action: 'accept', revision: unpaidJob.revision },
    { path: `/api/csv-jobs/${unpaidId}`, status: 409 },
  );
  const sampleFieldResponse = await csvUpload(randomUUID(), alice, {
    sample: 'true',
  });
  check(sampleFieldResponse.status, 400);

  const { job: sampleJob } = await call('POST', undefined, {
    path: '/api/csv-jobs/sample',
    status: 201,
  });
  check(sampleJob.paymentStatus, 'sample');
  let deliveredSample = await waitForCsvJob(sampleJob.id);
  check(deliveredSample.status, 'delivered');

  // Model a process crash after lease acquisition and before its D1 commit.
  const priorDeliveries = await database
    .prepare(
      `SELECT result_key, safe_result_key, report_json_key, report_html_key
       FROM csv_delivery_revisions WHERE job_id = ? AND user_id = ?`,
    )
    .bind(sampleJob.id, alice)
    .all();
  await bucket.delete(
    priorDeliveries.results.flatMap((row) =>
      [
        row.result_key,
        row.safe_result_key,
        row.report_json_key,
        row.report_html_key,
      ].filter(Boolean),
    ),
  );
  await database
    .prepare(
      'DELETE FROM csv_delivery_revisions WHERE job_id = ? AND user_id = ?',
    )
    .bind(sampleJob.id, alice)
    .run();
  await database
    .prepare('DELETE FROM csv_job_events WHERE job_id = ? AND user_id = ?')
    .bind(sampleJob.id, alice)
    .run();
  const expiredLease = Date.now() - 1000;
  await database
    .prepare(
      `UPDATE csv_jobs SET status = 'processing', attempt = 1,
       lease_id = 'synthetic-crashed-worker', lease_expires_at = ?,
       delivery_revision = 0, result_key = NULL, safe_result_key = NULL,
       report_json_key = NULL, report_html_key = NULL, output_sha256 = NULL,
       validation_json = NULL, completed_at = NULL, approved_at = NULL,
       revision_requested_at = NULL, revision_reason = NULL,
       revision = revision + 1, updated_at = ? WHERE id = ? AND user_id = ?`,
    )
    .bind(expiredLease, Date.now(), sampleJob.id, alice)
    .run();
  await call('GET', undefined, { path: '/api/csv-jobs' });
  deliveredSample = await waitForCsvJob(
    sampleJob.id,
    alice,
    (item) => item.status === 'delivered' && item.attempt === 2,
  );
  check(deliveredSample.deliveryRevision, 1);
  const singleDelivery = await database
    .prepare(
      'SELECT COUNT(*) AS count FROM csv_delivery_revisions WHERE job_id = ?',
    )
    .bind(sampleJob.id)
    .first();
  check(singleDelivery.count, 1);
  const duplicateCompletion = await call(
    'POST',
    { action: 'accept', revision: deliveredSample.revision },
    { path: `/api/csv-jobs/${sampleJob.id}` },
  );
  check(duplicateCompletion.job.attempt, 2);
  const singleDeliveredEvent = await database
    .prepare(
      "SELECT COUNT(*) AS count FROM csv_job_events WHERE job_id = ? AND event = 'delivered'",
    )
    .bind(sampleJob.id)
    .first();
  check(singleDeliveredEvent.count, 1);

  const firstLink = await call(
    'POST',
    {},
    {
      path: `/api/csv-jobs/${sampleJob.id}/delivery-link`,
    },
  );
  const firstToken = new URL(firstLink.url, base).hash.slice('#token='.length);
  check(firstToken.length, 43);
  const buyerPath = `/api/csv-delivery/${sampleJob.id}`;
  const buyerHeaders = { Authorization: `Bearer ${firstToken}` };
  const buyerPage = await call('GET', undefined, {
    path: buyerPath,
    user: null,
    headers: buyerHeaders,
  });
  check(buyerPage.job.status, 'delivered');
  check(buyerPage.job.deliveryRevision, 1);
  await call('GET', undefined, { path: buyerPath, user: null, status: 404 });
  const buyerArtifact = await request('GET', undefined, {
    path: `${buyerPath}/artifact/result`,
    user: null,
    headers: buyerHeaders,
  });
  check(buyerArtifact.status, 200);
  check(buyerArtifact.headers.get('cache-control'), 'private, no-store');
  check((await buyerArtifact.text()).includes('001'), true);
  await call(
    'POST',
    {
      action: 'revision',
      revision: buyerPage.job.revision,
      reason: '列の見出しを確認してください',
    },
    {
      path: buyerPath,
      user: null,
      origin: 'https://not-rock.invalid',
      headers: buyerHeaders,
      status: 403,
    },
  );
  const requestedRevision = await call(
    'POST',
    {
      action: 'revision',
      revision: buyerPage.job.revision,
      reason: '列の見出しを確認してください',
    },
    { path: buyerPath, user: null, headers: buyerHeaders },
  );
  check(requestedRevision.job.status, 'revision_requested');
  const buyerReviewingRevision = await call('GET', undefined, {
    path: buyerPath,
    user: null,
    headers: buyerHeaders,
  });
  check(buyerReviewingRevision.job.status, 'revision_requested');
  check(buyerReviewingRevision.delivery.status, 'revision_requested');
  const revisionRequestedJob = await waitForCsvJob(
    sampleJob.id,
    alice,
    (item) => item.status === 'revision_requested',
  );
  const revisionAccepted = await call(
    'POST',
    {
      action: 'apply_revision',
      revision: revisionRequestedJob.revision,
      specification: revisionRequestedJob.specification,
    },
    { path: `/api/csv-jobs/${sampleJob.id}` },
  );
  check(revisionAccepted.job.status, 'accepted');
  const secondDelivery = await waitForCsvJob(
    sampleJob.id,
    alice,
    (item) => item.status === 'delivered' && item.deliveryRevision === 2,
  );
  const buyerPageV2 = await call('GET', undefined, {
    path: buyerPath,
    user: null,
    headers: buyerHeaders,
  });
  check(buyerPageV2.job.deliveryRevision, 2);
  await call(
    'POST',
    {
      action: 'revision',
      revision: secondDelivery.revision,
      reason: '二度目の修正です',
    },
    { path: buyerPath, user: null, headers: buyerHeaders, status: 409 },
  );
  const approved = await call(
    'POST',
    { action: 'approve', revision: secondDelivery.revision },
    { path: buyerPath, user: null, headers: buyerHeaders },
  );
  check(approved.job.status, 'approved');
  const rotatedLink = await call(
    'POST',
    {},
    {
      path: `/api/csv-jobs/${sampleJob.id}/delivery-link`,
    },
  );
  await call('GET', undefined, {
    path: buyerPath,
    user: null,
    headers: buyerHeaders,
    status: 404,
  });
  const secondToken = new URL(rotatedLink.url, base).hash.slice(
    '#token='.length,
  );
  check(
    (
      await call('GET', undefined, {
        path: buyerPath,
        user: null,
        headers: { Authorization: `Bearer ${secondToken}` },
      })
    ).job.status,
    'approved',
  );
  check(
    (
      await call(
        'POST',
        { action: 'revoke' },
        { path: `/api/csv-jobs/${sampleJob.id}/delivery-link` },
      )
    ).revoked,
    1,
  );
  await call('GET', undefined, {
    path: buyerPath,
    user: null,
    headers: { Authorization: `Bearer ${secondToken}` },
    status: 404,
  });

  const manualUpload = await csvUpload(randomUUID(), bob, {
    paymentStatus: 'paid_to_owner',
  });
  check(manualUpload.status, 201);
  const { job: manualJob } = await manualUpload.json();
  const manualPayment = {
    action: 'manual_payment',
    jobId: manualJob.id,
    provider: 'market-assisted',
    type: 'buyer_paid',
    amountMinor: 3000,
    currency: 'JPY',
    occurredAt: Date.now(),
    evidenceReference: 'synthetic-only-market-check',
    idempotencyKey: randomUUID(),
  };
  const manualRecorded = await call('POST', manualPayment, {
    path: '/api/csv-operations',
    user: operator,
  });
  check(manualRecorded.result.duplicate, false);
  check(manualRecorded.result.job.paymentStatus, 'manual_verified');
  const manualDuplicate = await call('POST', manualPayment, {
    path: '/api/csv-operations',
    user: operator,
  });
  check(manualDuplicate.result.duplicate, true);
  const manualStarted = await call(
    'POST',
    { action: 'accept', revision: manualRecorded.result.job.revision },
    { path: `/api/csv-jobs/${manualJob.id}`, user: bob },
  );
  check(manualStarted.job.status, 'accepted');
  check(
    (await waitForCsvJob(manualJob.id, bob)).paymentStatus,
    'manual_verified',
  );
  const crossActionKey = randomUUID();
  await call(
    'POST',
    {
      action: 'intervene',
      jobId: manualJob.id,
      intervention: 'quality_review',
      idempotencyKey: crossActionKey,
    },
    { path: '/api/csv-operations', user: operator },
  );
  const crossActionPayment = await call(
    'POST',
    {
      action: 'manual_payment',
      jobId: manualJob.id,
      provider: 'market-assisted',
      type: 'buyer_paid',
      amountMinor: 3000,
      currency: 'JPY',
      evidenceReference: 'synthetic cross-action guard',
      idempotencyKey: crossActionKey,
    },
    { path: '/api/csv-operations', user: operator, status: 409 },
  );
  check(crossActionPayment.code, 'IDEMPOTENCY');
  check(
    (
      await database
        .prepare(
          `SELECT COUNT(*) AS count FROM csv_payment_events
     WHERE provider = 'market-assisted' AND provider_event_id = ?`,
        )
        .bind(`manual:${crossActionKey}`)
        .first()
    ).count,
    0,
  );
  check(
    (
      await database
        .prepare(
          `SELECT action FROM csv_operator_events WHERE actor_hash = ? AND idempotency_key = ?`,
        )
        .bind(
          createHash('sha256').update(operator).digest('hex'),
          crossActionKey,
        )
        .first()
    ).action,
    'quality_review',
  );
  check(
    (
      await database
        .prepare(
          `SELECT COUNT(*) AS count FROM csv_operator_outbox
     WHERE actor_hash = ? AND idempotency_key = ?`,
        )
        .bind(
          createHash('sha256').update(operator).digest('hex'),
          crossActionKey,
        )
        .first()
    ).count,
    1,
  );

  const providerUpload = await csvUpload(randomUUID(), alice);
  check(providerUpload.status, 201);
  const { job: providerJob } = await providerUpload.json();
  const underpaidUpload = await csvUpload(randomUUID(), alice);
  const underpaidJob = (await underpaidUpload.json()).job;
  await providerEvent({
    providerEventId: 'synthetic-underpaid-buyer-charge',
    jobId: underpaidJob.id,
    type: 'buyer_paid',
    amountMinor: 2999,
    currency: 'JPY',
    occurredAt: Date.now(),
  });
  const underpaidCurrent = (
    await call('GET', undefined, { path: '/api/csv-jobs' })
  ).jobs.find((job) => job.id === underpaidJob.id);
  check(underpaidCurrent.paymentStatus, 'payment_mismatch');
  await call(
    'POST',
    { action: 'accept', revision: underpaidCurrent.revision },
    { path: `/api/csv-jobs/${underpaidJob.id}`, status: 409 },
  );
  const wrongCurrencyUpload = await csvUpload(randomUUID(), alice);
  const wrongCurrencyJob = (await wrongCurrencyUpload.json()).job;
  await providerEvent({
    providerEventId: 'synthetic-wrong-currency-buyer-charge',
    jobId: wrongCurrencyJob.id,
    type: 'buyer_paid',
    amountMinor: 3000,
    currency: 'USD',
    occurredAt: Date.now(),
  });
  const wrongCurrencyCurrent = (
    await call('GET', undefined, { path: '/api/csv-jobs' })
  ).jobs.find((job) => job.id === wrongCurrencyJob.id);
  check(wrongCurrencyCurrent.paymentStatus, 'payment_mismatch');
  await call(
    'POST',
    { action: 'accept', revision: wrongCurrencyCurrent.revision },
    { path: `/api/csv-jobs/${wrongCurrencyJob.id}`, status: 409 },
  );
  const refundedOrderUpload = await csvUpload(randomUUID(), alice);
  const refundedOrderJob = (await refundedOrderUpload.json()).job;
  const refundedOrderCharge = 'synthetic-refunded-order-charge';
  await providerEvent({
    providerEventId: refundedOrderCharge,
    jobId: refundedOrderJob.id,
    type: 'buyer_paid',
    amountMinor: 3000,
    currency: 'JPY',
    occurredAt: Date.now(),
  });
  await providerEvent({
    providerEventId: 'synthetic-buyer-order-refund',
    relatedProviderEventId: refundedOrderCharge,
    relatedEventType: 'buyer_paid',
    jobId: refundedOrderJob.id,
    type: 'refund',
    amountMinor: 500,
    currency: 'JPY',
    occurredAt: Date.now(),
  });
  const refundedOrderCurrent = (
    await call('GET', undefined, { path: '/api/csv-jobs' })
  ).jobs.find((job) => job.id === refundedOrderJob.id);
  check(refundedOrderCurrent.paymentStatus, 'partially_refunded');
  await call(
    'POST',
    { action: 'accept', revision: refundedOrderCurrent.revision },
    { path: `/api/csv-jobs/${refundedOrderJob.id}`, status: 409 },
  );
  const disputedOrderUpload = await csvUpload(randomUUID(), alice);
  const disputedOrderJob = (await disputedOrderUpload.json()).job;
  const disputedOrderCharge = 'synthetic-disputed-order-charge';
  await providerEvent({
    providerEventId: disputedOrderCharge,
    jobId: disputedOrderJob.id,
    type: 'buyer_paid',
    amountMinor: 3000,
    currency: 'JPY',
    occurredAt: Date.now(),
  });
  await providerEvent({
    providerEventId: 'synthetic-buyer-order-dispute',
    relatedProviderEventId: disputedOrderCharge,
    relatedEventType: 'buyer_paid',
    jobId: disputedOrderJob.id,
    type: 'disputed',
    amountMinor: 0,
    currency: 'JPY',
    occurredAt: Date.now(),
  });
  const disputedOrderCurrent = (
    await call('GET', undefined, { path: '/api/csv-jobs' })
  ).jobs.find((job) => job.id === disputedOrderJob.id);
  check(disputedOrderCurrent.paymentStatus, 'disputed');
  await call(
    'POST',
    { action: 'accept', revision: disputedOrderCurrent.revision },
    { path: `/api/csv-jobs/${disputedOrderJob.id}`, status: 409 },
  );
  const canceledOrderUpload = await csvUpload(randomUUID(), alice);
  const canceledOrderJob = (await canceledOrderUpload.json()).job;
  const canceledOrderCharge = 'synthetic-canceled-order-charge';
  await providerEvent({
    providerEventId: canceledOrderCharge,
    jobId: canceledOrderJob.id,
    type: 'buyer_paid',
    amountMinor: 3000,
    currency: 'JPY',
    occurredAt: Date.now(),
  });
  await providerEvent({
    providerEventId: 'synthetic-buyer-order-canceled',
    relatedProviderEventId: canceledOrderCharge,
    relatedEventType: 'buyer_paid',
    jobId: canceledOrderJob.id,
    type: 'canceled',
    amountMinor: 0,
    currency: 'JPY',
    occurredAt: Date.now(),
  });
  const canceledOrderCurrent = (
    await call('GET', undefined, { path: '/api/csv-jobs' })
  ).jobs.find((job) => job.id === canceledOrderJob.id);
  check(canceledOrderCurrent.paymentStatus, 'canceled');
  await call(
    'POST',
    { action: 'accept', revision: canceledOrderCurrent.revision },
    { path: `/api/csv-jobs/${canceledOrderJob.id}`, status: 409 },
  );

  // Signed relationship mismatches are rejected before they can enter the active ledger.
  // The already-valid buyer charge must remain acceptable after all rejected variants.
  const relationshipUpload = await csvUpload(randomUUID(), alice);
  const relationshipJob = (await relationshipUpload.json()).job;
  const relationshipOtherUpload = await csvUpload(randomUUID(), alice);
  const relationshipOtherJob = (await relationshipOtherUpload.json()).job;
  const relationshipChargeId = 'synthetic-relationship-charge-forward';
  await providerEvent({
    providerEventId: relationshipChargeId,
    jobId: relationshipJob.id,
    type: 'buyer_paid',
    amountMinor: 3000,
    currency: 'JPY',
    occurredAt: Date.now(),
  });
  const rejectedRelationshipEvents = [
    {
      providerEventId: 'synthetic-refund-wrong-currency-forward',
      relatedProviderEventId: relationshipChargeId,
      relatedEventType: 'buyer_paid',
      jobId: relationshipJob.id,
      type: 'refund',
      amountMinor: 500,
      currency: 'USD',
      occurredAt: Date.now(),
    },
    {
      providerEventId: 'synthetic-refund-wrong-job-forward',
      relatedProviderEventId: relationshipChargeId,
      relatedEventType: 'buyer_paid',
      jobId: relationshipOtherJob.id,
      type: 'refund',
      amountMinor: 500,
      currency: 'JPY',
      occurredAt: Date.now(),
    },
    {
      providerEventId: 'synthetic-refund-wrong-type-forward',
      relatedProviderEventId: relationshipChargeId,
      relatedEventType: 'paid_to_owner',
      jobId: relationshipJob.id,
      type: 'refund',
      amountMinor: 500,
      currency: 'JPY',
      occurredAt: Date.now(),
    },
  ];
  for (const invalidEvent of rejectedRelationshipEvents) {
    const rejected = await providerEvent(invalidEvent, { status: 400 });
    check(rejected.code, 'PAYMENT_EVENT_MISMATCH');
    check(
      (
        await database
          .prepare(
            'SELECT COUNT(*) AS count FROM csv_payment_events WHERE provider = ? AND provider_event_id = ?',
          )
          .bind(paymentProvider, invalidEvent.providerEventId)
          .first()
      ).count,
      0,
    );
  }
  const relationshipCurrent = (
    await call('GET', undefined, { path: '/api/csv-jobs' })
  ).jobs.find((job) => job.id === relationshipJob.id);
  check(relationshipCurrent.paymentStatus, 'paid_by_buyer');
  const relationshipAccepted = await call(
    'POST',
    { action: 'accept', revision: relationshipCurrent.revision },
    { path: `/api/csv-jobs/${relationshipJob.id}` },
  );
  check(relationshipAccepted.job.status, 'accepted');
  check((await waitForCsvJob(relationshipJob.id, alice)).status, 'delivered');

  // Reverse arrival: retain an orphan payout adjustment, reject an incompatible
  // later original without inserting it, then retry the same ID with its valid type.
  const reverseRelationshipUpload = await csvUpload(randomUUID(), alice);
  const reverseRelationshipJob = (await reverseRelationshipUpload.json()).job;
  const reversePayoutId = 'synthetic-payout-original-reverse';
  await providerEvent({
    providerEventId: 'synthetic-payout-refund-before-original',
    relatedProviderEventId: reversePayoutId,
    relatedEventType: 'paid_to_owner',
    jobId: reverseRelationshipJob.id,
    type: 'refund',
    amountMinor: 100,
    currency: 'USD',
    occurredAt: Date.now(),
  });
  const invalidReverseOriginals = [
    {
      providerEventId: reversePayoutId,
      jobId: reverseRelationshipJob.id,
      type: 'buyer_paid',
      amountMinor: 3000,
      currency: 'JPY',
      occurredAt: Date.now(),
    },
    {
      providerEventId: reversePayoutId,
      jobId: reverseRelationshipJob.id,
      type: 'paid_to_owner',
      amountMinor: 4000,
      currency: 'JPY',
      occurredAt: Date.now(),
    },
    {
      providerEventId: reversePayoutId,
      jobId: relationshipOtherJob.id,
      type: 'paid_to_owner',
      amountMinor: 4000,
      currency: 'USD',
      occurredAt: Date.now(),
    },
  ];
  for (const invalidEvent of invalidReverseOriginals) {
    const rejected = await providerEvent(invalidEvent, { status: 400 });
    check(rejected.code, 'PAYMENT_EVENT_MISMATCH');
    check(
      (
        await database
          .prepare(
            'SELECT COUNT(*) AS count FROM csv_payment_events WHERE provider = ? AND provider_event_id = ?',
          )
          .bind(paymentProvider, reversePayoutId)
          .first()
      ).count,
      0,
    );
  }
  check(
    (
      await providerEvent({
        providerEventId: reversePayoutId,
        jobId: reverseRelationshipJob.id,
        type: 'paid_to_owner',
        amountMinor: 4000,
        currency: 'USD',
        occurredAt: Date.UTC(
          Number(monthJstNow().slice(0, 4)),
          Number(monthJstNow().slice(5, 7)) - 2,
          15,
          3,
        ),
      })
    ).duplicate,
    false,
  );
  await providerEvent({
    providerEventId: 'synthetic-reverse-buyer-charge',
    jobId: reverseRelationshipJob.id,
    type: 'buyer_paid',
    amountMinor: 3000,
    currency: 'JPY',
    occurredAt: Date.now(),
  });
  const reverseRelationshipCurrent = (
    await call('GET', undefined, { path: '/api/csv-jobs' })
  ).jobs.find((job) => job.id === reverseRelationshipJob.id);
  const reverseRelationshipAccepted = await call(
    'POST',
    { action: 'accept', revision: reverseRelationshipCurrent.revision },
    { path: `/api/csv-jobs/${reverseRelationshipJob.id}` },
  );
  check(reverseRelationshipAccepted.job.status, 'accepted');
  check(
    (await waitForCsvJob(reverseRelationshipJob.id, alice)).status,
    'delivered',
  );
  const mismatchRecoveryReconcile = await call(
    'POST',
    {
      action: 'reconcile_month',
      monthJst: monthJstNow(),
      idempotencyKey: randomUUID(),
    },
    { path: '/api/csv-operations', user: operator },
  );
  check(mismatchRecoveryReconcile.result.decisions.length > 0, true);

  // Operator retry returns the same replay payload on first submission and replay.
  const retryUpload = await csvUpload(randomUUID(), alice);
  const retryJob = (await retryUpload.json()).job;
  await providerEvent({
    providerEventId: 'synthetic-operator-retry-paid',
    jobId: retryJob.id,
    type: 'buyer_paid',
    amountMinor: 3000,
    currency: 'JPY',
    occurredAt: Date.now(),
  });
  await database
    .prepare(
      `UPDATE csv_jobs SET status = 'quality_failed', error_code = 'synthetic-retry-test',
     revision = revision + 1, updated_at = ? WHERE id = ? AND user_id = ?`,
    )
    .bind(Date.now(), retryJob.id, alice)
    .run();
  const retryState = (
    await call('GET', undefined, { path: '/api/csv-jobs' })
  ).jobs.find((job) => job.id === retryJob.id);
  const operatorRetryPayload = {
    action: 'retry',
    jobId: retryJob.id,
    revision: retryState.revision,
    idempotencyKey: randomUUID(),
  };
  const operatorRetryFirst = await call('POST', operatorRetryPayload, {
    path: '/api/csv-operations',
    user: operator,
  });
  const operatorRetryReplay = await call('POST', operatorRetryPayload, {
    path: '/api/csv-operations',
    user: operator,
  });
  check(operatorRetryFirst.result, {
    queued: true,
    jobId: retryJob.id,
    attempt: retryJob.attempt,
  });
  check(operatorRetryReplay.result, operatorRetryFirst.result);
  check((await waitForCsvJob(retryJob.id, alice)).status, 'delivered');

  const unauthenticatedEvent = await call(
    'POST',
    JSON.stringify({ provider: paymentProvider, jobId: providerJob.id }),
    {
      path: '/api/csv-payments/webhook',
      raw: true,
      contentType: 'application/json',
      status: 401,
    },
  );
  check(unauthenticatedEvent.error, 'Webhook署名を確認できません。');
  const refundTime = Date.now();
  const buyerCharge = {
    providerEventId: 'synthetic-exact-buyer-charge',
    jobId: providerJob.id,
    type: 'buyer_paid',
    amountMinor: 3000,
    currency: 'JPY',
    occurredAt: refundTime - 2000,
  };
  check((await providerEvent(buyerCharge)).duplicate, false);
  const firstRefund = {
    providerEventId: 'synthetic-refund-before-payout',
    relatedProviderEventId: 'synthetic-payout-original',
    jobId: providerJob.id,
    type: 'refund',
    relatedEventType: 'paid_to_owner',
    amountMinor: 1000,
    currency: 'USD',
    occurredAt: refundTime,
  };
  check((await providerEvent(firstRefund)).duplicate, false);
  const payout = {
    providerEventId: 'synthetic-payout-original',
    jobId: providerJob.id,
    type: 'paid_to_owner',
    amountMinor: 4000,
    currency: 'USD',
    occurredAt: refundTime + 1000,
  };
  const recordedPayout = await providerEvent(payout);
  check(recordedPayout.duplicate, false);
  const providerJobWithPayout = (
    await call('GET', undefined, {
      path: '/api/csv-jobs',
    })
  ).jobs.find((item) => item.id === providerJob.id);
  check(providerJobWithPayout.paymentStatus, 'paid_to_owner');
  check(providerJobWithPayout.paymentReference.length, 64);
  check((await providerEvent(payout)).duplicate, true);
  await providerEvent({ ...payout, amountMinor: 4001 }, { status: 409 });
  const acceptedWithPayoutAdjustment = await call(
    'POST',
    { action: 'accept', revision: providerJobWithPayout.revision },
    { path: `/api/csv-jobs/${providerJob.id}` },
  );
  check(acceptedWithPayoutAdjustment.job.status, 'accepted');
  check((await waitForCsvJob(providerJob.id)).status, 'delivered');

  const secondMarketUpload = await csvUpload(randomUUID(), alice);
  const secondMarketJob = (await secondMarketUpload.json()).job;
  await database
    .prepare(
      "UPDATE csv_jobs SET seller_id = 'market-b-seller' WHERE id = ? AND user_id = ?",
    )
    .bind(secondMarketJob.id, alice)
    .run();
  const secondMarketTime = Date.now();
  await database
    .prepare(
      `INSERT INTO csv_payment_events
     (id, provider, provider_event_id, related_provider_event_id, related_event_type,
      job_id, user_id, seller_id, type, amount_minor, currency, occurred_at,
      evidence_digest, source, created_at)
     VALUES (?, 'market-b', 'market-b-buyer-charge', NULL, NULL, ?, ?, 'market-b-seller',
      'buyer_paid', 3000, 'JPY', ?, ?, 'provider', ?),
     (?, 'market-b', 'market-b-payout', NULL, NULL, ?, ?, 'market-b-seller',
      'paid_to_owner', 100, 'USD', ?, ?, 'provider', ?)`,
    )
    .bind(
      randomUUID(),
      secondMarketJob.id,
      alice,
      secondMarketTime - 1,
      'b'.repeat(64),
      secondMarketTime,
      randomUUID(),
      secondMarketJob.id,
      alice,
      secondMarketTime,
      'c'.repeat(64),
      secondMarketTime,
    )
    .run();

  const failedPaymentUpload = await csvUpload(randomUUID(), alice);
  const failedPaymentJob = (await failedPaymentUpload.json()).job;
  await providerEvent({
    providerEventId: 'synthetic-payment-failed-before-cancel',
    jobId: failedPaymentJob.id,
    type: 'payment_failed',
    amountMinor: 0,
    currency: 'JPY',
    occurredAt: Date.now(),
  });
  const failedPaymentCurrent = (
    await call('GET', undefined, {
      path: '/api/csv-jobs',
    })
  ).jobs.find((job) => job.id === failedPaymentJob.id);
  const canceledAfterFailure = await call(
    'POST',
    {
      action: 'cancel',
      revision: failedPaymentCurrent.revision,
      reason: '決済失敗を確認しました',
    },
    { path: `/api/csv-jobs/${failedPaymentJob.id}` },
  );
  check(canceledAfterFailure.job.status, 'canceled');
  const paidUpload = await csvUpload(randomUUID(), alice);
  const paidJob = (await paidUpload.json()).job;
  const paidTime = Date.now();
  const canceledRefundPayout = {
    providerEventId: 'synthetic-refunded-payout-for-cancel',
    jobId: paidJob.id,
    type: 'buyer_paid',
    amountMinor: 3000,
    currency: 'JPY',
    occurredAt: paidTime,
  };
  await providerEvent(canceledRefundPayout);
  await providerEvent({
    providerEventId: 'synthetic-full-refund-for-cancel',
    relatedProviderEventId: canceledRefundPayout.providerEventId,
    relatedEventType: 'buyer_paid',
    jobId: paidJob.id,
    type: 'refund',
    amountMinor: 3000,
    currency: 'JPY',
    occurredAt: paidTime + 1000,
  });
  const fullyRefundedCurrent = (
    await call('GET', undefined, {
      path: '/api/csv-jobs',
    })
  ).jobs.find((job) => job.id === paidJob.id);
  check(fullyRefundedCurrent.paymentStatus, 'refunded');
  const canceledAfterRefund = await call(
    'POST',
    {
      action: 'cancel',
      revision: fullyRefundedCurrent.revision,
      reason: '全額返金を照合しました',
    },
    { path: `/api/csv-jobs/${paidJob.id}` },
  );
  check(canceledAfterRefund.job.status, 'canceled');

  const monthJst = monthJstNow();
  const firstReconciliation = await call(
    'POST',
    { action: 'reconcile_month', monthJst },
    { path: '/api/csv-operations', user: operator },
  );
  const aliceAccount = await database
    .prepare(
      'SELECT billing_account_id FROM csv_billing_accounts WHERE user_id = ?',
    )
    .bind(alice)
    .first();
  const bobAccount = await database
    .prepare(
      'SELECT billing_account_id FROM csv_billing_accounts WHERE user_id = ?',
    )
    .bind(bob)
    .first();
  const aliceDecision = firstReconciliation.result.decisions.find(
    (decision) => decision.billingAccountId === aliceAccount.billing_account_id,
  );
  const bobDecision = firstReconciliation.result.decisions.find(
    (decision) => decision.billingAccountId === bobAccount.billing_account_id,
  );
  check(aliceDecision.verifiedNetUsdMinor, 3100);
  check(aliceDecision.feeDueUsdMinor, 888);
  check(aliceDecision.status, 'due');
  check(aliceDecision.sellerId, 'multi-seller');
  check(aliceDecision.sellerIds.includes('market-b-seller'), true);
  check(bobDecision.verifiedNetUsdMinor, null);
  check(bobDecision.feeDueUsdMinor, null);
  check(bobDecision.status, 'evidence_review');
  const extraRefund = {
    providerEventId: 'synthetic-refund-later',
    relatedProviderEventId: 'synthetic-payout-original',
    relatedEventType: 'paid_to_owner',
    jobId: providerJob.id,
    type: 'refund',
    amountMinor: 200,
    currency: 'USD',
    occurredAt: Date.now() + 1000,
  };
  await providerEvent(extraRefund);
  const afterRefund = await call(
    'POST',
    { action: 'reconcile_month', monthJst },
    { path: '/api/csv-operations', user: operator },
  );
  const aliceAfterRefund = afterRefund.result.decisions.find(
    (decision) => decision.billingAccountId === aliceAccount.billing_account_id,
  );
  check(aliceAfterRefund.verifiedNetUsdMinor, 2900);
  check(aliceAfterRefund.feeDueUsdMinor, 0);
  check(aliceAfterRefund.status, 'waived');
  const monthlyRows = await database
    .prepare(
      'SELECT COUNT(*) AS count FROM csv_monthly_fee_decisions WHERE billing_account_id = ? AND month_jst = ?',
    )
    .bind(aliceAccount.billing_account_id, monthJst)
    .first();
  check(monthlyRows.count, 1);

  await call(
    'POST',
    {
      action: 'intervene',
      jobId: providerJob.id,
      intervention: 'payment_review',
      note: 'synthetic-only operator note must not be exported in plaintext',
    },
    { path: '/api/csv-operations', user: operator },
  );
  const initialOperations = await call('GET', undefined, {
    path: '/api/csv-operations',
    user: operator,
  });
  const paused = await call(
    'POST',
    {
      action: 'pause_intake',
      reason: 'synthetic integration pause',
      revision: initialOperations.intake.revision,
    },
    { path: '/api/csv-operations', user: operator },
  );
  check(paused.result.acceptingNew, false);
  check(paused.result.revision, initialOperations.intake.revision + 1);
  await call('POST', undefined, { path: '/api/csv-jobs/sample', status: 503 });
  const resumed = await call(
    'POST',
    { action: 'resume_intake', revision: paused.result.revision },
    { path: '/api/csv-operations', user: operator },
  );
  check(resumed.result.acceptingNew, true);

  const ownerControlId = initialOperations.jobs.find(
    (job) => job.id === providerJob.id,
  ).ownerControlId;
  const ownerPaused = await call(
    'POST',
    {
      action: 'pause_scope',
      scopeType: 'owner',
      scopeId: ownerControlId,
      revision: 0,
      reason: 'synthetic owner pause',
    },
    { path: '/api/csv-operations', user: operator },
  );
  check(ownerPaused.result.acceptingNew, false);
  check((await csvUpload(randomUUID(), alice)).status, 503);
  check((await csvUpload(randomUUID(), bob)).status, 201);
  const ownerResumed = await call(
    'POST',
    {
      action: 'resume_scope',
      scopeType: 'owner',
      scopeId: ownerControlId,
      revision: ownerPaused.result.revision,
    },
    { path: '/api/csv-operations', user: operator },
  );
  check(ownerResumed.result.acceptingNew, true);
  const sellerPaused = await call(
    'POST',
    {
      action: 'pause_scope',
      scopeType: 'seller',
      scopeId: 'platform-owner',
      revision: 0,
      reason: 'synthetic seller pause',
    },
    { path: '/api/csv-operations', user: operator },
  );
  check(sellerPaused.result.acceptingNew, false);
  check((await csvUpload(randomUUID(), bob)).status, 503);
  const sellerResumed = await call(
    'POST',
    {
      action: 'resume_scope',
      scopeType: 'seller',
      scopeId: 'platform-owner',
      revision: sellerPaused.result.revision,
    },
    { path: '/api/csv-operations', user: operator },
  );
  check(sellerResumed.result.acceptingNew, true);

  const costKey = randomUUID();
  const costInput = {
    action: 'direct_cost',
    jobId: providerJob.id,
    category: 'compute',
    amountMinor: 125,
    currency: 'USD',
    evidenceReference: 'synthetic cost receipt',
    idempotencyKey: costKey,
  };
  check(
    (
      await call('POST', costInput, {
        path: '/api/csv-operations',
        user: operator,
      })
    ).result.recorded,
    true,
  );
  check(
    (
      await call('POST', costInput, {
        path: '/api/csv-operations',
        user: operator,
      })
    ).result.recorded,
    true,
  );
  await call(
    'POST',
    { ...costInput, amountMinor: 126 },
    { path: '/api/csv-operations', user: operator, status: 409 },
  );
  check(
    (
      await database
        .prepare('SELECT COUNT(*) AS count FROM csv_job_costs WHERE job_id = ?')
        .bind(providerJob.id)
        .first()
    ).count,
    1,
  );
  const costAudit = await database
    .prepare(
      `SELECT COUNT(*) AS count FROM csv_operator_events WHERE actor_hash = ? AND idempotency_key = ?`,
    )
    .bind(createHash('sha256').update(operator).digest('hex'), costKey)
    .first();
  check(costAudit.count, 1);
  check(
    (
      await database
        .prepare(
          'SELECT COUNT(*) AS count FROM csv_operator_outbox WHERE actor_hash = ? AND idempotency_key = ?',
        )
        .bind(createHash('sha256').update(operator).digest('hex'), costKey)
        .first()
    ).count,
    1,
  );
  const dashboardAfterCost = await call('GET', undefined, {
    path: '/api/csv-operations',
    user: operator,
  });
  const dashboardJob = dashboardAfterCost.jobs.find(
    (job) => job.id === providerJob.id,
  );
  const acceptedAtRow = await database
    .prepare('SELECT accepted_at FROM csv_jobs WHERE id = ?')
    .bind(providerJob.id)
    .first();
  check(dashboardJob.dueAt, acceptedAtRow.accepted_at + 24 * 60 * 60 * 1000);
  check(
    dashboardJob.interventions.some((item) => item.action === 'payment_review'),
    true,
  );
  check(
    dashboardJob.directCosts.some(
      (item) => item.category === 'compute' && item.amountMinor === 125,
    ),
    true,
  );

  const beforeCancelUpload = await csvUpload(randomUUID(), bob);
  const beforeCancelJob = (await beforeCancelUpload.json()).job;
  await call(
    'POST',
    {
      action: 'manual_payment',
      jobId: beforeCancelJob.id,
      provider: 'market-assisted',
      type: 'buyer_paid',
      amountMinor: 3000,
      currency: 'JPY',
      evidenceReference: 'synthetic bob paid evidence',
      idempotencyKey: randomUUID(),
    },
    { path: '/api/csv-operations', user: operator },
  );
  const cancelKey = randomUUID();
  const scheduledCancellation = await call(
    'POST',
    { action: 'cancel_next_month', idempotencyKey: cancelKey },
    { path: '/api/csv-account', user: bob, noStore: false },
  );
  check(scheduledCancellation.result.status, 'cancel_pending');
  check(
    (
      await call(
        'POST',
        { action: 'cancel_next_month', idempotencyKey: cancelKey },
        { path: '/api/csv-account', user: bob, noStore: false },
      )
    ).result,
    scheduledCancellation.result,
  );
  check(
    (
      await call('GET', undefined, {
        path: '/api/csv-account',
        user: bob,
        noStore: false,
      })
    ).cancelAtMonth,
    scheduledCancellation.result.cancelAtMonth,
  );
  await database
    .prepare(
      'UPDATE csv_billing_accounts SET cancel_at_month = ? WHERE user_id = ?',
    )
    .bind(monthJst, bob)
    .run();
  check((await csvUpload(randomUUID(), bob)).status, 403);
  const beforeCancelCurrentJob = (
    await call('GET', undefined, { path: '/api/csv-jobs', user: bob })
  ).jobs.find((job) => job.id === beforeCancelJob.id);
  const existingWorkAfterCancellation = await call(
    'POST',
    { action: 'accept', revision: beforeCancelCurrentJob.revision },
    { path: `/api/csv-jobs/${beforeCancelJob.id}`, user: bob },
  );
  check(existingWorkAfterCancellation.job.status, 'accepted');
  check((await waitForCsvJob(beforeCancelJob.id, bob)).status, 'delivered');
  await call(
    'POST',
    {
      action: 'direct_cost',
      jobId: beforeCancelJob.id,
      category: 'compute',
      amountMinor: 75,
      currency: 'USD',
      evidenceReference: 'synthetic user-export cost evidence',
    },
    { path: '/api/csv-operations', user: operator },
  );
  const userExportDeliveryLink = await call(
    'POST',
    {},
    {
      path: `/api/csv-jobs/${beforeCancelJob.id}/delivery-link`,
      user: bob,
    },
  );
  const userExportResponse = await request('GET', undefined, {
    path: '/api/csv-account/export',
    user: bob,
  });
  check(userExportResponse.status, 200);
  const userExport = await userExportResponse.json();
  check(userExport.format, 'csv-user-data-export/2');
  check(
    userExport.jobs.some((item) => item.id === beforeCancelJob.id),
    true,
  );
  check(
    userExport.jobs
      .find((item) => item.id === beforeCancelJob.id)
      .downloads.some((item) => item.kind === 'input'),
    true,
  );
  check(
    userExport.directCosts.some(
      (item) => item.job_id === beforeCancelJob.id && item.amount_minor === 75,
    ),
    true,
  );
  check(
    userExport.deliveryRevisions.some(
      (item) =>
        item.job_id === beforeCancelJob.id && item.revision_number === 1,
    ),
    true,
  );
  check(
    userExport.deliveryLinks.some(
      (item) => item.job_id === beforeCancelJob.id && item.id,
    ),
    true,
  );
  const exportedLinkRow = await database
    .prepare(
      'SELECT token_hash FROM csv_delivery_links WHERE job_id = ? AND user_id = ?',
    )
    .bind(beforeCancelJob.id, bob)
    .first();
  check(JSON.stringify(userExport).includes(exportedLinkRow.token_hash), false);
  const exportedCapabilityToken = new URL(
    userExportDeliveryLink.url,
    base,
  ).hash.slice('#token='.length);
  check(JSON.stringify(userExport).includes(exportedCapabilityToken), false);
  check(JSON.stringify(userExport).includes(alice), false);

  const exported = await request('GET', undefined, {
    path: '/api/csv-operations/export',
    user: operator,
  });
  check(exported.status, 200);
  check(exported.headers.get('cache-control'), 'private, no-store');
  const exportData = await exported.json();
  check(exportData.format, 'csv-operations-export/2');
  check(
    exportData.directCosts.some((item) => item.job_id === providerJob.id),
    true,
  );
  check(
    exportData.billingAccountEvents.some(
      (item) => item.action === 'billing_cancel_next_month',
    ),
    true,
  );
  check(
    exportData.payments.some(
      (item) => item.provider_event_id === payout.providerEventId,
    ),
    true,
  );
  check(
    exportData.payments.some(
      (item) => item.related_provider_event_id === payout.providerEventId,
    ),
    true,
  );
  check(
    exportData.payments.some(
      (item) => item.related_event_type === 'paid_to_owner',
    ),
    true,
  );
  check(JSON.stringify(exportData).includes(alice), false);
  check(JSON.stringify(exportData).includes(bob), false);
  check(
    JSON.stringify(exportData).includes(
      'synthetic-only operator note must not be exported in plaintext',
    ),
    false,
  );

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
  // Agent code publication: real bundled API and D1, synthetic owner/input only.
  const codePath = '/api/sky/code';
  const codeDraft = { id: randomUUID(), repoId: randomUUID(), expectedRevision: 0,
    title: 'Fixture greeting', author: 'Fixture author', description: 'Returns a greeting.',
    message: 'Initial version', license: 'MIT', files: [{ path: 'agent.js', source: 'export function run() { return "hello"; }' }], publishConfirmed: true };
  await call('POST', codeDraft, {path:codePath,user:null,status:401});
  await call('POST', {...codeDraft, files:[{path:'agent.js',source:'eval(input);'}]}, {path:codePath,status:422});
  const codeFirst = (await call('POST',codeDraft,{path:codePath,status:201})).commit;
  check(codeFirst.inspection.provider,'spider'); check(codeFirst.workflow.status,'completed');
  check((await call('POST',codeDraft,{path:codePath,status:201})).commit.id,codeFirst.id);
  await call('POST',{...codeDraft,id:randomUUID(),expectedRevision:1},{path:codePath,user:bob,status:409});
  const codeSecond = (await call('POST',{...codeDraft,id:randomUUID(),expectedRevision:1,message:'Update greeting',protector:'secret-check',protectionChangeConfirmed:true},{path:codePath,status:201})).commit;
  check(codeSecond.parentId,codeFirst.id); check(codeSecond.inspection.provider,'secret-check');
  check((await call('GET',undefined,{path:`${codePath}?repo=${codeDraft.repoId}&revision=1`,user:null})).commit.id,codeFirst.id);
  await call('PATCH',{action:'hide',repoId:codeDraft.repoId,expectedRevision:2},{path:codePath});
  await call('GET',undefined,{path:`${codePath}?repo=${codeDraft.repoId}`,user:null,status:404});
  check((await call('GET',undefined,{path:`${codePath}?repo=${codeDraft.repoId}`})).history.length,2);

  console.log(
    `仕事API: ${assertions} assertions passed (認証境界・分離・競合・順序・再送・再起動後の保存)`,
  );
} finally {
  await stop();
  rmSync(temporary, { recursive: true, force: true });
}
