import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { createSkyToolPackageDraft } from '../lib/sky-tool-package.ts';
import { skyToolPackageStore } from '../lib/sky-tool-package-store.ts';
import {
  isSkyActivationCode,
  skyActivationStore,
} from '../lib/sky-activation.ts';
import { skyToolReviewStore } from '../lib/sky-tool-review.ts';

const draft = createSkyToolPackageDraft({
  sourceKind: 'github',
  sourceUrl: 'https://github.com/example/telegram-tool',
  developerName: 'Example Inc.',
  developerId: 'example-inc',
  license: 'MIT',
});

async function database(t) {
  const worker = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: '2026-08-18',
      d1Databases: ['DB'],
      host: '127.0.0.1',
      port: 0,
    }),
  );
  t.after(() => worker.dispose());
  const db = await worker.getD1Database('DB');
  for (const file of ['0010_gray_fat_cobra.sql', '0014_sparkling_chimera.sql', '0016_red_crusher_hogan.sql']) {
    const migration = readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8');
    for (const statement of migration.split('--> statement-breakpoint').filter((value) => value.trim()))
      await db.prepare(statement).run();
  }
  return db;
}

async function verify(db, saved) {
  return skyToolReviewStore(db).review('reviewer-a', {
    packageKey: saved.packageKey,
    manifestSha256: saved.manifestSha256,
    decision: 'verified',
    sourceRevision: 'a'.repeat(40),
    sourceSha256: 'b'.repeat(64),
    checks: {
      sourcePinned: true, rights: true, license: true, permissions: true,
      privacy: true, pricing: true, sandbox: true, outputQuality: true,
    },
    evidenceUrls: ['https://example.com/reviews/telegram-tool'],
    notes: 'Telegram配布前の固定sourceとSandbox試験を確認しました。',
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
  });
}

void test('activation codes are opaque, one-use, package-bound grants', { timeout: 10_000 }, async (t) => {
  const db = await database(t);
  const packages = skyToolPackageStore(db);
  const saved = await packages.create('developer-a', draft);
  await packages.publishDeclared('developer-a', saved.packageKey, saved.manifestSha256);
  await verify(db, saved);
  const activations = skyActivationStore(db);
  const issued = await activations.issue('developer-a', {
    packageKey: saved.packageKey,
    label: 'Telegram test',
    maxUses: 1,
    expiresAt: null,
  });
  assert.match(issued.code, /^SKY-(?:[A-Z2-9]{4}-){3}[A-Z2-9]{4}$/);
  assert.equal(isSkyActivationCode(issued.code), true);
  assert.equal((await activations.listOwner('developer-a'))[0].usedCount, 0);

  const first = await activations.redeem({
    code: issued.code,
    telegramUserId: '100',
    telegramChatId: '100',
    botUsername: 'Rockstar_ibot',
  });
  assert.equal(first.alreadyGranted, false);
  assert.equal((await activations.listTelegramTools('100'))[0].packageKey, saved.packageKey);

  const repeat = await activations.redeem({
    code: issued.code,
    telegramUserId: '100',
    telegramChatId: '100',
  });
  assert.equal(repeat.alreadyGranted, true);
  await assert.rejects(
    () => activations.redeem({ code: issued.code, telegramUserId: '200', telegramChatId: '200' }),
    /使用回数の上限/,
  );
  assert.equal((await activations.listOwner('developer-a'))[0].usedCount, 1);
});

void test('revoked and expired codes cannot be redeemed', { timeout: 10_000 }, async (t) => {
  const db = await database(t);
  const packages = skyToolPackageStore(db);
  const saved = await packages.create('developer-a', draft);
  await packages.publishDeclared('developer-a', saved.packageKey, saved.manifestSha256);
  await verify(db, saved);
  const activations = skyActivationStore(db);
  const revoked = await activations.issue('developer-a', {
    packageKey: saved.packageKey,
    label: 'revoked', maxUses: 1, expiresAt: null,
  });
  assert.equal(await activations.revoke('developer-a', revoked.id), true);
  await assert.rejects(
    () => activations.redeem({ code: revoked.code, telegramUserId: '1', telegramChatId: '1' }),
    /停止されています/,
  );
  const expired = await activations.issue('developer-a', {
    packageKey: saved.packageKey,
    label: 'expired', maxUses: 1, expiresAt: Date.now() + 10,
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  await assert.rejects(
    () => activations.redeem({ code: expired.code, telegramUserId: '2', telegramChatId: '2' }),
    /期限が切れています/,
  );
});

void test('declared but unreviewed packages cannot be distributed', { timeout: 10_000 }, async (t) => {
  const db = await database(t);
  const packages = skyToolPackageStore(db);
  const saved = await packages.create('developer-a', draft);
  await packages.publishDeclared('developer-a', saved.packageKey, saved.manifestSha256);
  await assert.rejects(
    () => skyActivationStore(db).issue('developer-a', {
      packageKey: saved.packageKey,
      label: 'must fail',
      maxUses: 1,
      expiresAt: null,
    }),
    /審査済み/,
  );
});

void test('package revocation immediately disables existing grants', { timeout: 10_000 }, async (t) => {
  const db = await database(t);
  const packages = skyToolPackageStore(db);
  const saved = await packages.create('developer-a', draft);
  await packages.publishDeclared('developer-a', saved.packageKey, saved.manifestSha256);
  await verify(db, saved);
  const activations = skyActivationStore(db);
  const issued = await activations.issue('developer-a', {
    packageKey: saved.packageKey,
    label: 'revocation test',
    maxUses: 2,
    expiresAt: null,
  });
  await activations.redeem({
    code: issued.code,
    telegramUserId: '300',
    telegramChatId: '300',
  });
  await skyToolReviewStore(db).review('reviewer-a', {
    packageKey: saved.packageKey,
    manifestSha256: saved.manifestSha256,
    decision: 'revoked',
    sourceRevision: null,
    sourceSha256: null,
    checks: {},
    evidenceUrls: [],
    notes: '配布後の安全上の問題を確認したため、審査状態を失効します。',
    expiresAt: null,
  });
  assert.deepEqual(await activations.listTelegramTools('300'), []);
  await assert.rejects(
    () => activations.redeem({
      code: issued.code,
      telegramUserId: '300',
      telegramChatId: '300',
    }),
    /現在利用できません/,
  );
});
