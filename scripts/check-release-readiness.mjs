import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createCycloneDxSbom,
  createCurrentNativeSbom,
  createHistoricalNativeSbom,
  readJson,
  validateQemuReleaseAudit,
  validateReleaseReadiness,
} from './release-readiness-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readiness = readJson(resolve(root, 'data/release-readiness.json'));
const ownerIntent = readJson(resolve(root, 'data/release-owner-intent-20260911.json'));
const lock = readJson(resolve(root, 'package-lock.json'));
const result = validateReleaseReadiness({ root, readiness, ownerIntent, lock });
const qemuAudit = readJson(resolve(root, 'data/qemu-release-audit.json'));
const qemuResult = validateQemuReleaseAudit({
  root,
  audit: qemuAudit,
  acceptance: readJson(resolve(root, 'docs/evidence/rls01/final-b7-rc2/acceptance-result.json')),
  inventory: readJson(resolve(root, 'docs/evidence/rls01/remaining-b7-rc2/inventory.json')),
  preview: readJson(resolve(root, 'data/rockstaros-preview.json')),
  historicalInventory: readJson(resolve(root, qemuAudit.historicalNativeInventory.source)),
  readiness,
  lifecycle: readJson(resolve(root, 'docs/evidence/rls01/remaining-b7-rc2/lifecycle.json')),
  d4: readJson(resolve(root, 'docs/evidence/rls01/remaining-b7-rc2/d4.json')),
  d6: readJson(resolve(root, 'docs/evidence/rls01/remaining-b7-rc2/d6.json')),
});

const sbomIndex = process.argv.indexOf('--sbom');
if (sbomIndex !== -1) {
  const outputPath = process.argv[sbomIndex + 1];
  if (!outputPath || outputPath.startsWith('--')) throw new Error('--sbom の後に出力pathが必要です');
  const sbom = createCycloneDxSbom({ root, lock, outputPath });
  console.log(`CycloneDX SBOM: ${sbom.count} components -> ${outputPath}`);
}

const nativeSbomIndex = process.argv.indexOf('--native-sbom');
if (nativeSbomIndex !== -1) {
  const outputPath = process.argv[nativeSbomIndex + 1];
  if (!outputPath || outputPath.startsWith('--')) throw new Error('--native-sbom の後に出力pathが必要です');
  const sbom = createCurrentNativeSbom({ root, audit: qemuAudit, outputPath });
  console.log(`Current rc2 native CycloneDX SBOM: ${sbom.count} components (${sbom.targetCount} target / ${sbom.hostCount} host) -> ${outputPath}`);
}

const historicalNativeSbomIndex = process.argv.indexOf('--historical-native-sbom');
if (historicalNativeSbomIndex !== -1) {
  const outputPath = process.argv[historicalNativeSbomIndex + 1];
  if (!outputPath || outputPath.startsWith('--')) throw new Error('--historical-native-sbom の後に出力pathが必要です');
  const sbom = createHistoricalNativeSbom({
    root,
    inventory: readJson(resolve(root, qemuAudit.historicalNativeInventory.source)),
    outputPath,
  });
  console.log(`Historical native CycloneDX SBOM: ${sbom.count} components (${sbom.targetCount} target / ${sbom.hostCount} host) -> ${outputPath}`);
}

console.log(
  `公開条件: ready ${result.readyTargets.length}/${result.targetCount}（${result.readyTargets.join(', ')}）、blocked ${result.blockedTargets.length}、npm依存 ${result.dependencyCount}件/license欠落0`,
);
console.log(
  `QEMU候補: ${qemuResult.candidate} / ${qemuResult.passed}/${qemuResult.required}要件合格 / ${qemuResult.blocked.length}要件未達`,
);
