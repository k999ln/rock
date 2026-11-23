import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { backup, DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const migration = '0060_noah_intake_tool_labels';
const read = (lineage, name) => readFileSync(new URL(`../${lineage}/${name}`, import.meta.url), 'utf8');

void test('the mirrored label migration adds the table and index to a database copy', async (t) => {
  const source = new DatabaseSync(':memory:');
  const directory = mkdtempSync(join(tmpdir(), 'noah-label-migration-'));
  const copiedPath = join(directory, 'copy.sqlite');
  t.after(() => {
    source.close();
    rmSync(directory, { recursive: true, force: true });
  });
  source.exec(read('drizzle-main', '0044_noah_intake.sql'));
  source.exec(read('drizzle-main', '0059_noah_agent_availability.sql'));
  source.exec("INSERT INTO noah_intake_sources(id) VALUES ('mcp-registry')");
  await backup(source, copiedPath);

  const sql = read('drizzle-main', `${migration}.sql`);
  assert.equal(sql, read('drizzle', `${migration}.sql`));
  const journal = read('drizzle-main', 'meta/_journal.json');
  assert.equal(journal, read('drizzle', 'meta/_journal.json'));
  const [previous, next] = JSON.parse(journal).entries.slice(-2);
  assert.equal(next.tag, migration);
  assert.ok(next.when > previous.when);

  const copy = new DatabaseSync(copiedPath);
  try {
    copy.exec(sql);
    const objects = copy.prepare("SELECT name FROM sqlite_master WHERE tbl_name = 'noah_intake_tool_labels' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    assert.deepEqual(objects.map(({ name }) => name), ['noah_intake_tool_labels', 'noah_intake_tool_labels_read']);
    const sourceRow = copy.prepare('SELECT id FROM noah_intake_sources').get();
    assert.equal(sourceRow.id, 'mcp-registry');
    assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(source.prepare("SELECT 1 FROM sqlite_master WHERE name = 'noah_intake_tool_labels'").get(), undefined);
  } finally {
    copy.close();
  }
});
