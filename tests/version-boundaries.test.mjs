import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateRepositoryVersionBoundaries,
  validateVersionBoundaries,
} from '../scripts/check-version-boundaries.mjs';

void test('every release surface matches the canonical version boundary ledger', () => {
  const result = validateRepositoryVersionBoundaries();
  assert.deepEqual(result, {
    boundaryCount: 4,
    productVersion: '1.0 Developer Preview',
    qemuCandidate: '1.0.0-preview.20260911-rc2',
  });
});

void test('a future merge SHA cannot be self-recorded as repository truth', () => {
  assert.throws(
    () =>
      validateVersionBoundaries({
        boundaries: {
          schema: 1,
          product: {
            name: 'RockstarOS',
            displayVersion: '1.0 Developer Preview',
            releaseState: 'developer_preview_not_public',
          },
          boundaries: {
            webPackage: { version: '0.1.0' },
            nativeFoundation: { version: '0.3.0' },
            qemuDistributionCandidate: {
              version: '1.0.0-preview.20260911-rc2',
              sourceCommit: 'b7d819cd291b653d165aa124f25a52b9898bfb2e',
              releaseState: 'draft_not_public',
            },
            androidPrototype: {
              versionName: '0.1.0',
              versionCode: 1,
              releaseState: 'source_and_emulator_only',
            },
          },
          commitPolicy: {
            releaseCandidateRequiresExactCommit: true,
            currentMainResolvedAtBuildOrDeployment: true,
            repositoryDoesNotSelfRecordItsFutureMergeCommit: false,
          },
        },
        packageJson: { version: '0.1.0' },
        pyproject: 'version = "0.3.0"',
        nativeInit: '__version__ = "0.3.0"',
        qemuAudit: {
          candidate: {
            version: '1.0.0-preview.20260911-rc2',
            sourceCommit: 'b7d819cd291b653d165aa124f25a52b9898bfb2e',
            distributionState: 'draft_not_public',
          },
        },
        preview: {
          reviewCandidate: {
            version: '1.0.0-preview.20260911-rc2',
            sourceCommit: 'b7d819cd291b653d165aa124f25a52b9898bfb2e',
          },
        },
        projectStatus: {
          launchReadiness: { distributionVersion: '1.0.0-preview.20260911-rc2' },
        },
        previewNotes: 'RockstarOS 1.0 Developer Preview',
        guidePage: 'RockstarOS 1.0 Developer Preview',
        androidFiles: {
          manifest: 'android:versionCode="1" android:versionName="0.1.0"',
        },
      }),
    /repositoryDoesNotSelfRecordItsFutureMergeCommit/,
  );
});
