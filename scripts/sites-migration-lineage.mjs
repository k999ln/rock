import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export const CANONICAL_MAIN_SITE_PROJECT_ID =
  'appgprj_6abdfad4c5648191bcae957913bd02fa';
export const COLUMBIA_SITE_PROJECT_ID =
  'appgprj_6aa444b6e6508191a19f16405d0be927';

const SITE_MIGRATION_DIRECTORIES = new Map([
  [CANONICAL_MAIN_SITE_PROJECT_ID, 'drizzle-main'],
  [COLUMBIA_SITE_PROJECT_ID, 'drizzle'],
]);

export function siteMigrationsDirectoryFor(projectId) {
  const directory = SITE_MIGRATION_DIRECTORIES.get(projectId);
  if (!directory)
    throw new Error(`No Sites D1 migration lineage is registered for project ${projectId || '(missing)'}`);
  return directory;
}

const sqlFiles = async (directory) =>
  (await readdir(directory))
    .filter((name) => name.endsWith('.sql'))
    .sort();

export async function syncSitesMigrationLineage({
  root,
  projectId,
  outputDirectory = resolve(root, 'dist', '.openai', 'drizzle'),
}) {
  const migrationDirectory = siteMigrationsDirectoryFor(projectId);
  const sourceDirectory = resolve(root, migrationDirectory);

  // @openai/sites-vite-plugin currently copies root drizzle unconditionally.
  // Replace it after that plugin finishes so an archive contains one lineage.
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(dirname(outputDirectory), { recursive: true });
  await cp(sourceDirectory, outputDirectory, { recursive: true });

  const expected = await sqlFiles(sourceDirectory);
  const packaged = await sqlFiles(outputDirectory);
  if (JSON.stringify(packaged) !== JSON.stringify(expected))
    throw new Error(`Packaged Sites migrations do not match ${migrationDirectory}`);

  return {
    migrationDirectory,
    outputDirectory,
    sqlFiles: packaged,
    sourceDirectory,
  };
}

export function createSitesMigrationLineagePlugin(projectId) {
  let root = process.cwd();
  // Resolve eagerly so missing or unknown project IDs fail before a build can
  // produce a deployable artifact with the wrong database lineage.
  siteMigrationsDirectoryFor(projectId);
  return {
    name: 'rockstar-sites-migration-lineage',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      root = config.root;
    },
    async closeBundle() {
      await syncSitesMigrationLineage({ root, projectId });
    },
  };
}
