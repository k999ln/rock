import assert from 'node:assert/strict';
import test from 'node:test';
import { settleDeviceResults } from '../lib/sky-device-tiers.ts';

const result = (memberRef, char) => ({ unitId: 'unit-001', memberRef, outputSha256: char.repeat(64) });
const settle = (results, quorum = 2) => settleDeviceResults({
  orderId: 'order-001', results, quorum, unitRateMinor: 5,
});

void test('two conflicting quorums remain unresolved without rewarding a lexical hash winner', () => {
  const results = [result('member-a', 'a'), result('member-b', 'a'), result('member-c', 'b'), result('member-d', 'b')];
  for (const input of [results, [...results].reverse()]) {
    const outcome = settle(input);
    assert.deepEqual(outcome.accepted, []);
    assert.deepEqual(outcome.unresolved, ['unit-001']);
    assert.deepEqual(outcome.contributions, []);
  }
});

void test('a larger group does not resolve a second independently satisfied quorum', () => {
  const outcome = settle([
    result('member-a', 'a'), result('member-b', 'a'), result('member-c', 'a'),
    result('member-d', 'b'), result('member-e', 'b'),
  ]);
  assert.deepEqual(outcome.accepted, []);
  assert.deepEqual(outcome.unresolved, ['unit-001']);
  assert.deepEqual(outcome.contributions, []);
});

void test('one quorum still accepts its matching members with a below-quorum dissent', () => {
  const outcome = settle([result('member-a', 'a'), result('member-b', 'a'), result('member-c', 'b')]);
  assert.deepEqual(outcome.accepted, [{ unitId: 'unit-001', outputSha256: 'a'.repeat(64) }]);
  assert.deepEqual(outcome.unresolved, []);
  assert.deepEqual(outcome.contributions.map(({ participantRef }) => participantRef), ['member-a', 'member-b']);
});

void test('repeated submissions by one member cannot create a quorum or duplicate contributions', () => {
  const single = result('member-a', 'a');
  assert.deepEqual(settle([single, single, single]).contributions, []);
  assert.deepEqual(settle([single, single, single]).unresolved, ['unit-001']);
  const agreed = settle([single, single, result('member-b', 'a'), result('member-b', 'a')]);
  assert.equal(agreed.accepted.length, 1);
  assert.equal(agreed.contributions.length, 2);
});

void test('three-member quorums require exactly one agreed output group', () => {
  const oneGroup = [result('member-a', 'a'), result('member-b', 'a'), result('member-c', 'a')];
  assert.equal(settle(oneGroup, 3).accepted.length, 1);
  const twoGroups = [...oneGroup, result('member-d', 'b'), result('member-e', 'b'), result('member-f', 'b')];
  assert.deepEqual(settle(twoGroups, 3).accepted, []);
  assert.deepEqual(settle(twoGroups, 3).contributions, []);
});
