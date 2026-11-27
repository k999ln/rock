import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { noahSignInHref } from '../lib/noah-navigation.ts';

// task 129 の D8（サインインの行き先）の合格: Noah の画面に、/noah/account へ行く「サインイン」が無い。
// /noah/account は元の画面へ戻すだけで、戻った先でブラウザだけの本人が作られる。本当のサインインが要る画面
// （初回の売上・参加型計算など、API がブラウザだけの本人に 401 を返す所）で使うと、同じ画面へ戻り続けて先へ進めない。
// 「サインイン」「ログイン」と書いたリンクは、ChatGPT のサインイン（noahSignInHref か /signin-with-chatgpt）へ行く。
const root = fileURLToPath(new URL('..', import.meta.url));
const files = (dir, keep) => readdirSync(join(root, dir)).flatMap((name) => {
  const path = join(dir, name);
  if (statSync(join(root, path)).isDirectory()) return files(path, keep);
  return keep(name) ? [path] : [];
});
const screens = [
  ...files('components', (name) => /^noah.*\.tsx$/.test(name)),
  ...files('app/noah', (name) => name.endsWith('.tsx')),
];

/** リンク（Link・a）の開始の印・中の文。属性の中の `>`（矢印の関数）は、波かっこの中なので飛ばす。 */
function links(source) {
  const found = [];
  const open = /<(Link|a)\b/g;
  for (let match; (match = open.exec(source));) {
    let depth = 0, at = match.index + match[0].length;
    for (; at < source.length; at++) {
      const char = source[at];
      if (char === '{') depth++;
      else if (char === '}') depth--;
      else if (char === '>' && depth === 0) break;
    }
    const attributes = source.slice(match.index, at);
    const close = source.indexOf(`</${match[1]}>`, at);
    if (close < 0) continue;
    const text = source.slice(at + 1, close).replace(/<[^>]*>/g, '');
    found.push({ attributes, text, line: source.slice(0, match.index).split('\n').length });
  }
  return found;
}

await test('Noah の画面の「サインイン」「ログイン」は、/noah/account へ行かない', () => {
  assert.ok(screens.length > 50, `Noah の画面のファイルを読んだ（${screens.length}）`);
  const signIns = [];
  for (const path of screens) {
    for (const link of links(readFileSync(join(root, path), 'utf8'))) {
      if (!/サインイン|ログイン/.test(link.text)) continue;
      signIns.push(`${relative(root, join(root, path))}:${link.line}`);
      assert.doesNotMatch(link.attributes, /\/noah\/account|noahAccountHref|noahReadyAccountHref/, `${path}:${link.line}「${link.text.trim()}」が /noah/account へ行く`);
      assert.match(link.attributes, /href=\{noahSignInHref\(|href=(?:"|\{`)\/signin-with-chatgpt\?/, `${path}:${link.line}「${link.text.trim()}」は ChatGPT のサインインへ行く`);
    }
  }
  // 少なくとも、直した 2 つ（初回の売上・参加型計算）を読んでいる。
  for (const name of ['components/noah-first-earning.tsx', 'components/noah-shared-compute.tsx']) {
    assert.ok(signIns.some((at) => at.startsWith(name + ':')), `${name} のサインインのリンクを確かめた`);
  }
});

await test('サインインの行き先は、元の Noah の画面へ戻る', () => {
  assert.equal(noahSignInHref('/noah/first-earning'), '/signin-with-chatgpt?return_to=%2Fnoah%2Ffirst-earning');
  assert.equal(noahSignInHref('/noah/shared-compute'), '/signin-with-chatgpt?return_to=%2Fnoah%2Fshared-compute');
});
