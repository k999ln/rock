import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCurrencyInputFromMinor, formatCurrencyMinor, formatCurrencyRatePerMillionTokens, parseCurrencyInputToMinor } from '../lib/currency-format.ts';

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

void test('minor-unit budget readback becomes a plain decimal input without currency-symbol ambiguity', () => {
  assert.equal(formatCurrencyInputFromMinor(125, 'USD'), '1.25');
  assert.equal(formatCurrencyInputFromMinor(120, 'USD'), '1.2');
  assert.equal(formatCurrencyInputFromMinor(1250, 'JPY'), '1250');
  assert.equal(formatCurrencyInputFromMinor(1250, 'KWD'), '1.25');
  assert.equal(formatCurrencyInputFromMinor(-1, 'USD'), '');
  assert.equal(formatCurrencyInputFromMinor(1.2, 'USD'), '');
});

void test('provider rate-card prices format per million tokens in major currency units', () => {
  assert.equal(formatCurrencyRatePerMillionTokens(1_000_000_000, 'USD', 'en-US'), '$10 / 100万 tokens');
  assert.equal(formatCurrencyRatePerMillionTokens(1_000_000_000, 'JPY', 'ja-JP'), '￥1,000 / 100万 tokens');
  assert.equal(formatCurrencyRatePerMillionTokens(100_000_000, 'ZZZ', 'en-US'), 'ZZZ 100,000,000（通貨最小単位の百万分の一 / 100万 tokens）');
  assert.equal(formatCurrencyRatePerMillionTokens(-1, 'USD'), '単価を確認できません');
});
