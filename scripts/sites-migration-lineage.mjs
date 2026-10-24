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

export async function syncSitesPackageSourceLineage({ root, projectId }) {
  const migrationDirectory = siteMigrationsDirectoryFor(projectId);
  const sourceDirectory = resolve(root, migrationDirectory);
  const packageSourceDirectory = resolve(root, 'drizzle');

  // The Sites packager deliberately stages project/drizzle after the build.
  // Main therefore keeps a Site-specific source commit whose root drizzle is
  // the selected main lineage; Columbia already uses root drizzle and is a
  // no-op. The GitHub repository retains both canonical source directories.
  if (sourceDirectory !== packageSourceDirectory) {
    await rm(packageSourceDirectory, { recursive: true, force: true });
    await cp(sourceDirectory, packageSourceDirectory, { recursive: true });
  }

  const expected = await sqlFiles(sourceDirectory);
  const packaged = await sqlFiles(packageSourceDirectory);
  if (JSON.stringify(packaged) !== JSON.stringify(expected))
    throw new Error(`Sites package source does not match ${migrationDirectory}`);

  return {
    migrationDirectory,
    packageSourceDirectory,
    sqlFiles: packaged,
    sourceDirectory,
  };
}

// Explicit offline D1 filename reconciliation; never part of automatic deployment.
export { planMigrationAliases, reconcileLocalMigrationAliases, sqliteLogicalDigest } from './sqlite-migration-aliases.mjs';
