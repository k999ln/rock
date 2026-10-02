import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCurrencyMinor, parseCurrencyInputToMinor } from '../lib/currency-format.ts';

void test('currency minor units use the currency-specific ISO fraction digits', () => {
  assert.equal(formatCurrencyMinor(1250, 'USD', 'en-US'), '$12.50');
  assert.equal(formatCurrencyMinor(1250, 'JPY', 'ja-JP'), '￥1,250');
  assert.equal(formatCurrencyMinor(1250, 'KWD', 'en-US'), 'KWD 1.250');
});

void test('unknown ISO currencies retain their original minor-unit amount', () => {
  assert.equal(formatCurrencyMinor(1250, 'ZZZ', 'en-US'), 'ZZZ 1,250（通貨最小単位）');
  assert.equal(formatCurrencyMinor(-1, 'USD'), '金額を確認できません');
  assert.equal(formatCurrencyMinor(1.2, 'USD'), '金額を確認できません');
});

void test('major-unit spend limits convert exactly to ISO currency minor units', () => {
  assert.equal(parseCurrencyInputToMinor('1.25', 'USD'), 125);
  assert.equal(parseCurrencyInputToMinor('1250', 'JPY'), 1250);
  assert.equal(parseCurrencyInputToMinor('1.001', 'JPY'), null);
  assert.equal(parseCurrencyInputToMinor('1.001', 'USD'), null);
  assert.equal(parseCurrencyInputToMinor('-1', 'USD'), null);
  assert.equal(parseCurrencyInputToMinor('9007199254740992', 'JPY'), null);
});
