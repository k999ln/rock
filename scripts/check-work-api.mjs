// Protocol checks only. Synthetic identity headers simulate the Sites gateway on
// a loopback-only Worker; never send these headers to a deployed site.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
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
import { encryptA2AArtifact } from '../lib/a2a-input-crypto.ts';
import {
  a2aBrokerAuthorizationSigningBytes,
  A2A_BROKER_AUTHORIZATION_SCHEMA,
} from '../lib/a2a-broker-authorization.ts';
import { createA2AIntentDigests } from '../lib/a2a-authorization.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(join(tmpdir(), 'rock-api-check-'));
const state = join(temporary, 'state');
let base;
const alice = `api-check-${randomUUID()}`,
  bob = `api-check-${randomUUID()}`;
const brokerKeyPair = generateKeyPairSync('ed25519');
const brokerPublicKey = new Uint8Array(
  brokerKeyPair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32),
);
const esimPackageHash = 'e'.repeat(64);
let a2aExecutionEnabled = false;
let worker,
  database,
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
async function createBrokerProof(delegation, message) {
  const intent = {
    id: delegation.id,
    ownerUserId: alice,
    deviceRef: 'fixture-device-a',
    parentJobId: delegation.parentJobId,
    messageId: delegation.messageId,
    targetOrigin: delegation.targetOrigin,
    targetAgentName: delegation.targetAgentName,
    targetAgentVersion: delegation.targetAgentVersion,
    protocolVersion: delegation.protocolVersion,
    budgetCurrency: delegation.budgetCurrency,
    budgetLimitMinor: delegation.budgetLimitMinor,
    parentBudgetLimitMinor: delegation.parentBudgetLimitMinor,
    deadlineAt: delegation.deadlineAt,
    message,
  };
  const digests = await createA2AIntentDigests(intent);
  const proof = {
    schema: A2A_BROKER_AUTHORIZATION_SCHEMA,
    authorityId: 'fixture-rockstaros',
    ownerUserId: alice,
    deviceRef: 'fixture-device-a',
    delegationId: delegation.id,
    parentJobId: delegation.parentJobId,
    messageId: delegation.messageId,
    targetOrigin: delegation.targetOrigin,
    targetAgentName: delegation.targetAgentName,
    targetAgentVersion: delegation.targetAgentVersion,
    protocolVersion: delegation.protocolVersion,
    inputSha256: digests.inputSha256,
    budgetCurrency: delegation.budgetCurrency,
    budgetLimitMinor: delegation.budgetLimitMinor,
    deadlineAt: delegation.deadlineAt,
    authorizationSha256: digests.authorizationSha256,
    issuedAt: Date.now(),
    expiresAt: Math.min(Date.now() + 4 * 60_000, delegation.deadlineAt),
    keyId: 'fixture-device-key',
    signature: '',
  };
  proof.signature = sign(
    null,
    a2aBrokerAuthorizationSigningBytes(proof),
    brokerKeyPair.privateKey,
  ).toString('base64url');
  return proof;
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
        ESIMGO_API_KEY: 'fixture-esim-provider-key-only',
        ESIMGO_PROFILE_HASH_SECRET: 'c'.repeat(64),
        ESIMGO_INSTALL_MATERIAL_KEY: 'f'.repeat(64),
        ESIMGO_CALLBACK_DEDUPE_SECRET: 'd'.repeat(64),
        ESIMGO_PROVIDER_DEBIT_ENABLED: 'false',
        ESIMGO_PLAN_CATALOG_JSON: JSON.stringify({
          version: 'api-check-v1',
          plans: [{
            packageKey: 'api-check-esim',
            manifestSha256: esimPackageHash,
            providerBundleName: 'fixture_jp_1gb',
            providerCurrency: 'USD',
            maximumWholesaleMinor: 1000,
            retailCurrency: 'jpy',
            retailAmountMinor: 1500,
            providerMinorToRetailNumerator: 1,
            providerMinorToRetailDenominator: 1,
            providerFeeReserveRetailMinor: 100,
            minimumGrossMarginRetailMinor: 200,
          }],
        }),
        A2A_INPUT_ENCRYPTION_KEY: 'a'.repeat(64),
        A2A_TRUSTED_BROKER_KEYS: JSON.stringify([{
          authorityId: 'fixture-rockstaros',
          ownerUserId: alice,
          deviceRef: 'fixture-device-a',
          keyId: 'fixture-device-key',
          publicKeyHex: Buffer.from(brokerPublicKey).toString('hex'),
          status: 'active',
        }]),
        ...(a2aExecutionEnabled
          ? { A2A_DELEGATION_EXECUTION_ENABLED: 'true' }
          : {}),
      },
      d1Databases: Object.fromEntries(
        config.d1_databases.map((db) => [db.binding, db.database_id]),
      ),
      resourcePersistencePath: state,
      host: '127.0.0.1',
      port: 0,
    }),
  );
  base = (await worker.ready).origin;
  database = await worker.getD1Database('DB');
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
  const statusBeforeSchema = await call('GET', undefined, {
    path: '/api/sky/service-status', user: null,
  });
  check(statusBeforeSchema.database, 'unavailable');
  check(statusBeforeSchema.payments, 'unconfigured');
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
  for (const file of readdirSync(join(temporary, 'migrations'))
    .filter((file) => file.endsWith('.sql'))
    .sort()) {
    for (const sql of readFileSync(join(temporary, 'migrations', file), 'utf8')
      .split('--> statement-breakpoint')
      .filter((sql) => sql.trim()))
      await database.prepare(sql).run();
  }
  const serviceStatus = await call('GET', undefined, {
    path: '/api/sky/service-status', user: null,
  });
  check(serviceStatus.database, 'available');
  check(serviceStatus.payments, 'unconfigured');
  check(serviceStatus.legalAiConfigured, false);
  check(serviceStatus.jevConfigured, false);
  check(Object.keys(serviceStatus).sort(), ['version', 'database', 'csvStorageConfigured', 'legalAiConfigured', 'patentAiConfigured', 'jevConfigured', 'payments'].sort());
  const esimOrderId = randomUUID();
  await database.prepare(`INSERT INTO sky_commerce_orders
    (id,buyer_user_id,seller_user_id,mode,package_key,manifest_sha256,name,amount_minor,
     commission_minor,refunded_minor,currency,account_id,offer_revision,terms_url,refund_policy,
     status,active_key,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    esimOrderId, alice, 'api-check-seller', 'live', 'api-check-esim', esimPackageHash,
    'API eSIM plan', 1500, 0, 0, 'jpy', 'acct_api_check', 1,
    'https://example.invalid/terms', 'fixture only', 'paid', null, Date.now(), Date.now(),
  ).run();
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
  const esimIssuePath = `/api/esim/orders/${randomUUID()}/issue`;
  await call('POST', {}, { path: esimIssuePath, user: null, status: 401 });
  await call('POST', {}, { path: esimIssuePath, status: 409 });
  await call('POST', {}, { path: esimIssuePath, user: bob, status: 409 });
  const disabledEsimIssue = await call('POST', {}, {
    path: `/api/esim/orders/${esimOrderId}/issue`, status: 503,
  });
  check(disabledEsimIssue.error, 'esim_issuance_disabled');
  const installMaterialPath = `/api/esim/orders/${esimOrderId}/install-material`;
  await call('POST', { action: 'fetch', deliveryRequestId: randomUUID() }, {
    path: installMaterialPath, user: null, status: 401,
  });
  const notReadyInstallMaterial = await call('POST', {
    action: 'fetch', deliveryRequestId: randomUUID(),
  }, { path: installMaterialPath, status: 409 });
  check(notReadyInstallMaterial.error, 'install_material_not_ready');
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
  const a2aAgentsPath = '/api/sky/a2a-agents';
  check(
    (await call('GET', undefined, { path: a2aAgentsPath })).agents,
    [],
  );
  check(
    (await call('GET', undefined, { path: a2aAgentsPath, user: bob })).agents,
    [],
  );
  await call(
    'POST',
    { origin: 'https://agent.example.org' },
    { path: a2aAgentsPath, user: null, status: 401 },
  );
  await call(
    'POST',
    { origin: 'https://agent.example.org' },
    { path: a2aAgentsPath, status: 403 },
  );
  const a2aPath = '/api/sky/a2a-delegations';
  await call('GET', undefined, {
    path: `${a2aPath}?parentJobId=${input.id}`,
    user: null,
    status: 401,
  });
  const a2aParent = {
    id: randomUUID(),
    title: 'A2A API検証用の仕事',
    templateId: 'article',
  };
  await call('POST', a2aParent, { status: 201 });
  const delegationInput = {
    id: randomUUID(),
    parentJobId: a2aParent.id,
    idempotencyKey: `api:${randomUUID()}`,
    messageId: randomUUID(),
    targetOrigin: 'https://agent.example.com',
    targetAgentName: 'Fixture Research Agent',
    targetAgentVersion: '1.2.0',
    message: '公開資料の要点を整理してください。',
    budgetCurrency: 'USD',
    budgetLimitMinor: 250,
    parentBudgetLimitMinor: 1000,
    deadlineAt: Date.now() + 10 * 60_000,
  };
  await call('POST', delegationInput, {
    path: a2aPath,
    origin: 'https://not-rock.invalid',
    status: 403,
  });
  await call(
    'POST',
    { ...delegationInput, targetOrigin: 'http://agent.example.test' },
    { path: a2aPath, status: 400 },
  );
  let { delegation } = await call('POST', delegationInput, {
    path: a2aPath,
    status: 201,
  });
  const approval = (await call('POST', delegationInput, { path: a2aPath }))
    .approval;
  check(delegation.state, 'awaiting_approval');
  check(approval.required, true);
  const a2aItem = `${a2aPath}/${delegation.id}`;
  await call(
    'PATCH',
    {
      action: 'approve',
      authorizationSha256: approval.digest,
      message: delegationInput.message,
    },
    { path: a2aItem, status: 503 },
  );
  a2aExecutionEnabled = true;
  await stop();
  await start();
  await call('PATCH', {
    action: 'approve',
    authorizationSha256: approval.digest,
    message: delegationInput.message,
  }, { path: a2aItem, status: 403 });
  const proof = await createBrokerProof(delegation, delegationInput.message);
  const brokerProofPath = `${a2aItem}/broker-authorization`;
  await call('POST', { proof, message: delegationInput.message }, {
    path: brokerProofPath,
    user: bob,
    status: 404,
  });
  await call('POST', {
    proof: { ...proof, budgetLimitMinor: 999 },
    message: delegationInput.message,
  }, { path: brokerProofPath, status: 403 });
  await call('POST', { proof, message: '異なる本文を添付します。' }, {
    path: brokerProofPath,
    status: 409,
  });
  const acceptedProof = await call('POST', { proof, message: delegationInput.message }, {
    path: brokerProofPath,
  });
  check(acceptedProof.accepted, true);
  check(acceptedProof.expiresAt, proof.expiresAt);
  await call('POST', { proof, message: delegationInput.message }, { path: brokerProofPath });
  await call('POST', {
    proof: { ...proof, keyId: 'another-key' },
    message: delegationInput.message,
  }, { path: brokerProofPath, status: 403 });
  await call('GET', undefined, { path: a2aItem, user: bob, status: 404 });
  await call(
    'PATCH',
    {
      action: 'approve',
      authorizationSha256: approval.digest,
      message: delegationInput.message,
    },
    { path: a2aItem, user: bob, status: 404 },
  );
  await call(
    'PATCH',
    {
      action: 'approve',
      authorizationSha256: 'f'.repeat(64),
      message: delegationInput.message,
    },
    { path: a2aItem, status: 409 },
  );
  await call(
    'PATCH',
    {
      action: 'approve',
      authorizationSha256: approval.digest,
      message: '別の本文に差し替えます。',
    },
    { path: a2aItem, status: 409 },
  );
  ({ delegation } = await call(
    'PATCH',
    {
      action: 'approve',
      authorizationSha256: approval.digest,
      message: delegationInput.message,
    },
    { path: a2aItem },
  ));
  check(delegation.state, 'prepared');
  const encrypted = await database
    .prepare(
      'SELECT payload_ciphertext AS ciphertext, nonce, input_sha256 AS inputSha256, key_version AS keyVersion FROM agent_delegation_inputs WHERE delegation_id = ?',
    )
    .bind(delegation.id)
    .first();
  check(typeof encrypted.ciphertext, 'string');
  check(encrypted.ciphertext.includes(delegationInput.message), false);
  check(encrypted.inputSha256, delegation.inputSha256);
  check(encrypted.keyVersion, 'aes-256-gcm-v1');
  ({ delegation } = await call('GET', undefined, { path: a2aItem }));
  check(delegation.state, 'prepared');
  check(
    (
      await call('GET', undefined, {
        path: `${a2aPath}?parentJobId=${a2aParent.id}`,
      })
    ).delegations.length,
    1,
  );
  const artifactTaskId = `provider-task-${randomUUID()}`;
  const resultDocument = {
    schemaVersion: 1,
    artifacts: [{ name: 'summary', textParts: ['fixture result'] }],
    omittedNonTextParts: 0,
    truncated: false,
  };
  const resultContent = JSON.stringify(resultDocument);
  const encryptedResult = await encryptA2AArtifact(
    resultContent,
    'a'.repeat(64),
    alice,
    delegation.id,
    artifactTaskId,
  );
  const resultBytes = new TextEncoder().encode(resultContent).byteLength;
  await database
    .prepare(`UPDATE agent_delegations SET state = 'remote_completed',
      remote_task_id = ?, remote_state = 'TASK_STATE_COMPLETED', artifacts_captured = 1
      WHERE owner_user_id = ? AND id = ?`)
    .bind(artifactTaskId, alice, delegation.id)
    .run();
  await database
    .prepare(`INSERT INTO agent_delegation_artifacts (
      id, delegation_id, owner_user_id, remote_task_id, artifact_sha256,
      payload_ciphertext, nonce, key_version, byte_length, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      randomUUID(), delegation.id, alice, artifactTaskId,
      encryptedResult.artifactSha256, encryptedResult.ciphertext,
      encryptedResult.nonce, encryptedResult.keyVersion, resultBytes, Date.now(),
    )
    .run();
  const artifactPath = `${a2aItem}/artifacts`;
  await call('GET', undefined, { path: artifactPath, user: null, status: 401 });
  await call('GET', undefined, { path: artifactPath, user: bob, status: 404 });
  const resultResponse = await call('GET', undefined, { path: artifactPath });
  check(resultResponse.captured, true);
  check(resultResponse.artifacts[0].document, resultDocument);
  const canceledInput = {
    ...delegationInput,
    id: randomUUID(),
    messageId: randomUUID(),
    idempotencyKey: `api:${randomUUID()}`,
  };
  const canceledDraft = (
    await call('POST', canceledInput, { path: a2aPath, status: 201 })
  ).delegation;
  ({ delegation } = await call(
    'PATCH',
    { action: 'cancel' },
    { path: `${a2aPath}/${canceledDraft.id}` },
  ));
  check(delegation.state, 'cancelled_before_dispatch');
  check(
    (
      await call('GET', undefined, {
        path: `${a2aPath}?parentJobId=${a2aParent.id}`,
        user: bob,
      })
    ).delegations,
    [],
  );
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
  const teamPath = '/api/coconala-team';
  await call('GET', undefined, { path: teamPath, user: null, status: 401 });
  const teamInput = {
    id: randomUUID(),
    terms: {
      title: 'API検証用の受託案件',
      orderReference: 'synthetic-001',
      clientLabel: '架空の依頼者',
      workerName: '架空の担当者',
      scope: '架空の原稿制作',
      deliveryDate: '2026-10-10',
      deliveryPlace: '代表者へ非公開納品',
      inspectionDate: '2026-10-12',
      revisionScope: '誤字1回',
      rights: '利用範囲を本人確認',
      grossYen: 10000,
      estimatedPlatformFeePercent: 22,
      workerFeeYen: 7566,
      workerPaymentDate: '2026-11-10',
      platformRulesReference: 'synthetic-rules-check',
      customerDisclosureReference: 'synthetic-client-message',
      workerTermsReference: 'synthetic-worker-terms',
    },
  };
  let { caseFile } = await call('POST', teamInput, {
    path: teamPath,
    status: 201,
  });
  check(caseFile.status, 'draft');
  check(
    (await call('GET', undefined, { path: teamPath, user: bob })).cases,
    [],
  );
  const teamPatch = (action, extra = {}, options = {}) =>
    call(
      'PATCH',
      {
        caseId: caseFile.id,
        revision: caseFile.revision,
        command: { id: randomUUID(), action, ...extra },
      },
      { path: teamPath, ...options },
    );
  await teamPatch('assign', {}, { user: bob, status: 404 });
  ({ caseFile } = await teamPatch('assign'));
  check(caseFile.status, 'assigned');
  ({ caseFile } = await teamPatch('record_worker_payment', {
    amountYen: 3000,
    reference: 'synthetic-bank-001',
  }));
  check(caseFile.workerPayments[0].amountYen, 3000);
  await teamPatch(
    'record_worker_payment',
    {
      amountYen: 5000,
      reference: 'synthetic-bank-002',
    },
    { status: 400 },
  );
  await call(
    'PATCH',
    {
      caseId: caseFile.id,
      revision: 0,
      command: { id: randomUUID(), action: 'assign' },
    },
    { path: teamPath, status: 409 },
  );
  await stop();
  await start();
  check(
    (await call()).jobs.find((item) => item.id === job.id),
    job,
  );
  check((await call('GET', undefined, { user: bob })).jobs, []);
  check(
    (await call('GET', undefined, { path: teamPath })).cases.find(
      (item) => item.id === caseFile.id,
    ),
    caseFile,
  );
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
