import { createHash, generateKeyPairSync } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
import {
  a2aUsageReceiptSigningBytes,
  type A2AUsageReceipt,
} from '../../lib/a2a-usage-receipt.ts';
import { a2aAgentCardSha256 } from '../../lib/a2a-agent-directory.ts';
import { createSkyToolPackageDraft, skyToolPackageKey, skyToolPackageSha256 } from '../../lib/sky-tool-package.ts';
import { skyPackageSchemaSha256 } from '../../lib/sky-package-runtime.ts';

const directory = fileURLToPath(new URL('.', import.meta.url));
const repository = resolve(directory, '../..');
const packageRuntimeExtensionUri = 'https://rockstar.example/extensions/sky-package-runtime/v2';
const keyPair = generateKeyPairSync('ed25519');
const usageKeyPair = generateKeyPairSync('ed25519');
const packageBindingKeyPair = generateKeyPairSync('ed25519');
const packageBindingPublicKey = new Uint8Array(
  packageBindingKeyPair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32),
);
const packageManifest = createSkyToolPackageDraft({
  sourceKind: 'github',
  sourceUrl: 'https://github.com/vitest/package-binding-fixture',
  developerName: 'Vitest Fixture',
  developerId: 'vitest-fixture',
  license: 'MIT',
});
const packageKey = skyToolPackageKey(packageManifest);
const packageManifestSha256 = await skyToolPackageSha256(packageManifest);
const packageInputSchemaSha256 = await skyPackageSchemaSha256(packageManifest.io.inputSchema);
const packageOutputSchemaSha256 = await skyPackageSchemaSha256(packageManifest.io.outputSchema);
const publicKey = new Uint8Array(
  keyPair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32),
);
const usagePublicKey = new Uint8Array(
  usageKeyPair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32),
);
const fixtureAgentCard = {
  name: 'vitest-a2a-agent',
  description: 'Controlled independent A2A fixture agent.',
  version: '1.0.0',
  supportedInterfaces: [{
    url: 'https://a2a.example.com/rpc',
    protocolBinding: 'JSONRPC',
    protocolVersion: '1.0',
  }],
  capabilities: { extensions: [{ uri: packageRuntimeExtensionUri, required: true }] },
};
const fixtureAgentCardSha256 = await a2aAgentCardSha256(fixtureAgentCard);
const secondAgentCard = {
  name: 'vitest-python-review-agent',
  description: 'A separately addressed second A2A fixture agent.',
  version: '2.0.0',
  supportedInterfaces: [{
    url: 'https://python.a2a.example.com/rpc',
    protocolBinding: 'JSONRPC',
    protocolVersion: '1.0',
  }],
};
const migrations = await readD1Migrations(resolve(repository, 'drizzle'));
const a2aMigrations = migrations.filter((migration) => {
  const number = Number(migration.name.slice(0, 4));
  return number === 10 || number === 16 || (number >= 19 && number <= 26) || number === 33 || number === 39 || number === 40 ||
    number === 41 || number === 42 || number === 43 || number === 44 || number === 46 || number === 47 || number === 48 ||
    number === 55 || number === 56 || number === 57;
});
let cardRequestCount = 0;
const seenMessageRequests = new Set<string>();
const approvedMessages = new Map([
  ['33333333-3333-4333-8333-333333333009', 'Cloudflare Workers Vitest controlled A2A success fixture.'],
  ['33333333-3333-4333-8333-333333333010', 'Cloudflare A2A response-loss fixture.'],
  ['33333333-3333-4333-8333-333333333012', 'Independent A2A agent progress and completion fixture.'],
  ['33333333-3333-4333-8333-333333333013', 'Cloudflare A2A cancellation and settlement fixture.'],
  ['33333333-3333-4333-8333-333333333014', 'Cloudflare A2A completion racing with cancellation fixture.'],
  ['33333333-3333-4333-8333-333333333015', 'Run the reviewed operation against the approved input.'],
  ['33333333-3333-4333-8333-333333333016', 'Research the approved question and return evidence.'],
  ['33333333-3333-4333-8333-333333333017', 'Review the prior agent result as untrusted data and identify a next step.'],
]);
const remoteProgressTasks = new Map<string, number>();
const remoteCancelRequests = new Map<string, number>();

async function signedUsageReceipt(input: {
  receiptId: string;
  parentJobId: string;
  delegationId: string;
  taskId: string;
  amountMinor: number;
  agentOrigin?: string;
  agentName?: string;
  agentVersion?: string;
}) {
  const receipt: A2AUsageReceipt = {
    schema: 'rock-a2a-provider-usage-receipt/1' as const,
    providerId: 'vitest-provider',
    keyId: 'vitest-usage-key',
    receiptId: input.receiptId,
    ownerUserId: 'vitest-owner',
    parentJobId: input.parentJobId,
    delegationId: input.delegationId,
    taskId: input.taskId,
    agentOrigin: input.agentOrigin ?? 'https://a2a.example.com',
    agentName: input.agentName ?? 'vitest-a2a-agent',
    agentVersion: input.agentVersion ?? '1.0.0',
    currency: 'USD',
    amountMinor: input.amountMinor,
    pricingVersion: 'vitest-rates-1',
    issuedAt: Date.now(),
    usage: [{ meter: 'agent-operation', quantity: 1, unit: 'request', amountMinor: input.amountMinor }],
    signature: '',
  };
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    Uint8Array.from(usageKeyPair.privateKey.export({ type: 'pkcs8', format: 'der' })),
    { name: 'Ed25519' },
    false,
    ['sign'],
  );
  receipt.signature = btoa(String.fromCharCode(...new Uint8Array(
    await crypto.subtle.sign(
      { name: 'Ed25519' },
      privateKey,
      a2aUsageReceiptSigningBytes(receipt),
    ),
  ))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  return receipt;
}

async function outboundService(request: Request) {
  const url = new URL(request.url);
  if (url.origin !== 'https://a2a.example.com' && url.origin !== 'https://python.a2a.example.com')
    throw new Error(`Unexpected A2A mock origin: ${url.origin}`);
  if (request.method === 'GET' && url.pathname === '/.well-known/agent-card.json') {
    cardRequestCount += 1;
    if (cardRequestCount > 16) throw new Error('Agent Card discovery exceeded the bounded workflow fixtures.');
    return Response.json(url.origin === 'https://python.a2a.example.com' ? secondAgentCard : fixtureAgentCard);
  }
  if (request.method === 'POST' && url.pathname === '/rpc') {
    const rpc = await request.json() as {
      id?: string;
      method?: string;
      params?: {
        id?: string;
        message?: {
          messageId?: string;
          parts?: Array<{ text?: string }>;
          extensions?: string[];
          metadata?: Record<string, unknown>;
        };
      };
    };
    const taskId = rpc.params?.id;
    if (rpc.method === 'CancelTask' &&
      (taskId === 'vitest-cancel-task-1' || taskId === 'vitest-race-task-1')) {
      remoteCancelRequests.set(
        taskId,
        (remoteCancelRequests.get(taskId) ?? 0) + 1,
      );
      if (remoteCancelRequests.get(taskId) !== 1)
        throw new Error('The remote A2A cancellation was sent more than once.');
      const isRace = taskId === 'vitest-race-task-1';
      const usageReceipt = await signedUsageReceipt({
        receiptId: isRace ? 'vitest-race-usage-receipt-1' : 'vitest-cancel-usage-receipt-1',
        parentJobId: isRace ? '22222222-2222-4222-8222-222222222014' : '22222222-2222-4222-8222-222222222013',
        delegationId: isRace ? '11111111-1111-4111-8111-111111111014' : '11111111-1111-4111-8111-111111111013',
        taskId,
        amountMinor: isRace ? 9 : 11,
      });
      return Response.json({
        jsonrpc: '2.0', id: rpc.id,
        result: {
          id: taskId,
          contextId: isRace ? 'vitest-race-context-1' : 'vitest-cancel-context-1',
          status: { state: isRace ? 'TASK_STATE_COMPLETED' : 'TASK_STATE_CANCELED' },
          ...(isRace ? { artifacts: [{ name: 'race-result.txt', parts: [{ text: 'Completed while cancellation was pending.' }] }] } : {}),
          metadata: { 'org.rockstar.usageReceipt': usageReceipt },
        },
      });
    }
    if (rpc.method === 'CancelTask') throw new Error('Unexpected remote cancellation.');
    if (rpc.method === 'GetTask' && rpc.params?.id === 'vitest-progress-task-1') {
      const reads = (remoteProgressTasks.get(rpc.params.id) ?? 0) + 1;
      remoteProgressTasks.set(rpc.params.id, reads);
      if (reads === 1) {
        return Response.json({
          jsonrpc: '2.0', id: rpc.id,
          result: {
            id: rpc.params.id,
            contextId: 'vitest-progress-context-1',
            status: { state: 'TASK_STATE_WORKING' },
          },
        });
      }
      const usageReceipt = await signedUsageReceipt({
        receiptId: 'vitest-progress-usage-receipt-1',
        parentJobId: '22222222-2222-4222-8222-222222222012',
        delegationId: '11111111-1111-4111-8111-111111111012',
        taskId: rpc.params.id,
        amountMinor: 42,
      });
      return Response.json({
        jsonrpc: '2.0', id: rpc.id,
        result: {
          id: rpc.params.id,
          contextId: 'vitest-progress-context-1',
          status: { state: 'TASK_STATE_COMPLETED' },
          artifacts: [{ name: 'result.txt', parts: [{ text: 'Verified asynchronous agent result.' }] }],
          metadata: { 'org.rockstar.usageReceipt': usageReceipt },
        },
      });
    }
    if (rpc.method === 'GetTask') throw new Error('Unexpected remote task lookup.');
    const messageId = rpc.params?.message?.messageId;
    const messageText = rpc.params?.message?.parts?.[0]?.text;
    const approvedText = typeof messageId === 'string' && (
      messageId === '33333333-3333-4333-8333-333333333017'
        ? typeof messageText === 'string' && messageText.startsWith('Task: independently review the prior Agent result')
        : approvedMessages.get(messageId) === messageText
    );
    if (rpc.method !== 'SendMessage' || !messageId || !approvedText)
      throw new Error('A2A request did not match the owner-approved fixture.');
    if (seenMessageRequests.has(messageId))
      throw new Error('The approved A2A message was sent more than once.');
    seenMessageRequests.add(messageId);
    const packageInvocation = rpc.params?.message?.metadata?.['org.rockstar.sky-package-runtime.v2'];
    if (packageInvocation !== undefined) {
      const messageText = rpc.params?.message?.parts?.[0]?.text ?? '';
      const invocation = packageInvocation as Record<string, unknown>;
      if (request.headers.get('A2A-Extensions') !== packageRuntimeExtensionUri ||
        JSON.stringify(rpc.params?.message?.extensions) !== JSON.stringify([packageRuntimeExtensionUri]) ||
        invocation.schema !== 'rockstar-sky-package-invocation/1' ||
        invocation.runtimeExtensionUri !== packageRuntimeExtensionUri ||
        invocation.packageKey !== packageKey ||
        invocation.manifestSha256 !== packageManifestSha256 ||
        invocation.operationId !== 'run-package' ||
        invocation.inputSchemaSha256 !== packageInputSchemaSha256 ||
        invocation.outputSchemaSha256 !== packageOutputSchemaSha256 ||
        invocation.pricingVersion !== 'vitest-rates-1' ||
        typeof invocation.bindingId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(invocation.bindingId) ||
        typeof invocation.bindingDigest !== 'string' || !/^[a-f0-9]{64}$/.test(invocation.bindingDigest) ||
        invocation.requestSha256 !== createHash('sha256').update(messageText).digest('hex'))
        throw new Error('Provider Package executor received an invocation outside its reviewed binding.');
      const taskId = 'vitest-package-execution-task-1';
      const usageReceipt = await signedUsageReceipt({
        receiptId: 'vitest-package-execution-receipt-1',
        parentJobId: '22222222-2222-4222-8222-222222222015',
        delegationId: '11111111-1111-4111-8111-111111111015',
        taskId,
        amountMinor: 23,
      });
      return Response.json({
        jsonrpc: '2.0', id: rpc.id,
        result: { task: {
          id: taskId,
          status: { state: 'TASK_STATE_COMPLETED' },
          artifacts: [{ name: 'package-output.txt', parts: [{
            text: `Executed ${String(invocation.operationId)} using binding ${String(invocation.bindingId)} (${String(invocation.bindingDigest)}) with input ${invocation.requestSha256}`,
          }] }],
          metadata: { 'org.rockstar.usageReceipt': usageReceipt },
        } },
      });
    }
    if (messageId === '33333333-3333-4333-8333-333333333012') {
      remoteProgressTasks.set('vitest-progress-task-1', 0);
      return Response.json({
        jsonrpc: '2.0', id: rpc.id,
        result: {
          task: {
            id: 'vitest-progress-task-1',
            contextId: 'vitest-progress-context-1',
            status: { state: 'TASK_STATE_SUBMITTED' },
          },
        },
      });
    }
    if (messageId === '33333333-3333-4333-8333-333333333013') {
      return Response.json({
        jsonrpc: '2.0', id: rpc.id,
        result: {
          task: {
            id: 'vitest-cancel-task-1',
            contextId: 'vitest-cancel-context-1',
            status: { state: 'TASK_STATE_WORKING' },
          },
        },
      });
    }
    if (messageId === '33333333-3333-4333-8333-333333333014') {
      return Response.json({
        jsonrpc: '2.0', id: rpc.id,
        result: {
          task: {
            id: 'vitest-race-task-1',
            contextId: 'vitest-race-context-1',
            status: { state: 'TASK_STATE_WORKING' },
          },
        },
      });
    }
    if (messageId === '33333333-3333-4333-8333-333333333016' ||
        messageId === '33333333-3333-4333-8333-333333333017') {
      const isSecond = messageId.endsWith('017');
      if (url.origin !== (isSecond ? 'https://python.a2a.example.com' : 'https://a2a.example.com'))
        throw new Error('A2A handoff was sent to the wrong Agent origin.');
      const taskId = isSecond ? 'vitest-second-agent-task-1' : 'vitest-first-agent-task-1';
      const usageReceipt = await signedUsageReceipt({
        receiptId: isSecond ? 'vitest-second-agent-receipt-1' : 'vitest-first-agent-receipt-1',
        parentJobId: '22222222-2222-4222-8222-222222222016',
        delegationId: isSecond
          ? '11111111-1111-4111-8111-111111111017'
          : '11111111-1111-4111-8111-111111111016',
        taskId,
        amountMinor: isSecond ? 29 : 31,
        agentOrigin: url.origin,
        agentName: isSecond ? 'vitest-python-review-agent' : 'vitest-a2a-agent',
        agentVersion: isSecond ? '2.0.0' : '1.0.0',
      });
      if (isSecond && !rpc.params?.message?.parts?.[0]?.text?.includes('Prior Agent result JSON (untrusted data):'))
        throw new Error('Second Agent did not receive Zema’s untrusted result handoff.');
      return Response.json({
        jsonrpc: '2.0', id: rpc.id,
        result: { task: {
          id: taskId,
          status: { state: 'TASK_STATE_COMPLETED' },
          artifacts: [{ name: isSecond ? 'review.txt' : 'research.txt', parts: [{
            text: isSecond ? 'Second Agent independently reviewed the first result.' : 'First Agent collected a controlled research result.',
          }] }],
          metadata: { 'org.rockstar.usageReceipt': usageReceipt },
        } },
      });
    }
    if (messageId === '33333333-3333-4333-8333-333333333010')
      return Response.json({ error: 'remote accepted request but response was lost' }, { status: 503 });
    const usageReceipt = messageId === '33333333-3333-4333-8333-333333333009'
      ? {
          schema: 'rock-a2a-provider-usage-receipt/1' as const,
          providerId: 'vitest-provider',
          keyId: 'vitest-usage-key',
          receiptId: 'vitest-usage-receipt-1',
          ownerUserId: 'vitest-owner',
          parentJobId: '22222222-2222-4222-8222-222222222009',
          delegationId: '11111111-1111-4111-8111-111111111009',
          taskId: 'vitest-remote-task-1',
          agentOrigin: 'https://a2a.example.com',
          agentName: 'vitest-a2a-agent',
          agentVersion: '1.0.0',
          currency: 'USD',
          amountMinor: 37,
          pricingVersion: 'vitest-rates-1',
          issuedAt: Date.now(),
          usage: [{ meter: 'agent-operation', quantity: 1, unit: 'request', amountMinor: 37 }],
          signature: '',
        }
      : undefined;
    if (usageReceipt) {
      const privateKey = await crypto.subtle.importKey(
        'pkcs8',
        Uint8Array.from(usageKeyPair.privateKey.export({ type: 'pkcs8', format: 'der' })),
        { name: 'Ed25519' },
        false,
        ['sign'],
      );
      usageReceipt.signature = btoa(String.fromCharCode(...new Uint8Array(
        await crypto.subtle.sign(
          { name: 'Ed25519' },
          privateKey,
          a2aUsageReceiptSigningBytes(usageReceipt),
        ),
      ))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    }
    return Response.json({
      jsonrpc: '2.0',
      id: rpc.id,
      result: {
        task: {
          id: 'vitest-remote-task-1',
          contextId: 'vitest-context-1',
          status: { state: 'TASK_STATE_COMPLETED' },
          artifacts: [{ name: 'result.txt', parts: [{ text: 'Controlled Cloudflare Workflow result.' }] }],
          ...(usageReceipt ? { metadata: { 'org.rockstar.usageReceipt': usageReceipt } } : {}),
        },
      },
    });
  }
  throw new Error(`Unexpected A2A mock request: ${request.method} ${request.url}`);
}

export default defineConfig({
  test: {
    include: ['services/sky-agent-runtime/test/**/*.test.mjs'],
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,
  },
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: resolve(directory, 'wrangler.jsonc'),
      },
      miniflare: {
        bindings: {
          A2A_DELEGATION_EXECUTION_ENABLED: 'true',
          A2A_PRICE_QUOTES_REQUIRED: 'true',
          ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED: 'true',
          A2A_EGRESS_ALLOWED_ORIGINS: 'https://a2a.example.com,https://python.a2a.example.com',
          A2A_TEST_OUTBOUND_REQUIRED: 'true',
          A2A_INPUT_ENCRYPTION_KEY: 'b'.repeat(64),
          A2A_TRUSTED_BROKER_KEYS: JSON.stringify([
            {
              authorityId: 'vitest-authority',
              ownerUserId: 'vitest-owner',
              deviceRef: 'vitest-device',
              keyId: 'vitest-key',
              publicKeyHex: Buffer.from(publicKey).toString('hex'),
              status: 'active',
            },
          ]),
          A2A_TRUSTED_USAGE_KEYS: JSON.stringify([
            {
              providerId: 'vitest-provider',
              keyId: 'vitest-usage-key',
              agentOrigin: 'https://a2a.example.com',
              publicKeyHex: Buffer.from(usagePublicKey).toString('hex'),
              status: 'active',
            },
            {
              providerId: 'vitest-provider',
              keyId: 'vitest-usage-key',
              agentOrigin: 'https://python.a2a.example.com',
              publicKeyHex: Buffer.from(usagePublicKey).toString('hex'),
              status: 'active',
            },
          ]),
          SKY_PACKAGE_RUNTIME_BINDING_TRUSTED_KEYS: JSON.stringify([{
            providerId: 'vitest-provider',
            keyId: 'vitest-package-key',
            agentOrigin: 'https://a2a.example.com',
            publicKeyHex: Buffer.from(packageBindingPublicKey).toString('hex'),
            packagePins: [{ packageKey, manifestSha256: packageManifestSha256 }],
            status: 'active',
          }]),
          SKY_PACKAGE_RUNTIME_EXTENSION_URI: packageRuntimeExtensionUri,
          A2A_TEST_PACKAGE_BINDING_PRIVATE_KEY_PKCS8: Buffer.from(
            packageBindingKeyPair.privateKey.export({ type: 'pkcs8', format: 'der' }),
          ).toString('base64'),
          A2A_TEST_PACKAGE_MANIFEST_JSON: JSON.stringify(packageManifest),
          A2A_TEST_PACKAGE_MANIFEST_SHA256: packageManifestSha256,
          A2A_TEST_PACKAGE_INPUT_SCHEMA_SHA256: packageInputSchemaSha256,
          A2A_TEST_PACKAGE_OUTPUT_SCHEMA_SHA256: packageOutputSchemaSha256,
          A2A_TEST_AGENT_CARD_SHA256: fixtureAgentCardSha256,
          A2A_TEST_PRIVATE_KEY_PKCS8: Buffer.from(
            keyPair.privateKey.export({ type: 'pkcs8', format: 'der' }),
          ).toString('base64'),
          A2A_TEST_USAGE_PRIVATE_KEY_PKCS8: Buffer.from(
            usageKeyPair.privateKey.export({ type: 'pkcs8', format: 'der' }),
          ).toString('base64'),
          A2A_TEST_MIGRATIONS_JSON: JSON.stringify(a2aMigrations),
        },
        serviceBindings: {
          A2A_TEST_OUTBOUND: outboundService,
        },
      },
    }),
  ],
});
