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
const legacyFolder = new URL('../drizzle-legacy/pre-site-bridge/', import.meta.url).pathname;
const names = readdirSync(folder)
  .filter((name) => name.endsWith('.sql'))
  .sort();
const read = (name) => readFileSync(folder + name, 'utf8');
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
  assert.match(viteConfig, /migrations_dir: 'drizzle'/);
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
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
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
  assert.match(webConfig, /migrations_dir: 'drizzle'/);
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
    90,
  );
  assert.ok(sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'a2a_usage_receipt_immutable_update'",
  ).get());
});

await test('Sites deploys only the consolidated root bridge after the recorded history', () => {
  assert.deepEqual(names, ['0013_sky_provider_connections.sql']);
  assert.match(read('0013_sky_provider_connections.sql'), /CREATE TABLE IF NOT EXISTS `sky_provider_connections`/);
  assert.doesNotMatch(read('0013_sky_provider_connections.sql'), /^ALTER TABLE/m);
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
        assert.equal(schema.filter((item) => item.type === 'table').length, 90);
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
