import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { drizzle } from 'drizzle-orm/d1';
import { migrate } from 'drizzle-orm/d1/migrator';
import { auditSitesOwnerWorkspaceRecovery } from '../scripts/sites-owner-workspace-recovery.mjs';

const folder = new URL('../drizzle-main/', import.meta.url);
const read = name => readFileSync(new URL(name, folder), 'utf8');
const recoverySql = () => read('0031_owner_workspace_schema_recovery.sql').split('--> statement-breakpoint').filter(s => s.trim());
const root = new URL('../', import.meta.url).pathname;
const ownerTables = [
  'eve_conversations', 'eve_device_commands', 'eve_device_jobs',
  'eve_device_presence', 'eve_memory_terms', 'eve_messages',
  'sky_feature_additions', 'sky_hub_plugins', 'sky_x_feed_state',
  'sky_communities', 'sky_community_members', 'sky_social_follows',
  'sky_social_posts', 'sky_social_profiles', 'sky_community_editions',
  'sky_community_installs', 'sky_community_keys', 'sky_social_reactions',
  'sky_x_accounts', 'sky_x_oauth_states', 'rockstar_account_enrollments',
  'rockstar_account_rate_limits', 'rockstar_accounts',
];
async function fixture(t, watermark) {
  const worker = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: 'export default {fetch(){return new Response("fixture")}}',
    compatibilityDate: '2026-08-18', d1Databases: ['DB'], host: '127.0.0.1', port: 0,
  }));
  t.after(() => worker.dispose());
  const db = await worker.getD1Database('DB');
  // Main's documented prerequisite is a restored database, not an empty DB.
  for (const sql of read('0021_sites_schema_convergence.sql').split('--> statement-breakpoint').filter(s => s.trim()))
    await db.prepare(sql).run();
  await db.prepare('CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC)').run();
  await db.prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES (?,?)').bind('restored-published-watermark', watermark).run();
  await db.prepare("INSERT INTO work_jobs VALUES ('keep-job','owner','{\"saved\":true}',7,'2026-10-22')").run();
  await db.prepare("INSERT INTO book_records VALUES ('keep-money','owner','revenue',888,'manual','2026-10-22',NULL,1)").run();
  return db;
}

for (const watermark of [4102444800000, 4102444800002]) {
  void test(`main upgrade restores owner workspace after published watermark ${watermark}`, async t => {
    const db = await fixture(t, watermark);
    const run = () => migrate(drizzle(db), { migrationsFolder: folder.pathname });
    await run();
    for (const name of ownerTables)
      assert.ok(await db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").bind(name).first(), name);
    assert.ok(await db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='eve_runtime_presence'").first());
    assert.equal((await db.prepare("SELECT revision FROM work_jobs WHERE id='keep-job'").first()).revision, 7);
    assert.equal((await db.prepare("SELECT amount FROM book_records WHERE id='keep-money'").first()).amount, 888);
    const ledger = (await db.prepare('SELECT hash,created_at FROM __drizzle_migrations ORDER BY id').all()).results;
    await run();
    assert.deepEqual((await db.prepare('SELECT hash,created_at FROM __drizzle_migrations ORDER BY id').all()).results, ledger);
    assert.equal(Number(ledger.at(-1).created_at), 4102444800004);
    assert.ok(ledger.some(e=>Number(e.created_at)===4102444800003));
  });
}

void test('recovery preserves published bytes and times and stages exactly the main lineage', () => {
  const proof = JSON.parse(readFileSync(new URL('../data/sites-owner-workspace-recovery.json', import.meta.url), 'utf8'));
  const originalHashes = {
    '0026_eve_account_sync': '9185b080b17bd9198b6b2b0bb50028021187c65bba3b6bd3fc36c1ea0cf1efac',
    '0027_os_timeline': 'd78a07c000fbe6bbc09711a695b240dcca13c1dbfc2e0ef1f5497023ba9b4fa0',
    '0028_rockstar_accounts': 'b73721a45c57517a766f7009f0e5b2109f03b1563ff619b7f396598ba30f4562',
  };
  const journal = JSON.parse(read('meta/_journal.json')).entries;
  assert.equal(proof.sourceBase, '6f32e4d55fc1eecb156bffba8f8e8fdaba1a1caf');
  assert.equal(proof.published.length, 11);
  for (const [i, entry] of proof.published.entries()) {
    assert.equal(createHash('sha256').update(read(entry.tag + '.sql')).digest('hex'), entry.sha256);
    assert.equal(journal[i].tag, entry.tag); assert.equal(journal[i].when, entry.when);
    if (originalHashes[entry.tag]) assert.equal(entry.sha256, originalHashes[entry.tag]);
  }
  assert.deepEqual(proof.recovery.tables, ownerTables);
  assert.equal(journal.find(e=>e.tag==='0031_owner_workspace_schema_recovery').when,4102444800003);
  assert.equal(journal.at(-1).tag,'0032_eve_runtime_presence');
  assert.equal(journal.at(-1).when,4102444800004);
  assert.ok(journal.at(-1).when > Math.max(...proof.published.map(e => e.when)));
  for (const entry of journal) assert.equal(read(entry.tag + '.sql'), readFileSync(new URL('../drizzle/' + entry.tag + '.sql', import.meta.url), 'utf8'));
  assert.deepEqual(JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8')), JSON.parse(read('meta/_journal.json')));
  assert.doesNotMatch(read('0031_owner_workspace_schema_recovery.sql'), /\b(?:DROP|ALTER|DELETE|UPDATE|INSERT)\b/i);
});

void test('published timestamp exceptions cannot hide a changed ledger or a new rollback', () => {
  const journal = JSON.parse(read('meta/_journal.json')).entries;
  assert.deepEqual([...auditSitesOwnerWorkspaceRecovery(root, journal)], ['0026_eve_account_sync', '0027_os_timeline', '0028_rockstar_accounts']);
  const changed = structuredClone(journal); changed[6].when++;
  assert.throws(() => auditSitesOwnerWorkspaceRecovery(root, changed), /published journal changed/);
  assert.throws(() => auditSitesOwnerWorkspaceRecovery(root, journal.slice(0, 11)), /recovery watermark/);
  assert.throws(() => auditSitesOwnerWorkspaceRecovery(root, [...journal, { tag: '0032_invalid', when: 1792582356592 }]), /unrecognized timestamp rollback/);
});

void test('a partial unrecorded recovery and two owners replay without replacing envelopes', async t => {
  const db = await fixture(t, 4102444800002);
  const sql = recoverySql();
  for (const statement of sql.slice(0, 3)) await db.prepare(statement).run();
  await db.prepare("INSERT INTO eve_conversations VALUES ('owner-a','thread',2,1,'opaque-owner-a',100,'save-a',0)").run();
  await db.prepare("INSERT INTO eve_conversations VALUES ('owner-b','thread',3,0,'opaque-owner-b',101,'save-b',0)").run();
  const before = (await db.prepare('SELECT * FROM eve_conversations ORDER BY owner_id').all()).results;
  const run = () => migrate(drizzle(db), { migrationsFolder: folder.pathname });
  await run(); await run();
  assert.deepEqual((await db.prepare('SELECT * FROM eve_conversations ORDER BY owner_id').all()).results, before);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM __drizzle_migrations').first()).n, 3);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM eve_runtime_presence').first()).n,0);
});

void test('an incompatible partial community table fails without accepting the recovery watermark', async t => {
  const db = await fixture(t, 4102444800002);
  await db.prepare('CREATE TABLE sky_communities(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL)').run();
  await db.prepare("INSERT INTO sky_communities VALUES ('keep-community','owner')").run();
  await assert.rejects(() => migrate(drizzle(db), { migrationsFolder: folder.pathname }), /recovery_hash|os_revision|post_mode/);
  assert.equal((await db.prepare('SELECT MAX(created_at) n FROM __drizzle_migrations').first()).n, 4102444800002);
  assert.equal((await db.prepare("SELECT owner_id FROM sky_communities WHERE id='keep-community'").first()).owner_id, 'owner');
  assert.equal((await db.prepare("SELECT revision FROM work_jobs WHERE id='keep-job'").first()).revision, 7);
});
