import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateAndroidFirstFlashGate } from '../scripts/android-first-flash-gate-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const custody = () => read('data/android-signing-custody-policy.json');
const rollback = () => read('data/android-rollback-index-policy.json');
const stockRecovery = () => read('data/android-stock-recovery-policy.json');
const backupRecovery = () => read('data/android-backup-recovery-policy.json');
const validateGate = (options) => validateAndroidFirstFlashGate({
  backupRecoveryPolicy: backupRecovery(),
  ...options,
});

void test('current first-flash gate names all four blockers and stays closed', () => {
  const result = validateGate({
    root,
    gate: read('data/android-first-flash-gate.json'),
    sourceLock: read('os/physical/frankel-source-lock.json'),
    signingCustody: custody(),
    rollbackPolicy: rollback(),
    stockRecoveryPolicy: stockRecovery(),
  });
  assert.equal(result.passed, false);
  assert.equal(result.passedCount, 0);
  assert.deepEqual(result.blocked, [
    'production-signing-key-lifecycle',
    'rollback-index-operations',
    'google-stock-recovery-artifacts',
    'keystore-loss-backup-restore',
  ]);
});

void test('passed cannot be asserted while a required gate is blocked', () => {
  const gate = read('data/android-first-flash-gate.json');
  gate.passed = true;
  assert.throws(
    () => validateGate({
      root,
      gate,
      sourceLock: {
        ...read('os/physical/frankel-source-lock.json'),
        firstFlashGate: { ...read('os/physical/frankel-source-lock.json').firstFlashGate, passed: true },
      },
      signingCustody: custody(),
      rollbackPolicy: rollback(),
      stockRecoveryPolicy: stockRecovery(),
    }),
    /passed does not match/,
  );
});

void test('all-pass fixture requires exact hashed evidence and Keystore-loss recovery', () => {
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), 'avocado-first-flash-'));
  try {
    const gate = read('data/android-first-flash-gate.json');
    for (const item of gate.gates) {
      item.status = 'pass';
      item.blocker = null;
      item.evidence = item.requiredEvidence.map((role) => {
        const path = `evidence/${item.id}/${role}.json`;
        const absolute = resolve(fixtureRoot, path);
        mkdirSync(dirname(absolute), { recursive: true });
        const bytes = Buffer.from(JSON.stringify({ role, fixture: true }) + '\n');
        writeFileSync(absolute, bytes);
        return { role, path, sha256: createHash('sha256').update(bytes).digest('hex') };
      });
    }
    Object.assign(gate.gates[0], {
      keySetId: 'fixture-key-set-v1',
      avbPublicKeySha256: 'a'.repeat(64),
      otaPublicKeySha256: 'b'.repeat(64),
      custodyProcedure: 'docs/android-production-signing-custody.md',
      lossRotationAndRevocationProcedure: 'docs/android-production-signing-custody.md',
    });
    Object.assign(gate.gates[1], {
      policyVersion: 'fixture-v1',
      indexLocations: { 0: 10, 1: 4 },
      increaseRule: 'monotonic',
      downgradeRule: 'reject lower',
      recoveryExceptionRule: 'no bootloader downgrade',
    });
    Object.assign(gate.gates[2], {
      factoryImage: { fileName: 'factory.zip', bytes: 1, sha256: 'c'.repeat(64) },
      fullOta: { fileName: 'ota.zip', bytes: 1, sha256: 'd'.repeat(64) },
    });
    Object.assign(gate.gates[3], {
      formatVersion: 'avocadoos-recoverable-backup/2',
      keystoreLossRecoverySupported: true,
      recoveryMechanism: 'owner-held recovery wrapping key',
      restoreDrillResult: 'pass in disposable fixture',
    });
    gate.passed = true;
    const sourceLock = {
      flashReady: false,
      firstFlashGate: {
        schema: gate.schema,
        path: 'data/android-first-flash-gate.json',
        passed: true,
      },
    };
    const result = validateGate({
      root: fixtureRoot,
      gate,
      sourceLock,
      signingCustody: custody(),
      rollbackPolicy: rollback(),
      stockRecoveryPolicy: stockRecovery(),
    });
    assert.equal(result.passed, true);
    assert.equal(result.passedCount, 4);

    gate.gates[3].keystoreLossRecoverySupported = false;
    assert.throws(
      () => validateGate({
        root: fixtureRoot,
        gate,
        sourceLock,
        signingCustody: custody(),
        rollbackPolicy: rollback(),
        stockRecoveryPolicy: stockRecovery(),
      }),
      /Keystore-loss restore is incomplete/,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

void test('signing custody rejects raw export and treating diagnostics as recovery', () => {
  const gate = read('data/android-first-flash-gate.json');
  const sourceLock = read('os/physical/frankel-source-lock.json');
  const rawExport = custody();
  rawExport.architecture.rawPrivateKeyExportAllowed = true;
  assert.throws(
    () => validateGate({
      root,
      gate,
      sourceLock,
      signingCustody: rawExport,
      rollbackPolicy: rollback(),
      stockRecoveryPolicy: stockRecovery(),
    }),
    /custody architecture changed/,
  );

  const diagnosticBackdoor = custody();
  diagnosticBackdoor.separateIncidentChannel.operatorDiagnosticPluginIsSigningRecovery = true;
  assert.throws(
    () => validateGate({
      root,
      gate,
      sourceLock,
      signingCustody: diagnosticBackdoor,
      rollbackPolicy: rollback(),
      stockRecoveryPolicy: stockRecovery(),
    }),
    /custody architecture changed/,
  );

  const compromisedKeyReuse = custody();
  compromisedKeyReuse.rotationAndRevocation.incidentResponse.compromisedKeyMaySignAgain = true;
  assert.throws(
    () => validateGate({
      root,
      gate,
      sourceLock,
      signingCustody: compromisedKeyReuse,
      rollbackPolicy: rollback(),
      stockRecoveryPolicy: stockRecovery(),
    }),
    /custody architecture changed/,
  );

  const falseHsmClaim = custody();
  falseHsmClaim.planFreeze.hsmProvisioned = true;
  assert.throws(
    () => validateGate({
      root,
      gate,
      sourceLock,
      signingCustody: falseHsmClaim,
      rollbackPolicy: rollback(),
      stockRecoveryPolicy: stockRecovery(),
    }),
    /custody architecture changed/,
  );
});

void test('rollback policy rejects trial-slot commit and downgrade recovery exceptions', () => {
  const gate = read('data/android-first-flash-gate.json');
  const sourceLock = read('os/physical/frankel-source-lock.json');

  const trialCommit = rollback();
  trialCommit.abCommit.advanceFromUnsuccessfulTrialSlot = true;
  assert.throws(
    () => validateGate({
      root,
      gate,
      sourceLock,
      signingCustody: custody(),
      rollbackPolicy: trialCommit,
      stockRecoveryPolicy: stockRecovery(),
    }),
    /rollback index policy changed/,
  );

  const rescueDowngrade = rollback();
  rescueDowngrade.downgradeAndRecovery.lowerIndexForDataRescueAllowed = true;
  assert.throws(
    () => validateGate({
      root,
      gate,
      sourceLock,
      signingCustody: custody(),
      rollbackPolicy: rescueDowngrade,
      stockRecoveryPolicy: stockRecovery(),
    }),
    /rollback index policy changed/,
  );
});

void test('stock recovery policy rejects beta selection and download-as-flash approval', () => {
  const gate = read('data/android-first-flash-gate.json');
  const sourceLock = read('os/physical/frankel-source-lock.json');

  const betaRecovery = stockRecovery();
  betaRecovery.selection.previewOrBetaAllowed = true;
  assert.throws(
    () => validateGate({
      root,
      gate,
      sourceLock,
      signingCustody: custody(),
      rollbackPolicy: rollback(),
      stockRecoveryPolicy: betaRecovery,
    }),
    /Google stock recovery policy changed/,
  );

  const implicitFlash = stockRecovery();
  implicitFlash.uses.downloadAloneAuthorizesFlash = true;
  assert.throws(
    () => validateGate({
      root,
      gate,
      sourceLock,
      signingCustody: custody(),
      rollbackPolicy: rollback(),
      stockRecoveryPolicy: implicitFlash,
    }),
    /Google stock recovery policy changed/,
  );

  const falseArtifactClaim = stockRecovery();
  falseArtifactClaim.implementation.actualArtifactsVerified = true;
  assert.throws(
    () => validateGate({
      root,
      gate,
      sourceLock,
      signingCustody: custody(),
      rollbackPolicy: rollback(),
      stockRecoveryPolicy: falseArtifactClaim,
    }),
    /Google stock recovery policy changed/,
  );
});

void test('backup policy rejects operator recovery keys and password-only recovery', () => {
  const gate = read('data/android-first-flash-gate.json');
  const sourceLock = read('os/physical/frankel-source-lock.json');

  const operatorKey = backupRecovery();
  operatorKey.wrapping.operatorUniversalRecoveryKeyAllowed = true;
  assert.throws(
    () => validateAndroidFirstFlashGate({
      root,
      gate,
      sourceLock,
      signingCustody: custody(),
      rollbackPolicy: rollback(),
      stockRecoveryPolicy: stockRecovery(),
      backupRecoveryPolicy: operatorKey,
    }),
    /backup recovery policy changed/,
  );

  const passwordOnly = backupRecovery();
  passwordOnly.wrapping.ownerRoute.passwordOnlyRecoveryAllowed = true;
  assert.throws(
    () => validateAndroidFirstFlashGate({
      root,
      gate,
      sourceLock,
      signingCustody: custody(),
      rollbackPolicy: rollback(),
      stockRecoveryPolicy: stockRecovery(),
      backupRecoveryPolicy: passwordOnly,
    }),
    /backup recovery policy changed/,
  );
});
