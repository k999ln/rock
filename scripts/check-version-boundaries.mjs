import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const read = (path) => readFileSync(resolve(root, path), 'utf8');
const readJson = (path) => JSON.parse(read(path));

export function validateVersionBoundaries({
  boundaries,
  packageJson,
  pyproject,
  nativeInit,
  qemuAudit,
  preview,
  projectStatus,
  previewNotes,
  guidePage,
  androidFiles,
}) {
  assert.equal(boundaries.schema, 1, 'version boundary schema must be 1');
  assert.equal(boundaries.product.name, 'RockstarOS');
  assert.equal(boundaries.product.releaseState, 'developer_preview_not_public');
  assert.match(boundaries.product.displayVersion, /^1\.0 Developer Preview$/);
  assert.ok(
    previewNotes.includes(boundaries.product.displayVersion),
    'preview release notes must display the canonical product version',
  );
  assert.ok(
    guidePage.includes(boundaries.product.displayVersion),
    'preview guide must display the canonical product version',
  );

  const versions = boundaries.boundaries;
  assert.equal(packageJson.version, versions.webPackage.version);

  const pyprojectVersion = pyproject.match(/^version = "([^"]+)"$/m)?.[1];
  const nativeInitVersion = nativeInit.match(/^__version__ = "([^"]+)"$/m)?.[1];
  assert.equal(pyprojectVersion, versions.nativeFoundation.version);
  assert.equal(nativeInitVersion, versions.nativeFoundation.version);

  const qemu = versions.qemuDistributionCandidate;
  assert.match(qemu.sourceCommit, /^[0-9a-f]{40}$/);
  assert.equal(qemu.releaseState, 'draft_not_public');
  assert.equal(qemuAudit.candidate.version, qemu.version);
  assert.equal(qemuAudit.candidate.sourceCommit, qemu.sourceCommit);
  assert.equal(qemuAudit.candidate.distributionState, qemu.releaseState);
  assert.equal(preview.reviewCandidate.version, qemu.version);
  assert.equal(preview.reviewCandidate.sourceCommit, qemu.sourceCommit);
  assert.equal(projectStatus.launchReadiness.distributionVersion, qemu.version);

  const android = versions.androidPrototype;
  assert.equal(android.releaseState, 'source_and_emulator_only');
  for (const [path, source] of Object.entries(androidFiles)) {
    assert.ok(
      source.includes(`versionCode ${android.versionCode}`) ||
        source.includes(`android:versionCode="${android.versionCode}"`),
      `${path} must use the canonical Android versionCode`,
    );
    assert.ok(
      source.includes(`versionName '${android.versionName}'`) ||
        source.includes(`android:versionName="${android.versionName}"`),
      `${path} must use the canonical Android versionName`,
    );
  }

  assert.deepEqual(boundaries.commitPolicy, {
    releaseCandidateRequiresExactCommit: true,
    currentMainResolvedAtBuildOrDeployment: true,
    repositoryDoesNotSelfRecordItsFutureMergeCommit: true,
  });
  return {
    boundaryCount: Object.keys(versions).length,
    productVersion: boundaries.product.displayVersion,
    qemuCandidate: qemu.version,
  };
}

export function validateRepositoryVersionBoundaries() {
  const boundaries = readJson('data/version-boundaries.json');
  return validateVersionBoundaries({
    boundaries,
    packageJson: readJson('package.json'),
    pyproject: read('systems/rock-star-os/pyproject.toml'),
    nativeInit: read('systems/rock-star-os/src/blackberryrock/__init__.py'),
    qemuAudit: readJson('data/qemu-release-audit.json'),
    preview: readJson('data/rockstaros-preview.json'),
    projectStatus: readJson('data/project-status.json'),
    previewNotes: read('docs/preview-release-notes.md'),
    guidePage: read('app/rockstaros/guide/page.tsx'),
    androidFiles: Object.fromEntries(
      boundaries.boundaries.androidPrototype.sources.map((path) => [path, read(path)]),
    ),
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = validateRepositoryVersionBoundaries();
  console.log(
    `version boundaries: ${result.boundaryCount}系統、product ${result.productVersion}、QEMU ${result.qemuCandidate}`,
  );
}
