import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../components/system-maintenance.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../components/system-maintenance.module.css', import.meta.url), 'utf8');

// Source contracts supplement the real keyboard checks in webops-01 evidence;
// these checks cannot establish screen-reader or computed layout acceptance.
void test('diagnostic completion is aggregated outside the per-check list', () => {
  assert.match(source, /setChecks\(next\);\s*setDiagnosticSummary\(`診断完了/);
  assert.match(source, /<output className=\{styles.diagnosticSummary\} aria-atomic="true" aria-busy=\{running\}/);
  assert.match(source, /if \(!running\) void runDiagnostics\(\)/);
  assert.match(source, /aria-disabled=\{running\} aria-controls="maintenance-checks"/);
  const list = source.slice(source.indexOf('<section id="maintenance-checks"'), source.indexOf('<h2>保全と復旧'));
  assert.doesNotMatch(list, /aria-live|role="(?:status|alert)"/);
});

void test('manual dialog openings provide their own return target without changing shared dialog', () => {
  assert.match(source, /backupTrigger.current = trigger/);
  for (const mode of ['create', 'restore']) {
    assert.ok(source.includes(`openBackup('${mode}', event.currentTarget)`));
  }
  assert.match(source, /<DialogContent className=\{styles.dialog\} finalFocus=\{backupTrigger\}/);
  assert.match(source, /<DialogClose className=\{styles.cancelBackup\}>キャンセル<\/DialogClose>/);
  assert.doesNotMatch(source, /addEventListener\(['"]keydown|preventDefault\(\)/);
});

void test('backup validation is announced inside the modal, with no duplicate background status', () => {
  assert.match(source, /hidden=\{backupMode !== null \|\| !message\} aria-atomic="true"/);
  const modal = source.slice(source.indexOf('<Dialog open='));
  assert.match(modal, /<output className=\{styles.notice\} aria-atomic="true">\{message\}<\/output>/);
  assert.match(modal, /aria-describedby="backup-passphrase-help"/);
  assert.match(modal, /id="backup-passphrase-help"/);
  assert.match(modal, /aria-label=\{backupFile \? `復元するバックアップファイルを選ぶ：\$\{backupFile.name\}`/);
  for (const name of ['createBackup', 'restoreBackup']) {
    const body = source.slice(source.indexOf(`async function ${name}()`));
    const failure = body.slice(body.indexOf('} catch'), body.indexOf('} finally'));
    assert.match(failure, /setMessage/);
    assert.doesNotMatch(failure, /setPassphrase|setBackupMode|restoreDevicePreferences|fetch\(/);
  }
});

void test('maintenance controls and portal retain visible focus, target size, reflow and reduced motion contracts', () => {
  assert.match(css, /\.dialog :is\(button, input\):focus-visible/);
  assert.match(css, /outline: 3px solid var\(--os-text\)/);
  assert.match(css, /\.page :is\(button, a\), \.dialog button \{ min-width: 44px; min-height: 44px; \}/);
  assert.match(css, /\.passphrase, \.passphrase input, \.fileButton \{ min-width: 0; width: 100%; \}/);
  assert.match(css, /\.dialog \{ min-width: 0; overflow-wrap: anywhere; \}/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*animation: none !important; transition: none !important/);
});
