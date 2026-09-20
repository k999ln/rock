import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { drizzle } from 'drizzle-orm/d1';
import { migrate } from 'drizzle-orm/d1/migrator';

const folder = new URL('../drizzle/', import.meta.url).pathname;
const names = readdirSync(folder)
  .filter((name) => name.endsWith('.sql'))
  .sort();
const read = (name) => readFileSync(folder + name, 'utf8');
const hash = (name) => createHash('sha256').update(read(name)).digest('hex');
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

await test('local production start applies the published migrations before serving', () => {
  const packageJson = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const viteConfig = readFileSync(
    new URL('../vite.config.ts', import.meta.url),
    'utf8',
  );
  assert.match(
    packageJson.scripts.start,
    /^CI=1 wrangler d1 migrations apply site-creator-d1 --local --config dist\/server\/wrangler\.json && wrangler dev --config dist\/server\/wrangler\.json$/,
  );
  assert.match(viteConfig, /migrations_dir: 'drizzle'/);
});

await test('both published migration filenames and exact SQL bytes stay intact', () => {
  for (const [name, expected] of Object.entries(original))
    assert.equal(hash(name), expected);
});

// Exercise real workerd/D1, including Drizzle's timestamp-based migrator. A
// fresh-only test misses an operations migration older than recorded work_jobs.
await test('fresh and both historical D1 databases converge without losing records', async (t) => {
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
  const execute = async (name) => {
    for (const sql of read(name)
      .split('--> statement-breakpoint')
      .filter((s) => s.trim()))
      await db.prepare(sql).run();
  };
  let expectedSchema;
  for (const mode of ['filename', 'drizzle']) {
    for (const history of ['fresh', 'release', 'sites']) {
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
        const prior =
          history === 'fresh'
            ? []
            : names.filter(
                (n) =>
                  n.startsWith('0000_') ||
                  n.startsWith('0001_') ||
                  n ===
                    (history === 'release'
                      ? '0002_work_jobs.sql'
                      : '0002_operations_backend.sql'),
              );
        for (const name of prior) await execute(name);
        if (history !== 'fresh')
          await db
            .prepare(
              "INSERT INTO fund_plans VALUES ('owner', '{\"saved\":true}', '2026-09-01')",
            )
            .run();
        if (history === 'release')
          await db
            .prepare(
              "INSERT INTO work_jobs VALUES ('saved-job','owner','{\"steps\":[\"keep\"]}',7,'2026-09-01')",
            )
            .run();
        if (history === 'sites')
          await db
            .prepare(
              "INSERT INTO book_records VALUES ('saved-book','owner','revenue',888,'manual','2026-09-01',NULL,1)",
            )
            .run();
        if (mode === 'drizzle') {
          await db
            .prepare(
              'CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)',
            )
            .run();
          for (const name of prior)
            await db
              .prepare(
                'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
              )
              .bind(
                hash(name),
                journal.find((e) => e.tag + '.sql' === name).when,
              )
              .run();
          await migrate(drizzle(db), { migrationsFolder: folder });
          await migrate(drizzle(db), { migrationsFolder: folder });
        } else {
          await db
            .prepare(
              'CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT UNIQUE, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)',
            )
            .run();
          for (const name of prior)
            await db
              .prepare('INSERT INTO d1_migrations (name) VALUES (?)')
              .bind(name)
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
        assert.equal(schema.filter((item) => item.type === 'table').length, 29);
        // D1 intentionally disallows PRAGMA integrity_check; compare all table/index
        // definitions and retained values instead of claiming that pragma ran.
        if (history !== 'fresh')
          assert.equal(
            (
              await db
                .prepare("SELECT plan FROM fund_plans WHERE user_id = 'owner'")
                .first()
            ).plan,
            '{"saved":true}',
          );
        if (history === 'release')
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
        if (history === 'sites')
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
      });
    }
  }
});
