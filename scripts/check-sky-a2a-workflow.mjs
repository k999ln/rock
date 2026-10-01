import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { createA2AIntentDigests } from '../lib/a2a-authorization.ts';
import {
  a2aBrokerAuthorizationSigningBytes,
  A2A_BROKER_AUTHORIZATION_SCHEMA,
} from '../lib/a2a-broker-authorization.ts';
import { encryptA2AInput } from '../lib/a2a-input-crypto.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
const temporary = mkdtempSync(join(tmpdir(), 'rock-sky-a2a-workflow-'));
const state = join(temporary, 'state');
const configPath = join(temporary, 'wrangler.jsonc');
const inputKey = 'b'.repeat(64);
const workflowName = 'rockstar-a2a-delegation';
const workerName = 'rockstar-sky-agent-runtime-workflow-check';
const targetOrigin = 'https://example.com';
const message = 'Local e2e fixture; no remote request is authorized.';
const workerPort = await availablePort();
let server;
let serverOutput = '';

function rawPublicKey(key) {
  return new Uint8Array(
    key.export({ type: 'spki', format: 'der' }).subarray(-32),
  );
}

function sql(value) {
  if (typeof value === 'number') return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function runWrangler(args, { timeout = 30_000 } = {}) {
  const result = spawnSync(process.execPath, [wrangler, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout,
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: 'false',
      WRANGLER_WRITE_LOGS: 'false',
      WRANGLER_LOG_PATH: join(temporary, 'logs'),
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `wrangler ${args.join(' ')} failed (${result.status}):\n${result.stdout}\n${result.stderr}`,
    );
  return `${result.stdout}\n${result.stderr}`;
}

function commandJson(output) {
  const start = output.lastIndexOf('\n[');
  assert.notEqual(start, -1, 'Wrangler D1 output should end in JSON results');
  return JSON.parse(output.slice(start + 1));
}

async function availablePort() {
  const { createServer } = await import('node:net');
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const address = listener.address();
  assert(address && typeof address === 'object');
  const { port } = address;
  listener.close();
  await once(listener, 'close');
  return port;
}

async function signedProof(fixture, privateKey, now) {
  const digests = await createA2AIntentDigests({
    ownerUserId: fixture.owner,
    id: fixture.id,
    parentJobId: fixture.parentJobId,
    messageId: fixture.messageId,
    targetOrigin,
    targetAgentName: fixture.agentName,
    targetAgentVersion: '1.0.0',
    protocolVersion: '1.0',
    budgetCurrency: 'USD',
    budgetLimitMinor: 0,
    parentBudgetLimitMinor: 0,
    deadlineAt: fixture.deadlineAt,
    message,
  });
  const expired = fixture.kind === 'expired-proof';
  const issuedAt = expired ? now - 600_001 : now;
  const expiresAt = expired ? now - 300_001 : now + 300_000;
  const proof = {
    schema: A2A_BROKER_AUTHORIZATION_SCHEMA,
    authorityId: fixture.authorityId,
    ownerUserId: fixture.owner,
    deviceRef: fixture.deviceRef,
    delegationId: fixture.id,
    parentJobId: fixture.parentJobId,
    messageId: fixture.messageId,
    targetOrigin,
    targetAgentName: fixture.agentName,
    targetAgentVersion: '1.0.0',
    protocolVersion: '1.0',
    inputSha256: digests.inputSha256,
    budgetCurrency: 'USD',
    budgetLimitMinor: 0,
    deadlineAt: fixture.deadlineAt,
    authorizationSha256: digests.authorizationSha256,
    issuedAt,
    expiresAt,
    keyId: fixture.keyId,
    signature: '',
  };
  proof.signature = sign(
    null,
    a2aBrokerAuthorizationSigningBytes(proof),
    privateKey,
  ).toString('base64url');
  return proof;
}

function fixture(kind, idNumber) {
  const suffix = String(idNumber).padStart(12, '0');
  return {
    kind,
    id: `11111111-1111-4111-8111-${suffix}`,
    parentJobId: `22222222-2222-4222-8222-${suffix}`,
    messageId: `33333333-3333-4333-8333-${suffix}`,
    owner: `workflow-${kind}`,
    deviceRef: `fixture-${kind}`,
    authorityId: `fixture-${kind}`,
    keyId: `key-${kind}`,
    agentName: `fixture-${kind}`,
    deadlineAt: Date.now() + 600_000,
    keyPair: generateKeyPairSync('ed25519'),
  };
}

async function seedFixtureRows(fixtures) {
  const statements = [];
  for (const item of fixtures) {
    const digests = await createA2AIntentDigests({
      ownerUserId: item.owner,
      id: item.id,
      parentJobId: item.parentJobId,
      messageId: item.messageId,
      targetOrigin,
      targetAgentName: item.agentName,
      targetAgentVersion: '1.0.0',
      protocolVersion: '1.0',
      budgetCurrency: 'USD',
      budgetLimitMinor: 0,
      deadlineAt: item.deadlineAt,
      message,
    });
    const encrypted = await encryptA2AInput(
      message,
      inputKey,
      item.owner,
      item.id,
      digests.inputSha256,
    );
    const now = Date.now();
    statements.push(
      `INSERT INTO agent_delegation_budget_pools (owner_user_id, parent_job_id, currency, budget_limit_minor, reserved_minor, settled_minor, revision, created_at, updated_at) VALUES (${[
        item.owner,
        item.parentJobId,
        'USD',
        0,
        0,
        0,
        0,
        now,
        now,
      ].map(sql).join(',')});`,
      `INSERT INTO agent_delegations (id, owner_user_id, parent_job_id, idempotency_key, message_id, target_origin, target_agent_name, target_agent_version, protocol_version, input_sha256, authorization_sha256, budget_currency, budget_limit_minor, parent_budget_limit_minor, deadline_at, state, revision, created_at, updated_at) VALUES (${[
        item.id,
        item.owner,
        item.parentJobId,
        `workflow-${item.kind}`,
        item.messageId,
        targetOrigin,
        item.agentName,
        '1.0.0',
        '1.0',
        digests.inputSha256,
        digests.authorizationSha256,
        'USD',
        0,
        0,
        item.deadlineAt,
        'prepared',
        0,
        now,
        now,
      ].map(sql).join(',')});`,
      `INSERT INTO agent_delegation_budget_reservations (delegation_id, owner_user_id, parent_job_id, currency, reserved_minor, settled_minor, state, created_at, updated_at) VALUES (${[
        item.id,
        item.owner,
        item.parentJobId,
        'USD',
        0,
        null,
        'held',
        now,
        now,
      ].map(sql).join(',')});`,
      `INSERT INTO agent_delegation_inputs (delegation_id, owner_user_id, payload_ciphertext, nonce, input_sha256, key_version, expires_at, created_at) VALUES (${[
        item.id,
        item.owner,
        encrypted.ciphertext,
        encrypted.nonce,
        encrypted.inputSha256,
        encrypted.keyVersion,
        item.deadlineAt,
        now,
      ].map(sql).join(',')});`,
    );
    if (item.kind !== 'no-proof') {
      const proof = await signedProof(item, item.keyPair.privateKey, now);
      statements.push(
        `INSERT INTO agent_delegation_broker_authorizations (delegation_id, owner_user_id, device_ref, authority_id, key_id, proof_json, expires_at, created_at) VALUES (${[
          item.id,
          item.owner,
          item.deviceRef,
          item.authorityId,
          item.keyId,
          JSON.stringify(proof),
          proof.expiresAt,
          now,
        ].map(sql).join(',')});`,
      );
    }
  }
  const seedPath = join(temporary, 'seed.sql');
  writeFileSync(seedPath, statements.join('\n'));
  runWrangler([
    'd1',
    'execute',
    'site-creator-d1',
    '--local',
    '--persist-to',
    state,
    '--file',
    seedPath,
    '--config',
    configPath,
  ]);
}

async function waitUntilReady() {
  const url = `http://127.0.0.1:${workerPort}`;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error(`wrangler dev exited early:\n${serverOutput}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (response.status === 404) return;
    } catch {
      // The local server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`wrangler dev did not become ready:\n${serverOutput}`);
}

function describeInstance(id) {
  return runWrangler([
    'workflows',
    'instances',
    'describe',
    workflowName,
    id,
    '--local',
    '--port',
    String(workerPort),
  ]);
}

async function waitForInstance(id) {
  const deadline = Date.now() + 20_000;
  let output = '';
  while (Date.now() < deadline) {
    output = describeInstance(id);
    if (/Status:\s+✅ Completed/.test(output)) return output;
    if (/Status:\s+❌ Errored/.test(output))
      throw new Error(`Workflow ${id} errored:\n${output}`);
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Workflow ${id} did not complete:\n${output}`);
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  server.kill('SIGINT');
  const exited = once(server, 'exit').catch(() => undefined);
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
  if (server.exitCode === null) server.kill('SIGKILL');
}

try {
  const baseConfig = JSON.parse(
    readFileSync(join(root, 'services/sky-agent-runtime/wrangler.jsonc'), 'utf8'),
  );
  const fixtures = [
    fixture('no-proof', 1),
    fixture('expired-proof', 2),
    fixture('revoked-proof', 3),
  ];
  baseConfig.name = workerName;
  baseConfig.main = join(root, 'services/sky-agent-runtime/src/worker.ts');
  baseConfig.d1_databases[0].migrations_dir = join(root, 'drizzle');
  baseConfig.vars = {
    A2A_DELEGATION_EXECUTION_ENABLED: 'true',
    A2A_EGRESS_ALLOWED_ORIGINS: targetOrigin,
    A2A_INPUT_ENCRYPTION_KEY: inputKey,
    A2A_TRUSTED_BROKER_KEYS: JSON.stringify(
      fixtures
        .filter((item) => item.kind !== 'no-proof')
        .map((item) => ({
          authorityId: item.authorityId,
          ownerUserId: item.owner,
          deviceRef: item.deviceRef,
          keyId: item.keyId,
          publicKeyHex: Buffer.from(rawPublicKey(item.keyPair.publicKey)).toString('hex'),
          status: item.kind === 'revoked-proof' ? 'revoked' : 'active',
        })),
    ),
  };
  writeFileSync(configPath, JSON.stringify(baseConfig, null, 2));
  runWrangler([
    'd1',
    'migrations',
    'apply',
    'site-creator-d1',
    '--local',
    '--persist-to',
    state,
    '--config',
    configPath,
  ]);
  await seedFixtureRows(fixtures);

  server = spawn(
    process.execPath,
    [
      wrangler,
      'dev',
      '--config',
      configPath,
      '--ip',
      '127.0.0.1',
      '--port',
      String(workerPort),
      '--persist-to',
      state,
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        WRANGLER_SEND_METRICS: 'false',
        WRANGLER_WRITE_LOGS: 'false',
        WRANGLER_LOG_PATH: join(temporary, 'logs'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  server.stdout.on('data', (chunk) => (serverOutput += chunk.toString()));
  server.stderr.on('data', (chunk) => (serverOutput += chunk.toString()));
  await waitUntilReady();

  for (const item of fixtures) {
    const instanceId = `a2a-${item.kind}-${randomUUID()}`;
    runWrangler([
      'workflows',
      'trigger',
      workflowName,
      JSON.stringify({
        ownerUserId: item.owner,
        delegationId: item.id,
        operation: 'dispatch',
      }),
      '--local',
      '--port',
      String(workerPort),
      '--id',
      instanceId,
    ]);
    let description;
    try {
      description = await waitForInstance(instanceId);
    } catch (error) {
      const diagnostic = runWrangler([
        'd1',
        'execute',
        'site-creator-d1',
        '--local',
        '--persist-to',
        state,
        '--command',
        `SELECT id, state, remote_state, revision FROM agent_delegations WHERE id=${sql(item.id)}; SELECT delegation_id, state, reserved_minor FROM agent_delegation_budget_reservations WHERE delegation_id=${sql(item.id)}; SELECT revision, event_type, from_state, to_state FROM agent_delegation_events WHERE delegation_id=${sql(item.id)} ORDER BY revision;`,
        '--config',
        configPath,
      ]);
      throw new Error(`${error instanceof Error ? error.message : String(error)}\nD1 diagnostic:\n${diagnostic}`);
    }
    assert.match(description, /verify-native-broker-authorization-before-egress/);
    assert.match(description, /Output:\s+false/);
    assert.doesNotMatch(description, /discover-approved-agent/);
  }

  const ids = fixtures.map((item) => sql(item.id)).join(',');
  const output = runWrangler([
    'd1',
    'execute',
    'site-creator-d1',
    '--local',
    '--persist-to',
    state,
    '--command',
    `SELECT id, state, remote_state FROM agent_delegations WHERE id IN (${ids}) ORDER BY id; SELECT COUNT(*) AS remote_send_claims FROM agent_delegation_events WHERE delegation_id IN (${ids}) AND event_type='remote_send_claimed';`,
    '--config',
    configPath,
  ]);
  const results = commandJson(output);
  const states = results[0]?.results ?? [];
  assert.equal(states.length, fixtures.length);
  for (const row of states) {
    assert.equal(row.state, 'remote_failed');
    assert.equal(row.remote_state, 'PREFLIGHT_FAILED_BEFORE_SEND');
  }
  assert.equal(results[1]?.results?.[0]?.remote_send_claims, 0);

  console.log(
    JSON.stringify(
      {
        result: 'passed',
        runtime: 'wrangler-dev-local-workflow-and-d1',
        cases: fixtures.map(({ kind, id }) => ({
          kind,
          delegationId: id,
          state: 'PREFLIGHT_FAILED_BEFORE_SEND',
        })),
        remoteSendClaims: 0,
        agentDiscoveryStepReached: false,
      },
      null,
      2,
    ),
  );
} finally {
  await stopServer();
  rmSync(temporary, { recursive: true, force: true });
}
