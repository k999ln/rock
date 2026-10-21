import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncSitesPackageSourceLineage } from './sites-migration-lineage.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hosting = JSON.parse(
  await readFile(resolve(root, '.openai', 'hosting.json'), 'utf8'),
);
const result = await syncSitesPackageSourceLineage({
  root,
  projectId: hosting.project_id,
});

process.stdout.write(`Sites package source prepared from ${result.migrationDirectory}\n`);
