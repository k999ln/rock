import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  CANONICAL_MAIN_SITE_PROJECT_ID,
  COLUMBIA_SITE_PROJECT_ID,
  siteMigrationsDirectoryFor,
  syncSitesMigrationLineage,
} from '../scripts/sites-migration-lineage.mjs';

await test('Sites migration selection is explicit and fails closed', () => {
  assert.equal(siteMigrationsDirectoryFor(CANONICAL_MAIN_SITE_PROJECT_ID), 'drizzle-main');
  assert.equal(siteMigrationsDirectoryFor(COLUMBIA_SITE_PROJECT_ID), 'drizzle');
  assert.throws(
    () => siteMigrationsDirectoryFor('appgprj_unknown'),
    /No Sites D1 migration lineage is registered/,
  );
  assert.throws(
    () => siteMigrationsDirectoryFor(undefined),
    /project \(missing\)/,
  );
});

await test('main packaging replaces the plugin default instead of mixing lineages', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sites-migration-lineage-'));
  t.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(join(root, 'drizzle'), { recursive: true });
  await mkdir(join(root, 'drizzle-main'), { recursive: true });
  await mkdir(join(root, 'dist', '.openai', 'drizzle'), { recursive: true });
  await writeFile(join(root, 'drizzle', '0020_sites_schema_convergence.sql'), 'root');
  await writeFile(join(root, 'drizzle-main', '0020_main_legacy_columns.sql'), 'main-20');
  await writeFile(join(root, 'drizzle-main', '0021_sites_schema_convergence.sql'), 'main-21');
  await writeFile(join(root, 'drizzle-main', '0022_sky_recurring_send_guard.sql'), 'main-22');
  await writeFile(join(root, 'drizzle-main', '0023_jennifer_schema_guard.sql'), 'main-23');
  await writeFile(join(root, 'dist', '.openai', 'drizzle', '0020_sites_schema_convergence.sql'), 'stale-root');

  const result = await syncSitesMigrationLineage({
    root,
    projectId: CANONICAL_MAIN_SITE_PROJECT_ID,
  });
  assert.deepEqual(result.sqlFiles, [
    '0020_main_legacy_columns.sql',
    '0021_sites_schema_convergence.sql',
    '0022_sky_recurring_send_guard.sql',
    '0023_jennifer_schema_guard.sql',
  ]);
  assert.deepEqual(
    (await readdir(join(root, 'dist', '.openai', 'drizzle'))).sort(),
    result.sqlFiles,
  );
  assert.equal(
    await readFile(join(root, 'dist', '.openai', 'drizzle', '0020_main_legacy_columns.sql'), 'utf8'),
    'main-20',
  );
});
