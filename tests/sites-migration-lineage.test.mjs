import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  CANONICAL_MAIN_SITE_PROJECT_ID,
  COLUMBIA_SITE_PROJECT_ID,
  siteMigrationsDirectoryFor,
  syncSitesPackageSourceLineage,
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

await test('main package source is replaced with the selected lineage', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sites-package-source-lineage-'));
  t.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(join(root, 'drizzle'), { recursive: true });
  await mkdir(join(root, 'drizzle-main'), { recursive: true });
  await writeFile(join(root, 'drizzle', '0020_sites_schema_convergence.sql'), 'root');
  await writeFile(join(root, 'drizzle-main', '0020_main_legacy_columns.sql'), 'main-20');
  await writeFile(join(root, 'drizzle-main', '0021_sites_schema_convergence.sql'), 'main-21');

  const result = await syncSitesPackageSourceLineage({
    root,
    projectId: CANONICAL_MAIN_SITE_PROJECT_ID,
  });
  assert.deepEqual(result.sqlFiles, [
    '0020_main_legacy_columns.sql',
    '0021_sites_schema_convergence.sql',
  ]);
  assert.deepEqual(
    (await readdir(join(root, 'drizzle'))).sort(),
    result.sqlFiles,
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
  await writeFile(join(root, 'drizzle-main', '0024_remote_ai_send_claims_recovery.sql'), 'main-24');
  await writeFile(join(root, 'drizzle-main', '0025_remote_ai_send_claims_watermark.sql'), 'main-25');
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
    '0024_remote_ai_send_claims_recovery.sql',
    '0025_remote_ai_send_claims_watermark.sql',
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

for (const operation of [syncSitesMigrationLineage, syncSitesPackageSourceLineage]) {
  await test(`${operation.name} rejects a main package used for Columbia before replacing files`, async t => {
    const root=await mkdtemp(join(tmpdir(),'sites-wrong-lineage-'));
    t.after(async()=>{const {rm}=await import('node:fs/promises');await rm(root,{recursive:true,force:true});});
    await mkdir(join(root,'drizzle'),{recursive:true});
    await mkdir(join(root,'dist/.openai/drizzle'),{recursive:true});
    await writeFile(join(root,'drizzle/0020_main_legacy_columns.sql'),'main-only');
    await writeFile(join(root,'drizzle/0021_sites_schema_convergence.sql'),'main-21');
    await writeFile(join(root,'dist/.openai/drizzle/owner-artifact.txt'),'keep-existing-output');
    await assert.rejects(()=>operation({root,projectId:COLUMBIA_SITE_PROJECT_ID}),/main.*Columbia|Columbia.*main/);
    assert.equal(await readFile(join(root,'drizzle/0020_main_legacy_columns.sql'),'utf8'),'main-only');
    assert.equal(await readFile(join(root,'dist/.openai/drizzle/owner-artifact.txt'),'utf8'),'keep-existing-output');
  });
}

await test('a matching Columbia source still packages its own unchanged lineage',async t=>{
  const root=await mkdtemp(join(tmpdir(),'sites-columbia-source-'));
  t.after(async()=>{const {rm}=await import('node:fs/promises');await rm(root,{recursive:true,force:true});});
  await mkdir(join(root,'drizzle/meta'),{recursive:true});
  await writeFile(join(root,'drizzle/0013_sky_provider_connections.sql'),'columbia-13');
  await writeFile(join(root,'drizzle/0020_sites_schema_convergence.sql'),'columbia-20');
  await writeFile(join(root,'drizzle/meta/_journal.json'),'{"entries":[]}');
  const source=await syncSitesPackageSourceLineage({root,projectId:COLUMBIA_SITE_PROJECT_ID});
  const bundle=await syncSitesMigrationLineage({root,projectId:COLUMBIA_SITE_PROJECT_ID});
  assert.deepEqual(source.sqlFiles,['0013_sky_provider_connections.sql','0020_sites_schema_convergence.sql']);
  assert.deepEqual(bundle.sqlFiles,source.sqlFiles);
  assert.equal(await readFile(join(root,'dist/.openai/drizzle/0013_sky_provider_connections.sql'),'utf8'),'columbia-13');
  assert.equal(await readFile(join(root,'dist/.openai/drizzle/meta/_journal.json'),'utf8'),'{"entries":[]}');
});

await test('an absent or mixed main source cannot erase an existing package',async t=>{
  const root=await mkdtemp(join(tmpdir(),'sites-main-source-'));
  t.after(async()=>{const {rm}=await import('node:fs/promises');await rm(root,{recursive:true,force:true});});
  await mkdir(join(root,'drizzle-main'),{recursive:true});
  await mkdir(join(root,'dist/.openai/drizzle'),{recursive:true});
  await writeFile(join(root,'dist/.openai/drizzle/keep.sql'),'existing-build');
  for(const mixed of [false,true]){
    if(mixed){
      await writeFile(join(root,'drizzle-main/0013_sky_provider_connections.sql'),'wrong-site');
      await writeFile(join(root,'drizzle-main/0020_main_legacy_columns.sql'),'main');
      await writeFile(join(root,'drizzle-main/0021_sites_schema_convergence.sql'),'main');
    }
    await assert.rejects(()=>syncSitesMigrationLineage({root,projectId:CANONICAL_MAIN_SITE_PROJECT_ID}),/absent or mixes/);
    assert.equal(await readFile(join(root,'dist/.openai/drizzle/keep.sql'),'utf8'),'existing-build');
  }
});
