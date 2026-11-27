// 本番の確かめの道具（scripts/noah-prod-check.mjs）。本人の頼み（2026-11-27）「本番の確かめの道具を、リポジトリの道具にして毎回使えるようにする」。
// ここでは通信しない。画面の一覧の作り方と、書き込む命令が --write 無しでは動かない事だけを確かめる（本番で動かした結果は PR 本文に書く）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { noahPagePaths } from '../scripts/noah-prod-check.mjs';
import { NOAH_SHORT_PAGES } from '../services/sky-web/noah-page-routes.mjs';

const script = fileURLToPath(new URL('../scripts/noah-prod-check.mjs', import.meta.url));
const root = fileURLToPath(new URL('..', import.meta.url));

void test('画面の一覧: app/noah の全部の画面と、星座名の URL。値の要る画面は入れない', () => {
  const paths = noahPagePaths();
  assert.equal(new Set(paths).size, paths.length, '同じ画面を 2 回入れない');
  for (const path of ['/noah', '/noah/help', '/noah/registration', '/noah/first-earning', '/noah/shared-compute', '/noah/account']) assert.ok(paths.includes(path), path);
  for (const [short] of NOAH_SHORT_PAGES) assert.ok(paths.includes(short), short);
  assert.ok(paths.includes('/aries'));
  assert.equal(paths.some((path) => path.includes('[')), false, '値の要る画面（[id] など）は、例の値を入れた物だけ');
  assert.ok(paths.includes('/noah/account'), '利用開始の画面（パスキー・ログイン）も測る');
  assert.equal(paths.some((path) => path.startsWith('/noah/review')), false, '審査者の画面は、ほかの人には 404（決めた通り）なので測らない');
  for (const path of paths.filter((one) => one.startsWith('/noah/') && !one.startsWith('/noah/tools/'))) {
    assert.ok(existsSync(`${root}app${path}/page.tsx`), `${path} の page がある`);
  }
});

void test('書き込む確かめ（受入・一周）は、--write を付けた時だけ動く。知らない命令は動かない', () => {
  for (const command of ['accept', 'loop']) {
    const run = spawnSync(process.execPath, [script, command, 'https://example.invalid'], { encoding: 'utf8', timeout: 30_000 });
    assert.equal(run.status, 2, `${command}: ${run.stderr}`);
    assert.match(run.stderr, /--write/);
  }
  const unknown = spawnSync(process.execPath, [script, 'deploy', 'https://example.invalid'], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /知らない命令/);
});
