import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { localStartFixture } from './local-start-fixture.mjs';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { drizzle } from 'drizzle-orm/d1';
import { migrate } from 'drizzle-orm/d1/migrator';

const folder = new URL('../drizzle/', import.meta.url).pathname;
const mainFolder = new URL('../drizzle-main/', import.meta.url).pathname;
const legacyFolder = new URL('../drizzle-legacy/pre-site-bridge/', import.meta.url).pathname;
const names = readdirSync(folder)
  .filter((name) => name.endsWith('.sql'))
  .sort();
const read = (name) => readFileSync(folder + name, 'utf8');
const readMain = (name) => readFileSync(mainFolder + name, 'utf8');
const readLegacy = (name) => readFileSync(legacyFolder + name, 'utf8');
const hashLegacy = (name) => createHash('sha256').update(readLegacy(name)).digest('hex');
const journal = JSON.parse(
  readFileSync(folder + 'meta/_journal.json', 'utf8'),
).entries;
const original = {
  '0000_previous_havok.sql':
    '7372800f2fef3867abfdb3775079f39cbda1502e14ffa2265e4fedb102916c63',
  '0001_wealthy_shinko_yamashiro.sql':
    'dd7a0e05ff9d67b14f09c60addc4f27f689d68eead3d17102f31e898bb3218d9',
  '0002_operations_backend.sql':
    '83f1c3ced5eb396775926940fc73dc96e0fc9e2f3bb7991bd5a665b228e9d2eb',
  '0002_work_jobs.sql':
    '3aa55ef1a17c960808c953ef51fad24a800126ec1a0dd424bf85197e8b3b7eb9',
};

await test('local production start applies the published migrations before serving', (t) => {
  const f = localStartFixture(t);
  const viteConfig = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
  assert.match(viteConfig, /siteMigrationsDirectoryFor\(siteProjectId\)/);
  assert.match(viteConfig, /migrations_dir: siteMigrationsDirectory/);
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(packageJson.scripts.build, /stage-sky-domain-router\.mjs && node scripts\/stage-sites-migration-lineage\.mjs$/);
  const agentRuntimeConfig = readFileSync(
    new URL('../services/sky-agent-runtime/wrangler.jsonc', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(agentRuntimeConfig, /migrations_dir/);
  const localConfig = readFileSync(
    new URL('../wrangler.local.jsonc', import.meta.url),
    'utf8',
  );
  assert.match(localConfig, /"migrations_dir": "drizzle"/);
  // Execute the same runner as npm start; failure and signal boundaries live
  // in start-local-web.test.mjs using this shared fixture.
  assert.equal(packageJson.scripts.start, 'node scripts/start-local-web.mjs');
  const result = spawnSync(process.execPath, [...f.command, '--port', '8788', '--ip', '127.0.0.1'], {
    cwd: f.root, env: f.env, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(f.calls(), [
    { stage: 'd1', args: ['d1', 'migrations', 'apply', 'site-creator-d1', '--local', '--config', 'dist/server/wrangler.json', '--persist-to', join(f.root, '.wrangler/state')], ci: '1' },
    { stage: 'dev', args: ['dev', '--config', 'dist/server/wrangler.json', '--port', '8788', '--ip', '127.0.0.1', '--persist-to', join(f.root, '.wrangler/state')], ci: 'fixture-dev-env' },
  ]);
});

await test('Sky Web preserves its deployed migration lineage separately from Agent Runtime', () => {
  const webMigrations = new URL('../services/sky-web/migrations/', import.meta.url);
  const expected = {
    '0000_previous_havok.sql': '7372800f2fef3867abfdb3775079f39cbda1502e14ffa2265e4fedb102916c63',
    '0001_wealthy_shinko_yamashiro.sql': 'dd7a0e05ff9d67b14f09c60addc4f27f689d68eead3d17102f31e898bb3218d9',
    '0002_operations_backend.sql': '83f1c3ced5eb396775926940fc73dc96e0fc9e2f3bb7991bd5a665b228e9d2eb',
    '0002_work_jobs.sql': '3aa55ef1a17c960808c953ef51fad24a800126ec1a0dd424bf85197e8b3b7eb9',
    '0004_union_bridge.sql': 'e183bc5778f03886bcd03d0a1548121e06252acde6565769043c3b660dc151af',
    '0005_early_the_enforcers.sql': '711ed2bc635f5145be84fc953d06d9f2704a874d160275129842df9e4affd1b9',
    '0006_married_scream.sql': '6294d5c0f810962647d15bb739f9ca35d6914e3647f211c11381f5afd5a8ede4',
    '0007_yielding_giant_man.sql': 'ceeb23872f9d88652a936f6f7f1a09d9f0f7dd096dc5ce191412374de22b8cc2',
    '0008_wooden_avengers.sql': '542c4e4356ec26b0afb8c55afb46341719ccce91f9c3c449422a7bad0165df70',
    '0009_sad_giant_girl.sql': '1f167394b9c8fe4fcff2c297c2058c6d1d697daf4cda07066ce4c227af2c91fc',
    '0010_gray_fat_cobra.sql': '3af98875ff3d2f07b2c5ae4e2d2badf91834c180647c5013fa3659eb575797af',
    '0011_overrated_skaar.sql': '0cbdb7330ccc5862e16ef35f211fa9a03338369a64a9aae19db1fc86044d9736',
    '0012_melodic_malcolm_colcord.sql': '420b6364465027b5ffce7b8cf6b3c143eea0b62b51268f60655dc7301d660a9c',
    '0013_csv_review_fixes.sql': '9fe19477e037bd5bed67ebd8d17448d938c7424184204aed179d1efdedc9e46f',
    '0014_csv_review_fixes.sql': 'c9473cb18102517c5a6d2c5f5f3daa345150087b544fbc5349ca56267d863527',
    '0015_csv_billing_account_events.sql': '9c53b391c35b9f9f226f6a4a0cc53d0f2a8c36664bfbaa3de62b3c07c1f2ba0c',
    '0016_sky_code_timeline.sql': '5151b91f2bb2d6a0c9329b4e066ccdc1632a0d48309d693e63fd1cbaa96f6c95',
    '0017_primary_quality_compatibility.sql': 'a4f8747b03f3da54a0b93755bf61a8075de600daccf153bc2e72ea59e293b43d',
    '0018_sky_feed_personalization.sql': 'ed7c6c5203f196a387647a3dfc1cd40f7b8a63209c7eece598b43bbf4a1e071d',
  };
  const actual = readdirSync(webMigrations)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  assert.deepEqual(actual, Object.keys(expected));
  for (const [name, digest] of Object.entries(expected)) {
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL(name, webMigrations)))
        .digest('hex'),
      digest,
      name,
    );
  }
});

await test('the shared production D1 has exactly one migration owner', () => {
  const webConfig = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
  const runtimeConfig = readFileSync(
    new URL('../services/sky-agent-runtime/wrangler.jsonc', import.meta.url),
    'utf8',
  );
  assert.match(webConfig, /migrations_dir: siteMigrationsDirectory/);
  assert.doesNotMatch(runtimeConfig, /migrations_dir/);
  assert.match(runtimeConfig, /"database_name": "site-creator-d1"/);
});

await test('the forward Web bridge tolerates objects left by an earlier partial attempt', () => {
  const sqlite = new DatabaseSync(':memory:');
  const webMigrations = new URL('../services/sky-web/migrations/', import.meta.url);
  const split = (sql) => sql
    .split('--> statement-breakpoint')
    .filter((statement) => statement.trim());
  for (const name of readdirSync(webMigrations)
    .filter((entry) => entry.endsWith('.sql') && !entry.startsWith('0017_'))
    .sort()) {
    for (const statement of split(readFileSync(new URL(name, webMigrations), 'utf8')))
      sqlite.exec(statement);
  }
  const bridge = split(readFileSync(
    new URL('0017_primary_quality_compatibility.sql', webMigrations),
    'utf8',
  ));
  for (const statement of bridge) sqlite.exec(statement);
  for (const statement of bridge) sqlite.exec(statement);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get().count,
    92,
  );
  assert.ok(sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'a2a_usage_receipt_immutable_update'",
  ).get());
});

await test('Sites deploys only the consolidated root bridge after the recorded history', () => {
  assert.deepEqual(names, [
    '0013_sky_provider_connections.sql',
    '0014_jennifer_execution_integrity.sql',
    '0015_jennifer_passkey_access.sql',
    '0016_sky_monthly_sandbox.sql',
    '0017_sky_cloud_monthly_test.sql',
    '0018_sky_recurring_sandbox.sql',
    '0019_sky_hosted_monthly.sql',
    '0020_sites_schema_convergence.sql',
    '0021_sky_recurring_send_guard.sql',
  ]);
  assert.match(read('0013_sky_provider_connections.sql'), /CREATE TABLE IF NOT EXISTS `sky_provider_connections`/);
  assert.doesNotMatch(read('0013_sky_provider_connections.sql'), /^ALTER TABLE/m);
  assert.match(read('0014_jennifer_execution_integrity.sql'), /CREATE TABLE `jennifer_plan_revisions`/);
  assert.match(read('0014_jennifer_execution_integrity.sql'), /CREATE TABLE `jennifer_task_attempts`/);
  assert.match(read('0015_jennifer_passkey_access.sql'), /CREATE TABLE `jennifer_passkey_credentials`/);
  assert.match(read('0015_jennifer_passkey_access.sql'), /CREATE TABLE `jennifer_passkey_sessions`/);
  assert.match(read('0018_sky_recurring_sandbox.sql'), /CREATE TABLE IF NOT EXISTS sky_recurring_contracts/);
  assert.match(read('0018_sky_recurring_sandbox.sql'), /CREATE TRIGGER IF NOT EXISTS sky_recurring_a2a_send/);
  assert.match(read('0019_sky_hosted_monthly.sql'), /CREATE TABLE IF NOT EXISTS `sky_hosted_monthly_events`/);
  assert.match(read('0019_sky_hosted_monthly.sql'), /CREATE UNIQUE INDEX IF NOT EXISTS `sky_hosted_monthly_tests_id_unique`/);
  assert.match(read('0020_sites_schema_convergence.sql'), /CREATE TABLE IF NOT EXISTS `remote_ai_text_send_claims`/);
  assert.doesNotMatch(read('0018_sky_recurring_sandbox.sql'), /sky_recurring_llm_send/);
  assert.match(read('0021_sky_recurring_send_guard.sql'), /CREATE TRIGGER IF NOT EXISTS sky_recurring_llm_send/);
  assert.deepEqual(
    journal.map((entry) => entry.tag + '.sql'),
    names,
  );
  const generated = spawnSync(process.execPath, ['scripts/generate-site-d1-bridge.mjs'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });
  assert.equal(generated.status, 0, generated.stderr);
});

await test('late Sites migrations tolerate objects left by an earlier deployment attempt', () => {
  const sqlite = new DatabaseSync(':memory:');
  const execute = (name) => {
    for (const statement of read(name)
      .split('--> statement-breakpoint')
      .filter((sql) => sql.trim()))
      sqlite.exec(statement);
  };
  try {
    for (const name of names) execute(name);
    execute('0018_sky_recurring_sandbox.sql');
    execute('0019_sky_hosted_monthly.sql');
    execute('0020_sites_schema_convergence.sql');
    execute('0021_sky_recurring_send_guard.sql');
    assert.ok(sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sky_recurring_contracts'",
    ).get());
    assert.ok(sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sky_hosted_monthly_events'",
    ).get());
  } finally {
    sqlite.close();
  }
});

await test('the canonical main Site uses its live-D1 additive lineage without losing legacy rows', () => {
  const mainNames = readdirSync(mainFolder)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  assert.deepEqual(mainNames, [
    '0020_main_legacy_columns.sql',
    '0021_sites_schema_convergence.sql',
    '0022_sky_recurring_send_guard.sql',
    '0023_jennifer_schema_guard.sql',
  ]);
  const sqlite = new DatabaseSync(':memory:');
  const split = (sql) => sql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);
  try {
    for (let statement of split(read('0013_sky_provider_connections.sql'))) {
      if (!/^CREATE TABLE/i.test(statement)) continue;
      if (/CREATE TABLE IF NOT EXISTS `agent_delegations`/.test(statement))
        statement = statement.replace(/, `parent_budget_limit_minor`[\s\S]*, `predecessor_delegation_id` text\);$/, ');');
      if (/CREATE TABLE IF NOT EXISTS `csv_billing_accounts`/.test(statement))
        statement = statement.replace(/\n, `cancel_at_month` text\);$/, '\n);');
      if (/CREATE TABLE IF NOT EXISTS `csv_jobs`/.test(statement))
        statement = statement.replace(/\n, `product_version`[\s\S]*, `files_purged_at` integer\);$/, '\n);');
      sqlite.exec(statement);
    }
    for (const name of names.filter((name) => name >= '0014_' && name <= '0019_'))
      for (const statement of split(read(name))) sqlite.exec(statement);
    // The main guard must also repair a deployment where the Jennifer tables
    // were not committed before an earlier Sites build failed.
    sqlite.exec('DROP INDEX idx_work_jobs_jennifer_coordination');
    sqlite.exec('DROP TABLE jennifer_plan_revisions');
    sqlite.exec('DROP TABLE jennifer_task_attempts');
    sqlite.exec('DROP TABLE jennifer_passkey_challenges');
    sqlite.exec('DROP TABLE jennifer_passkey_credentials');
    sqlite.exec('DROP TABLE jennifer_passkey_sessions');
    sqlite.exec('DROP TABLE jennifer_passkey_events');
    sqlite.exec(`INSERT INTO agent_delegations (
      id, owner_user_id, parent_job_id, idempotency_key, message_id,
      target_origin, target_agent_name, target_agent_version, protocol_version,
      input_sha256, authorization_sha256, budget_currency, budget_limit_minor,
      deadline_at, state, revision, created_at, updated_at, artifacts_captured
    ) VALUES (
      'saved-delegation', 'owner', 'job', 'key', 'message',
      'https://provider.example', 'worker', '1', 'a2a/1',
      'input', 'authorization', 'USD', 100,
      200, 'draft', 0, 100, 100, 0
    )`);
    sqlite.exec(`INSERT INTO csv_billing_accounts (
      user_id, billing_account_id, contract_id, policy_version, status,
      created_at, updated_at
    ) VALUES ('saved-owner', 'billing', 'contract', 'v1', 'active', 100, 100)`);
    sqlite.exec(`INSERT INTO csv_jobs (
      id, user_id, status, payment_status, input_name, input_key, input_bytes,
      input_sha256, input_encoding, specification_json, quote_minor, currency,
      expires_at, created_at, updated_at
    ) VALUES (
      'saved-csv', 'saved-owner', 'queued', 'paid', 'input.csv', 'input-key', 12,
      'sha256', 'utf-8', '{}', 100, 'USD', 200, 100, 100
    )`);
    assert.ok(!sqlite.prepare("PRAGMA table_info(agent_delegations)").all()
      .some(({ name }) => name === 'package_runtime_binding_id'));
    for (const name of mainNames)
      for (const statement of split(readMain(name))) sqlite.exec(statement);
    const delegationColumns = new Set(sqlite
      .prepare('PRAGMA table_info(agent_delegations)')
      .all()
      .map(({ name }) => name));
    const csvColumns = new Set(sqlite
      .prepare('PRAGMA table_info(csv_jobs)')
      .all()
      .map(({ name }) => name));
    const billingColumns = new Set(sqlite
      .prepare('PRAGMA table_info(csv_billing_accounts)')
      .all()
      .map(({ name }) => name));
    for (const column of [
      'parent_budget_limit_minor',
      'continue_while_device_offline',
      'price_quote_digest',
      'price_quote_json',
      'package_runtime_binding_id',
      'package_runtime_binding_digest',
      'predecessor_delegation_id',
    ]) assert.ok(delegationColumns.has(column), column);
    for (const column of [
      'product_version',
      'seller_id',
      'channel',
      'terms_version',
      'available_at',
      'lease_id',
      'lease_expires_at',
      'delivery_revision',
      'approved_at',
      'revision_requested_at',
      'revision_reason',
      'canceled_at',
      'cancellation_reason',
      'files_purged_at',
    ]) assert.ok(csvColumns.has(column), column);
    assert.ok(billingColumns.has('cancel_at_month'));
    for (const table of [
      'jennifer_plan_revisions',
      'jennifer_task_attempts',
      'jennifer_passkey_challenges',
      'jennifer_passkey_credentials',
      'jennifer_passkey_sessions',
      'jennifer_passkey_events',
    ]) assert.ok(sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    ).get(table), table);
    assert.equal(
      sqlite.prepare("SELECT owner_user_id FROM agent_delegations WHERE id = 'saved-delegation'").get().owner_user_id,
      'owner',
    );
    assert.equal(
      sqlite.prepare("SELECT package_runtime_binding_id FROM agent_delegations WHERE id = 'saved-delegation'").get().package_runtime_binding_id,
      '',
    );
    assert.equal(
      sqlite.prepare("SELECT status FROM csv_billing_accounts WHERE user_id = 'saved-owner'").get().status,
      'active',
    );
    assert.equal(
      sqlite.prepare("SELECT cancel_at_month FROM csv_billing_accounts WHERE user_id = 'saved-owner'").get().cancel_at_month,
      null,
    );
    const savedCsv = sqlite.prepare(
      "SELECT status, product_version, delivery_revision FROM csv_jobs WHERE id = 'saved-csv'",
    ).get();
    assert.equal(savedCsv.status, 'queued');
    assert.equal(savedCsv.product_version, 'catalog-csv-clean@0.1.0');
    assert.equal(savedCsv.delivery_revision, 0);
  } finally {
    sqlite.close();
  }
});

await test('both published migration filenames and exact SQL bytes stay intact', () => {
  for (const [name, expected] of Object.entries(original))
    assert.equal(hashLegacy(name), expected);
});

// Exercise real workerd/D1, including Drizzle's timestamp-based migrator. The
// bridge must converge both an empty database and the production lineage.
await test('fresh and current production D1 databases converge without losing records', async (t) => {
  const worker = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script:
        'export default {fetch(){return new Response("migration fixture")}}',
      compatibilityDate: '2026-08-18',
      d1Databases: ['DB'],
      host: '127.0.0.1',
      port: 0,
    }),
  );
  t.after(() => worker.dispose());
  const db = await worker.getD1Database('DB');
  const executeSql = async (sql) => {
    for (const statement of sql
      .split('--> statement-breakpoint')
      .filter((s) => s.trim()))
      await db.prepare(statement).run();
  };
  const execute = async (name) => executeSql(read(name));
  const webMigrations = new URL('../services/sky-web/migrations/', import.meta.url);
  const executeProductionLineage = async () => {
    for (const name of readdirSync(webMigrations)
      .filter((entry) => entry.endsWith('.sql'))
      .sort())
      await executeSql(readFileSync(new URL(name, webMigrations), 'utf8'));
  };
  let expectedSchema;
  for (const mode of ['filename', 'drizzle']) {
    for (const history of ['fresh', 'current']) {
      await t.test(`${mode}: ${history}`, async () => {
        const tables = (
          await db
            .prepare(
              "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
            )
            .all()
        ).results;
        for (const { name } of tables)
          await db.prepare(`DROP TABLE "${String(name)}"`).run();
        if (history === 'current') {
          await executeProductionLineage();
          await db
            .prepare(
              "INSERT INTO fund_plans VALUES ('owner', '{\"saved\":true}', '2026-09-01')",
            )
            .run();
          await db
            .prepare(
              "INSERT INTO work_jobs VALUES ('saved-job','owner','{\"steps\":[\"keep\"]}',7,'2026-09-01')",
            )
            .run();
          await db
            .prepare(
              "INSERT INTO book_records VALUES ('saved-book','owner','revenue',888,'manual','2026-09-01',NULL,1)",
            )
            .run();
        }
        if (mode === 'drizzle') {
          await migrate(drizzle(db), { migrationsFolder: folder });
          await migrate(drizzle(db), { migrationsFolder: folder });
        } else {
          await db
            .prepare(
              'CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT UNIQUE, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)',
            )
            .run();
          for (let pass = 0; pass < 2; pass++) {
            for (const name of names) {
              if (
                await db
                  .prepare('SELECT name FROM d1_migrations WHERE name = ?')
                  .bind(name)
                  .first()
              )
                continue;
              await execute(name);
              await db
                .prepare('INSERT INTO d1_migrations (name) VALUES (?)')
                .bind(name)
                .run();
            }
          }
        }
        const schema = (
          await db
            .prepare(
              "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT IN ('__drizzle_migrations','d1_migrations') ORDER BY name",
            )
            .all()
        ).results;
        // SQLite normalizes IF NOT EXISTS away in sqlite_master.
        expectedSchema ??= schema;
        assert.deepEqual(schema, expectedSchema);
        assert.equal(schema.filter((item) => item.type === 'table').length, 108);
        // D1 intentionally disallows PRAGMA integrity_check; compare all table/index
        // definitions and retained values instead of claiming that pragma ran.
        if (history === 'current') {
          assert.equal(
            (
              await db
                .prepare("SELECT plan FROM fund_plans WHERE user_id = 'owner'")
                .first()
            ).plan,
            '{"saved":true}',
          );
          assert.equal(
            (
              await db
                .prepare(
                  "SELECT revision FROM work_jobs WHERE id = 'saved-job'",
                )
                .first()
            ).revision,
            7,
          );
          assert.equal(
            (
              await db
                .prepare(
                  "SELECT amount FROM book_records WHERE id = 'saved-book'",
                )
                .first()
            ).amount,
            888,
          );
        }
      });
    }
  }
});
