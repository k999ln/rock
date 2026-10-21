import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWebDependencyLicenseInventory } from './release-readiness-lib.mjs';

// Refresh only the lock-derived inventory; legal clearance and release gates stay explicit.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lockBytes = readFileSync(resolve(root, 'package-lock.json'));
const path = resolve(root, 'data/web-third-party-license-audit.json');
const audit = JSON.parse(readFileSync(path, 'utf8'));
Object.assign(audit, createWebDependencyLicenseInventory(JSON.parse(lockBytes)), {
  packageLockSha256: createHash('sha256').update(lockBytes).digest('hex'),
});
const expected = JSON.stringify(audit, null, 2) + '\n';
if (process.argv.includes('--write')) writeFileSync(path, expected);
else if (readFileSync(path, 'utf8') !== expected) {
  throw new Error('Run node scripts/sync-web-license-inventory.mjs --write after reviewing dependency changes.');
}
console.log(`Web dependency inventory: ${audit.packageEntries} entries, ${audit.uniqueComponents} components; legal clearance unchanged`);
