import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Removed files remain readable in Git history. New cleanup batches can pin a
// per-path restore commit without changing the original archive's provenance.
const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cache = new Map();

export function archivedPaths(root = defaultRoot) {
  if (!cache.has(root)) {
    const path = resolve(root, 'data/archived-paths.json');
    const value = existsSync(path)
      ? JSON.parse(readFileSync(path, 'utf8'))
      : { paths: [] };
    cache.set(root, { ...value, set: new Set(value.paths) });
  }
  return cache.get(root);
}

export function isArchivedPath(path, root = defaultRoot) {
  return archivedPaths(root).set.has(path);
}

// True when the path exists in this checkout or is a recorded archive path.
export function existsOrArchived(path, root = defaultRoot) {
  return existsSync(resolve(root, path)) || isArchivedPath(path, root);
}

export function archiveUrl(path, root = defaultRoot) {
  const archive = archivedPaths(root);
  if (!archive.set.has(path)) return null;
  const commit = archive.restoreCommits?.[path] ?? archive.commit;
  return `https://github.com/${archive.repository}/blob/${commit}/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}
