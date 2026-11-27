import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// task 129 の D7（押す所を 44px 以上に。全部の画面）。2026-11-27 に本番の全部の画面（app/noah の画面と星座名の URL、74 画面）を
// 390px と 1280px で測ると（scripts/noah-prod-check.mjs pages）、小さい押す所が 390px で 37 画面、1280px で 47 画面にあった。Noah の殻（noah-shell.tsx）の
// 中身の箱（.content・.gridBody）に、全部の画面で同じ下限を掛ける。詳しさ 0 の :where なので、各画面の CSS が書いた表示と幅は変えない。
const css = readFileSync(new URL('../components/noah-service-shell.module.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/^([^{}@]+)\{([^}]*)\}/gm)].map(([, selector, body]) => ({ selector: selector.trim(), body }));
const floor = (pattern) => rules.find((rule) => rule.selector.startsWith(':where(.content, .gridBody)') && pattern.test(rule.selector));

await test('ボタン・選ぶ欄・開く印・タブは、高さ 44px 以上。ボタンとタブは幅も 44px 以上', () => {
  const height = floor(/:where\(button, select, summary, \[role="button"\], \[role="tab"\]\)/);
  assert.ok(height, '高さの下限の規則がある');
  assert.match(height.body, /min-height:\s*44px/);
  const width = floor(/:where\(button, \[role="button"\], \[role="tab"\]\)/);
  assert.ok(width, '幅の下限の規則がある');
  assert.match(width.body, /min-width:\s*44px/);
});

await test('リンクは高さ 44px 以上（文の中の class の無いリンクと、hidden の付いた物は除く）', () => {
  const link = floor(/a\[href\]/);
  assert.ok(link, 'リンクの規則がある');
  assert.match(link.selector, /a\[href\]:not\(\[hidden\]\):not\(:is\(p, li\) a\)/, '文の中の class の無いリンクは除く。hidden は表示を変えない');
  assert.match(link.selector, /:is\(p, li\) a\[href\]\[class\]:not\(\[hidden\]\)/, '文の中でも class の付いたリンク（ボタンの形の物）は 44px');
  assert.match(link.body, /display:\s*inline-flex/);
  assert.match(link.body, /min-height:\s*44px/);
});

await test('チェックボックスとラジオは、包む label の高さを 44px 以上にする', () => {
  const label = floor(/label:not\(\[hidden\]\):has\(input\[type="checkbox"\], input\[type="radio"\]\)/);
  assert.ok(label, 'label の規則がある');
  assert.match(label.body, /min-height:\s*44px/);
});

await test('利用開始の画面（/noah/account。殻の中身の箱の外）も、押す所は 44px 以上', () => {
  const account = readFileSync(new URL('../components/rockstar-account.module.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = (selector) => [...account.matchAll(/^([^{}@]+)\{([^}]*)\}/gm)].find(([, found]) => found.split(',').map((one) => one.trim()).includes(selector))?.[2] ?? '';
  for (const selector of ['.top a', '.links button', '.credentials summary', '.credentials a']) assert.match(rule(selector), /min-height:\s*44px/, selector);
});

await test('Noah の全部の画面が、この殻の中身の箱に入る', () => {
  const shell = readFileSync(new URL('../components/noah-shell.tsx', import.meta.url), 'utf8');
  assert.match(shell, /className=\{gridHome \? styles\.gridBody : styles\.content\} id="noah-content"/);
  const layout = readFileSync(new URL('../app/noah/layout.tsx', import.meta.url), 'utf8');
  assert.match(layout, /<NoahShell mode="public">\{children\}<\/NoahShell>/);
});
