import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { auditSkyLaunch } from '../scripts/lib/sky-launch-audit.mjs';

const current = () => JSON.parse(readFileSync(new URL('../data/sky-service-launch.json', import.meta.url), 'utf8'));
const evidenceExists = (path) => existsSync(new URL(`../${path}`, import.meta.url));

void test('current focused release refuses source deployment and synthetic UI as production cloud acceptance', () => {
  const result = auditSkyLaunch(current(), evidenceExists);
  const missing = result.missing.focused.map((gate) => gate.id);
  assert.ok(missing.includes('focused-cloud-ai'));
  assert.ok(missing.includes('focused-customer-journey'));
  assert.ok(missing.includes('focused-apple-pay'));
  assert.ok(missing.includes('authenticated-first-use'));
  assert.ok(missing.includes('recovery-and-update'));
  assert.equal(missing.includes('focused-csv-payment'), false);
});

void test('a focused launch claim cannot hide missing production acceptance', () => {
  const report = current();
  report.focusedLaunchClaim = true;
  assert.throws(() => auditSkyLaunch(report, evidenceExists), /Focused-launch claim disagrees/);
});

void test('a local cloud fixture cannot pass a production gate', () => {
  const report = current();
  const cloud = report.gates.find((gate) => gate.id === 'focused-cloud-ai');
  cloud.status = 'passed';
  cloud.environment = 'local-synthetic-provider';
  assert.throws(() => auditSkyLaunch(report, evidenceExists), /needs production evidence/);
});

void test('removing the actual cloud or Apple Pay requirement is rejected', () => {
  for (const id of ['focused-cloud-ai', 'focused-apple-pay']) {
    const report = current();
    report.gates = report.gates.filter((gate) => gate.id !== id);
    assert.throws(() => auditSkyLaunch(report, evidenceExists), /Missing focused acceptance/);
  }
});

void test('focused acceptance cannot skip basic owner isolation and recovery', () => {
  const report = current();
  report.stageDependencies.focused = [];
  assert.throws(() => auditSkyLaunch(report, evidenceExists), /retain basic/);
});

void test('missing evidence and dependency cycles reject launch reports', () => {
  assert.throws(() => auditSkyLaunch(current(), () => false), /Missing launch evidence file/);
  const report = current();
  report.stageDependencies.basic = ['focused'];
  assert.throws(() => auditSkyLaunch(report, evidenceExists), /dependency cycle/);
});

void test('removing the whole focused stage or its owner-isolation gate cannot hide unfinished work', () => {
  const report = current();
  delete report.stageDependencies.focused;
  report.gates = report.gates.filter((gate) => gate.stage !== 'focused');
  assert.throws(() => auditSkyLaunch(report, evidenceExists), /stage is required/);
  const narrowed = current();
  narrowed.gates = narrowed.gates.filter((gate) => gate.id !== 'authenticated-first-use');
  assert.throws(() => auditSkyLaunch(narrowed, evidenceExists), /Missing basic acceptance/);
});
