#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { summarizeWebBundleLicenseAudit } from './web-bundle-inventory.mjs';

const root = resolve(import.meta.dirname, '..');
const read = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const packageLockBytes = readFileSync(resolve(root, 'package-lock.json'));
const inventory = read('work/release/web-bundle-components.json');
const result = summarizeWebBundleLicenseAudit({
  inventory,
  packageLockBytes,
  licenseAudit: read('data/web-third-party-license-audit.json'),
});
const output = resolve(root, 'work/release/web-bundle-license-audit.json');
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
console.log(
  `Web bundle: ${result.bundledComponents} components、追加review ${result.reviewRequiredInBundle}件（法的clearanceではありません）`,
);
