import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createCycloneDxSbom,
  readJson,
  validateReleaseReadiness,
} from './release-readiness-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readiness = readJson(resolve(root, 'data/release-readiness.json'));
const ownerIntent = readJson(resolve(root, 'data/release-owner-intent-20260911.json'));
const lock = readJson(resolve(root, 'package-lock.json'));
const result = validateReleaseReadiness({ root, readiness, ownerIntent, lock });

const sbomIndex = process.argv.indexOf('--sbom');
if (sbomIndex !== -1) {
  const outputPath = process.argv[sbomIndex + 1];
  if (!outputPath || outputPath.startsWith('--')) throw new Error('--sbom の後に出力pathが必要です');
  const sbom = createCycloneDxSbom({ root, lock, outputPath });
  console.log(`CycloneDX SBOM: ${sbom.count} components -> ${outputPath}`);
}

console.log(
  `公開条件: ready ${result.readyTargets.length}/${result.targetCount}（${result.readyTargets.join(', ')}）、blocked ${result.blockedTargets.length}、npm依存 ${result.dependencyCount}件/license欠落0`,
);
