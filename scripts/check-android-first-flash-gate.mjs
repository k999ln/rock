import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAndroidFirstFlashGate } from './android-first-flash-gate-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const result = validateAndroidFirstFlashGate({
  root,
  gate: read('data/android-first-flash-gate.json'),
  sourceLock: read('os/physical/frankel-source-lock.json'),
  signingCustody: read('data/android-signing-custody-policy.json'),
  rollbackPolicy: read('data/android-rollback-index-policy.json'),
  stockRecoveryPolicy: read('data/android-stock-recovery-policy.json'),
  backupRecoveryPolicy: read('data/android-backup-recovery-policy.json'),
});

console.log(
  `初回flash gate: ${result.passedCount}/4 PASS / ${result.target} / ` +
    (result.passed ? 'FLASH_GATE_PASS' : `BLOCKED: ${result.blocked.join(', ')}`),
);

if (process.argv.includes('--require-pass') && !result.passed) {
  throw new Error('first-flash-gate: 4/4 PASSになるまで初回flashは禁止です');
}
