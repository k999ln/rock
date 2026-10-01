import { generateKeyPairSync } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

const directory = fileURLToPath(new URL('.', import.meta.url));
const repository = resolve(directory, '../..');
const keyPair = generateKeyPairSync('ed25519');
const publicKey = new Uint8Array(
  keyPair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32),
);
const migrations = await readD1Migrations(resolve(repository, 'drizzle'));
const a2aMigrations = migrations.filter((migration) => {
  const number = Number(migration.name.slice(0, 4));
  return number >= 19 && number <= 26;
});
let cardRequestCount = 0;
const seenMessageRequests = new Set<string>();
const approvedMessages = new Map([
  ['33333333-3333-4333-8333-333333333009', 'Cloudflare Workers Vitest controlled A2A success fixture.'],
  ['33333333-3333-4333-8333-333333333010', 'Cloudflare A2A response-loss fixture.'],
]);

async function outboundService(request: Request) {
  const url = new URL(request.url);
  if (url.origin !== 'https://a2a.example.com')
    throw new Error(`Unexpected A2A mock origin: ${url.origin}`);
  if (request.method === 'GET' && url.pathname === '/.well-known/agent-card.json') {
    cardRequestCount += 1;
    if (cardRequestCount > 2) throw new Error('Agent Card discovery was repeated after both fixtures.');
    return Response.json({
      name: 'vitest-a2a-agent',
      description: 'Controlled independent A2A fixture agent.',
      version: '1.0.0',
      supportedInterfaces: [{
        url: 'https://a2a.example.com/rpc',
        protocolBinding: 'JSONRPC',
        protocolVersion: '1.0',
      }],
    });
  }
  if (request.method === 'POST' && url.pathname === '/rpc') {
    const rpc = await request.json() as {
      id?: string;
      method?: string;
      params?: { message?: { messageId?: string; parts?: Array<{ text?: string }> } };
    };
    const messageId = rpc.params?.message?.messageId;
    if (rpc.method !== 'message/send' || !messageId ||
      approvedMessages.get(messageId) !== rpc.params?.message?.parts?.[0]?.text)
      throw new Error('A2A request did not match the owner-approved fixture.');
    if (seenMessageRequests.has(messageId))
      throw new Error('The approved A2A message was sent more than once.');
    seenMessageRequests.add(messageId);
    if (messageId === '33333333-3333-4333-8333-333333333010')
      return Response.json({ error: 'remote accepted request but response was lost' }, { status: 503 });
    return Response.json({
      jsonrpc: '2.0',
      id: rpc.id,
      result: {
        task: {
          id: 'vitest-remote-task-1',
          contextId: 'vitest-context-1',
          status: { state: 'TASK_STATE_COMPLETED' },
          artifacts: [{ name: 'result.txt', parts: [{ text: 'Controlled Cloudflare Workflow result.' }] }],
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
          A2A_EGRESS_ALLOWED_ORIGINS: 'https://a2a.example.com',
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
          A2A_TEST_PRIVATE_KEY_PKCS8: Buffer.from(
            keyPair.privateKey.export({ type: 'pkcs8', format: 'der' }),
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
