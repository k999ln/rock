import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import {
  createSkyToolPackageDraft,
  parseSkyToolPackage,
  skyToolPackageKey,
  skyToolPackageSha256,
} from '../lib/sky-tool-package.ts';
import { skyToolPackageStore } from '../lib/sky-tool-package-store.ts';
import { skyDeveloperTokenStore } from '../lib/sky-developer-auth.ts';
import {
  parseSkyToolEvent,
  skyToolEventStore,
} from '../lib/sky-tool-events.ts';

const draft = (change = {}) =>
  createSkyToolPackageDraft({
    sourceKind: 'github',
    sourceUrl: 'https://github.com/example/invoice-checker',
    developerName: 'Example Inc.',
    developerId: 'example-inc',
    license: 'MIT',
    ...change,
  });

void test('Rock Studio creates a reviewable PC package from a GitHub source', () => {
  const manifest = draft();
  assert.equal(manifest.schema, 'sky-tool-package/1');
  assert.equal(manifest.id, 'dev.example-inc.invoice-checker');
  assert.equal(manifest.adapter.connectionType, 'mcp_stdio');
  assert.deepEqual(manifest.capabilities.executionTargets, ['pc']);
  assert.equal(manifest.generation.reviewRequired.length, 6);
  assert.equal(skyToolPackageKey(manifest), 'dev.example-inc.invoice-checker@0.1.0');
});

void test('OpenAPI intake extracts operation hints but keeps generated claims under review', () => {
  const manifest = draft({
    sourceKind: 'openapi',
    sourceUrl: 'https://docs.example.com/openapi.json',
    openApi: {
      openapi: '3.1.0',
      info: {
        title: 'Invoice API',
        description: '請求書を検査して構造化された確認結果を返すAPIです。',
        version: '2.1.0',
      },
      servers: [{ url: 'https://api.example.com/v1' }],
      paths: {
        '/checks': {
          post: { operationId: 'createCheck', summary: '請求書を検査する' },
        },
      },
    },
  });
  assert.equal(manifest.name, 'Invoice API');
  assert.equal(manifest.version, '2.1.0');
  assert.equal(manifest.adapter.endpointUrl, 'https://api.example.com/v1');
  assert.deepEqual(manifest.llm.useWhen, ['請求書を検査する']);
  assert.ok(manifest.generation.reviewRequired.includes('入出力Schema'));
});

void test('financial or external writes cannot bypass per-run confirmation', () => {
  const manifest = draft();
  assert.throws(
    () =>
      parseSkyToolPackage({
        ...manifest,
        capabilities: {
          ...manifest.capabilities,
          permissions: [...manifest.capabilities.permissions, 'financial_action'],
          sideEffects: ['financial'],
        },
      }),
    /実行ごとの確認/,
  );
});

void test('package SHA is canonical and changes with the declared version', async () => {
  const first = draft();
  const reordered = JSON.parse(JSON.stringify(first));
  const firstHash = await skyToolPackageSha256(first);
  assert.equal(await skyToolPackageSha256(reordered), firstHash);
  assert.notEqual(
    await skyToolPackageSha256({ ...first, version: '0.1.1' }),
    firstHash,
  );
});

void test('owner registration is immutable and declared publication is visible but not installable', { timeout: 10_000 }, async (t) => {
  const worker = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("studio fixture")}}',
      compatibilityDate: '2026-08-18',
      d1Databases: ['DB'],
      host: '127.0.0.1',
      port: 0,
    }),
  );
  t.after(() => worker.dispose());
  const db = await worker.getD1Database('DB');
  const migration = readFileSync(
    new URL('../drizzle/0010_gray_fat_cobra.sql', import.meta.url),
    'utf8',
  );
  for (const statement of migration
    .split('--> statement-breakpoint')
    .filter((value) => value.trim()))
    await db.prepare(statement).run();

  const store = skyToolPackageStore(db);
  const manifest = draft();
  const saved = await store.create('developer-a', manifest);
  assert.equal(saved?.status, 'submitted');
  assert.equal(saved?.installable, false);
  assert.equal(await store.create('developer-b', manifest), null);
  assert.equal((await store.listRegistry()).length, 0);

  const published = await store.publishDeclared(
    'developer-a',
    saved.packageKey,
    saved.manifestSha256,
  );
  assert.equal(published?.status, 'published_declared');
  assert.equal(published?.installable, false);
  assert.equal((await store.listRegistry())[0].manifest.name, manifest.name);
  assert.equal(
    await store.publishDeclared(
      'developer-a',
      saved.packageKey,
      saved.manifestSha256,
    ),
    null,
  );

  const tokenStore = skyDeveloperTokenStore(db);
  const issued = await tokenStore.create('developer-a', 'local SDK');
  assert.match(issued.token, /^sky_dev_[a-zA-Z0-9_-]+$/);
  assert.equal(await tokenStore.authenticate(issued.token), 'developer-a');
  assert.equal((await tokenStore.list('developer-a'))[0].lastUsedAt > 0, true);

  const event = parseSkyToolEvent({
    packageKey: saved.packageKey,
    toolName: 'check_invoice',
    installationId: 'installation_fixture_01',
    outcome: 'succeeded',
    durationMs: 42,
    occurredAt: new Date().toISOString(),
  });
  const eventStore = skyToolEventStore(db);
  await eventStore.record('developer-a', event);
  const usage = await eventStore.summary('developer-a');
  assert.deepEqual(
    {
      packageKey: usage[0].packageKey,
      toolName: usage[0].toolName,
      runs: usage[0].runs,
      installations: usage[0].installations,
      succeeded: usage[0].succeeded,
      failed: usage[0].failed,
      averageDurationMs: usage[0].averageDurationMs,
    },
    {
      packageKey: saved.packageKey,
      toolName: 'check_invoice',
      runs: 1,
      installations: 1,
      succeeded: 1,
      failed: 0,
      averageDurationMs: 42,
    },
  );
  assert.equal(await tokenStore.revoke('developer-a', issued.id), true);
  await assert.rejects(() => tokenStore.authenticate(issued.token), /UNAUTHORIZED/);
});
