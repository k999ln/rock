// 切り替え（環境変数）の読み方の検証。値の形が違う時に、開いた側へ倒れないこと。
import test from 'node:test';
import assert from 'node:assert/strict';
import { noahAllowed, parseNoahFlags } from '../../contracts/noah-flags-v1.ts';
import { NOAH_ASK_LIMITS } from '../../contracts/noah-form-v1.ts';
import { NOAH_PATROL_BUDGET } from '../../contracts/noah-intake-v1.ts';

test('何も置かなければ、全部閉じている。数は既定', () => {
  assert.deepEqual(parseNoahFlags({}), {
    patrol: false, intakePublic: false, askForm: false, probeL2: false, modelRelay: 'off',
    askLimits: NOAH_ASK_LIMITS, patrolBudget: NOAH_PATROL_BUDGET, warnings: [],
  });
});

test('開くのは、値が true の時だけ。形の違う値は、閉じた物として扱い、運営に知らせる', () => {
  const flags = parseNoahFlags({ NOAH_PATROL_ENABLED: 'true', NOAH_INTAKE_PUBLIC: 'TRUE', NOAH_ASK_FORM: '1', NOAH_PROBE_L2: 'false', NOAH_MODEL_RELAY: 'gpt' });
  assert.deepEqual([flags.patrol, flags.intakePublic, flags.askForm, flags.probeL2, flags.modelRelay], [true, false, false, false, 'off']);
  assert.deepEqual(flags.warnings, [
    'NOAH_INTAKE_PUBLIC は true か false です。閉じた物として扱います。', 'NOAH_ASK_FORM は true か false です。閉じた物として扱います。',
    'NOAH_MODEL_RELAY は off か test です。off として扱います。',
  ]);
  assert.equal(parseNoahFlags({ NOAH_MODEL_RELAY: 'test' }).modelRelay, 'test');
});

test('数の上書き: 知っている項目の、範囲の中の整数だけ', () => {
  const flags = parseNoahFlags({ NOAH_ASK_LIMITS: '{"perDay":50,"hostPerMinute":0,"speed":9}', NOAH_PATROL_BUDGET: '{"probes":16}' });
  assert.deepEqual(flags.askLimits, { ...NOAH_ASK_LIMITS, perDay: 50 });
  assert.deepEqual(flags.patrolBudget, { ...NOAH_PATROL_BUDGET, probes: 16 });
  assert.equal(flags.warnings.length, 2);
  assert.deepEqual(parseNoahFlags({ NOAH_ASK_LIMITS: '{こわれた' }).askLimits, NOAH_ASK_LIMITS);
  assert.deepEqual(parseNoahFlags({ NOAH_ASK_LIMITS: '[1,2]' }).askLimits, NOAH_ASK_LIMITS);
  assert.deepEqual(parseNoahFlags({ NOAH_ASK_LIMITS: '{"perDay":"50"}' }).askLimits, NOAH_ASK_LIMITS, '文字の数は採らない');
  assert.notEqual(parseNoahFlags({}).askLimits, NOAH_ASK_LIMITS, '既定の object そのものを返さない（書き換えが漏れない）');
});

test('閉じていても、審査者は使える。頼むには、一覧も開いている必要がある', () => {
  const closed = parseNoahFlags({});
  assert.deepEqual([noahAllowed(closed, 'list', false), noahAllowed(closed, 'ask', false), noahAllowed(closed, 'list', true), noahAllowed(closed, 'ask', true)], [false, false, true, true]);
  const listOnly = parseNoahFlags({ NOAH_INTAKE_PUBLIC: 'true' });
  assert.deepEqual([noahAllowed(listOnly, 'list', false), noahAllowed(listOnly, 'ask', false)], [true, false], '見せるだけ（頼むのは止めてある）');
  const askOnly = parseNoahFlags({ NOAH_ASK_FORM: 'true' });
  assert.equal(noahAllowed(askOnly, 'ask', false), false, '一覧を閉じたまま、頼むことだけを開けない');
  const open = parseNoahFlags({ NOAH_INTAKE_PUBLIC: 'true', NOAH_ASK_FORM: 'true' });
  assert.deepEqual([noahAllowed(open, 'list', false), noahAllowed(open, 'ask', false)], [true, true]);
});
