import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import {
  parseSkySubmission,
  SkySubmissionError,
} from '../lib/sky-submission.ts';
import { skySubmissionStore } from '../lib/sky-submission-store.ts';

const valid = (change = {}) => ({
  id: '123e4567-e89b-42d3-a456-426614174000',
  name: '請求書チェック',
  summary: '請求書の入力内容を確認し、差分を利用者へ返す自動化ツールです。',
  providerName: 'Example Inc.',
  version: '1.0.0',
  connectionType: 'mcp_streamable_http',
  endpointUrl: 'https://tools.example.com/mcp',
  sourceUrl: null,
  supportUrl: 'https://example.com/support',
  license: 'Commercial Terms',
  pricing: 'usage',
  priceNote: '1回10円。実行前に上限を表示。',
  dataUse: '入力は処理後24時間以内に削除し、学習には利用しません。',
  executionTargets: ['cloud'],
  permissions: ['read_user_input', 'write_results', 'network'],
  rightsConfirmed: true,
  ...change,
});

void test('Sky accepts a minimal remote MCP listing and normalizes URLs', () => {
  const parsed = parseSkySubmission(valid());
  assert.equal(parsed.endpointUrl, 'https://tools.example.com/mcp');
  assert.deepEqual(parsed.executionTargets, ['cloud']);
});

void test('Sky rejects stale, unsafe, or misleading listing input', () => {
  const rejected = [
    { permissions: ['read_user_input', 'write_results'] },
    { endpointUrl: 'http://tools.example.com/mcp' },
    { endpointUrl: 'https://token:secret@tools.example.com/mcp' },
    { endpointUrl: 'https://tools.example.com/mcp#token' },
    { rightsConfirmed: false },
    { version: '1.0' },
    { summary: '                    ' },
    { unrecognized: true },
  ];
  for (const change of rejected)
    assert.throws(() => parseSkySubmission(valid(change)), SkySubmissionError);
});

void test('Rock recipe is accepted only for device-local execution', () => {
  const recipe = valid({
    connectionType: 'rock_recipe',
    endpointUrl: null,
    sourceUrl: 'https://example.com/tool.rock.json',
    executionTargets: ['device_local'],
    permissions: ['read_user_input', 'write_results'],
  });
  assert.equal(parseSkySubmission(recipe).connectionType, 'rock_recipe');
  assert.throws(
    () => parseSkySubmission({ ...recipe, executionTargets: ['pc'] }),
    /端末内だけ/,
  );
});

void test('Sky stores submissions per owner and keeps them in review state', async (t) => {
  const worker = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("sky fixture")}}',
      compatibilityDate: '2026-08-18',
      d1Databases: ['DB'],
      host: '127.0.0.1',
      port: 0,
    }),
  );
  t.after(() => worker.dispose());
  const db = await worker.getD1Database('DB');
  const migration = readFileSync(
    new URL('../drizzle/0005_early_the_enforcers.sql', import.meta.url),
    'utf8',
  );
  for (const statement of migration
    .split('--> statement-breakpoint')
    .filter((value) => value.trim()))
    await db.prepare(statement).run();
  const store = skySubmissionStore(db);
  const submission = parseSkySubmission(valid());
  const saved = await store.create('provider-a', submission);
  assert.equal(saved?.status, 'submitted');
  assert.equal(await store.create('provider-b', submission), null);
  assert.equal((await store.list('provider-a'))[0].name, '請求書チェック');
  assert.deepEqual(await store.list('provider-b'), []);
});
