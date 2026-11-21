import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.argv.length !== 2) throw new Error('This rehearsal takes no arguments and uses temporary local resources.');

const dir = mkdtempSync(join(tmpdir(), 'rock-cloud-restore-'));
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const local = (...args) => execFileSync(process.execPath, [wrangler, ...args, '--local', '--config', 'wrangler.json'], {
  cwd: dir,
  encoding: 'utf8',
  timeout: 30_000,
  env: { ...process.env, WRANGLER_WRITE_LOGS: 'false', WRANGLER_LOG_PATH: join(dir, 'logs') },
});
const execute = (name, ...args) => local('d1', 'execute', name, ...args);
const rows = (name, command) => JSON.parse(execute(name, '--command', command, '--json'))[0].results;
const hash = (value) => createHash('sha256').update(value).digest('hex');

function snapshot(name) {
  const jobs = rows(name, 'SELECT id, name, created_at FROM drill_jobs ORDER BY id');
  const results = rows(name, 'SELECT id, job_id, result FROM drill_results ORDER BY id');
  const schema = rows(name, "SELECT type, name, sql FROM sqlite_schema WHERE name LIKE 'drill_%' ORDER BY type, name");
  assert.deepEqual(rows(name, 'SELECT r.id FROM drill_results r LEFT JOIN drill_jobs j ON j.id = r.job_id WHERE j.id IS NULL'), []);
  return { counts: { jobs: jobs.length, results: results.length }, sha256: hash(JSON.stringify({ schema, jobs, results })) };
}

try {
  writeFileSync(join(dir, 'wrangler.json'), JSON.stringify({
    name: 'cloud-d1-restore-drill',
    compatibility_date: '2026-09-01',
    d1_databases: ['SOURCE', 'RESTORE'].map((binding) => ({
      binding, database_name: binding.toLowerCase(), database_id: randomUUID(),
    })),
    r2_buckets: [{ binding: 'BACKUP', bucket_name: 'cloud-drill-backups' }],
  }));
  writeFileSync(join(dir, 'seed.sql'), `
    CREATE TABLE drill_jobs (id INTEGER PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE drill_results (id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL REFERENCES drill_jobs(id), result TEXT);
    CREATE INDEX drill_results_job_id ON drill_results(job_id);
    INSERT INTO drill_jobs VALUES (1, '合成の仕事', 123), (2, 'second synthetic job', 456);
    INSERT INTO drill_results VALUES (1, 1, 'receipt'), (2, 2, NULL), (3, 2, '二つ目');
  `);
  execute('SOURCE', '--file', 'seed.sql', '--yes');
  const before = snapshot('SOURCE');
  assert.deepEqual(before.counts, { jobs: 2, results: 3 });
  assert.deepEqual(rows('RESTORE', "SELECT name FROM sqlite_schema WHERE type = 'table' AND name LIKE 'drill_%'"), []);

  local('d1', 'export', 'SOURCE', '--output', 'export.sql');
  local('r2', 'object', 'put', 'cloud-drill-backups/export.sql', '--file', 'export.sql');
  local('r2', 'object', 'get', 'cloud-drill-backups/export.sql', '--file', 'restore.sql');
  assert.equal(hash(readFileSync(join(dir, 'export.sql'))), hash(readFileSync(join(dir, 'restore.sql'))));
  execute('RESTORE', '--file', 'restore.sql', '--yes');
  assert.deepEqual(snapshot('RESTORE'), before);
  console.log(JSON.stringify(before));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
