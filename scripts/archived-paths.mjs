import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Files that left the public repository on 2026-10-10 stay in the private
// archive at a fixed commit. Ledgers may still cite them as historical evidence.
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
  return `https://github.com/${archive.repository}/blob/${archive.commit}/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}
