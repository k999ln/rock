import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../components/sky-service-help.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;

function render(service) {
  const compiledModule = { exports: {} };
  runInNewContext(compiled, {
    module: compiledModule, exports: compiledModule.exports,
    require(name) {
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'next/link') return { default: ({ children, ...props }) => createElement('a', props, children) };
      if (name === './workspace-shell') return { default: ({ children }) => createElement('main', null, children) };
      if (name === '@/lib/use-sky-service-status') return { useSkyServiceStatus: () => service };
      if (name.endsWith('.module.css')) return { default: {} };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return renderToStaticMarkup(createElement(compiledModule.exports.default));
}

await test('Site CSV help shows its live contract and entry links independently of the separate CSV payment status', () => {
  for (const csvPayments of [undefined, 'unconfigured', 'test', 'live']) {
    const service = csvPayments === undefined ? undefined : {
      database: 'available', csvStorageConfigured: true, payments: 'unconfigured', csvPayments,
    };
    const html = render(service);
    assert.match(html, /1ファイル税込3,000円/);
    assert.match(html, /固定サンプルは0円/);
    assert.match(html, /仕様と入金の照合が終わってから処理を開始/);
    assert.match(html, /href="\/csv"/);
    assert.match(html, /href="\/csv\/terms"/);
    assert.doesNotMatch(html, /50円|実際に.*請求されます|CSV専用決済の接続待ち/);
    if (service) {
      assert.match(html, /単価見積・支出上限・利用明細の接続待ち/);
      assert.match(html, /料金確認機能が受け入れられるまで外部評価を停止/);
    }
  }
});

await test('Site CSV help distinguishes file expiry and conditional deletion from retained financial records', () => {
  const html = render(undefined);
  assert.match(html, /受付から7日後はファイルを取得できません/);
  assert.match(html, /ファイル本体と共有情報を削除/);
  assert.match(html, /取引・会計記録はファイルと分けて保持/);
  assert.match(html, /入金・返金の台帳がなく、削除条件を満たす案件/);
  assert.doesNotMatch(html, /CSVは[^<]*受付画面から削除できます/);
  assert.match(html, /このブラウザに最大20件/);
  assert.match(html, /同じブラウザを使う人も閲覧できます/);
});
