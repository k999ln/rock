import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NOAH_HARDWARE_FAMILIES,
  NOAH_HARDWARE_MAINTENANCE_SCHEMA,
  summarizeNoahHardwareState,
} from '../lib/noah-hardware-maintenance.ts';
import { catalog } from '../lib/catalog.ts';
import { outputFor } from '../lib/sky-candidate-output.ts';
import { skyToolExecutionScope } from '../lib/sky-tool-execution-scope.ts';

const state = (overrides = {}) =>
  JSON.stringify({
    schema: NOAH_HARDWARE_MAINTENANCE_SCHEMA,
    deviceFamily: 'printer-scanner',
    connection: { kind: 'usb', state: 'connected' },
    operationState: 'idle',
    consumables: [],
    ...overrides,
  });

void test('the twelve design families are labels accepted by one mock-only state boundary', () => {
  assert.equal(NOAH_HARDWARE_FAMILIES.length, 12);
  for (const family of NOAH_HARDWARE_FAMILIES) {
    const result = summarizeNoahHardwareState(state({ deviceFamily: family.id }));
    assert.equal(result.deviceFamily, family.id);
    assert.equal(result.deviceFamilyLabel, family.label);
    assert.equal(result.status, 'ready');
    assert.equal(result.deviceWrites, 0);
    assert.equal(result.externalCalls, 0);
  }
});

void test('low printer consumable is attention and never claims a repair', () => {
  const result = summarizeNoahHardwareState(
    state({
      consumables: [{ name: 'black-toner', levelPercent: 12, state: 'low' }],
    }),
  );
  assert.equal(result.status, 'attention');
  assert.equal(result.deviceFamily, 'printer-scanner');
  assert.match(result.findings.join('\n'), /black-toner.*low/);
  assert.match(result.nextChecks.join('\n'), /交換・補充/);
  assert.equal(result.deviceWrites, 0);
  assert.equal(result.externalCalls, 0);
  assert.match(JSON.stringify(result), /mock-state-json/);
  assert.doesNotMatch(JSON.stringify(result), /repair|repaired|修理完了/);
});

void test('a connected idle camera with no consumables is ready only as a fixture result', () => {
  const result = summarizeNoahHardwareState(
    state({ deviceFamily: 'camera' }),
  );
  assert.equal(result.status, 'ready');
  assert.equal(result.connection.state, 'connected');
  assert.equal(result.operationState, 'idle');
  assert.equal(result.evidence, 'mock-state-json');
});

void test('unknown connection or operation state stays explicitly unknown', () => {
  const result = summarizeNoahHardwareState(
    state({
      connection: { kind: 'unknown', state: 'unknown' },
      operationState: 'unknown',
    }),
  );
  assert.equal(result.status, 'unknown');
  assert.match(result.findings.join('\n'), /判定できません/);
});

void test('malformed, unsupported, or sensitive fixture fields are rejected', () => {
  assert.throws(
    () => summarizeNoahHardwareState('{'),
    /JSON形式/,
  );
  assert.throws(
    () => summarizeNoahHardwareState(state({ schema: 'other/1' })),
    /schema/,
  );
  assert.throws(
    () => summarizeNoahHardwareState(state({ serial: 'hidden' })),
    /識別子・認証情報・パス/,
  );
  assert.throws(
    () =>
      summarizeNoahHardwareState(
        state({
          consumables: [{ name: 'serial-number', levelPercent: 50, state: 'ok' }],
        }),
      ),
    /安全な表示名/,
  );
  assert.throws(
    () => summarizeNoahHardwareState(state({ statusDetail: 'serial 123' })),
    /識別子/,
  );
});

void test('the catalog exposes the read-only candidate and Sky renders the same boundary', () => {
  const tool = catalog.find((entry) => entry.id === 'noah-local-device-maintenance');
  assert.ok(tool);
  assert.equal(tool.status, 'candidate');
  assert.equal(tool.runner, 'candidate-local');
  assert.equal(skyToolExecutionScope(tool), 'template');

  const output = outputFor(
    tool.id,
    state({ deviceFamily: 'drone', connection: { kind: 'usb', state: 'connected' } }),
  );
  assert.match(output, /模擬状態JSON/);
  assert.match(output, /mock-state-json/);
  assert.match(output, /実機成功/);
  assert.doesNotMatch(output, /serial-number|token|password/);
});
