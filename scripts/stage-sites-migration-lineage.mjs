import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncSitesMigrationLineage } from './sites-migration-lineage.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hosting = JSON.parse(
  await readFile(resolve(root, '.openai', 'hosting.json'), 'utf8'),
);
const result = await syncSitesMigrationLineage({
  root,
  projectId: hosting.project_id,
});

process.stdout.write(`Sites migrations staged from ${result.migrationDirectory}\n`);
