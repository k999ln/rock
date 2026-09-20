import assert from 'node:assert/strict';
import test from 'node:test';
import { routeSkyRequest, skyRoles } from '../lib/sky-routing.ts';

void test('Sky routes a plain-language request to each available role', () => {
  const cases = [
    ['CSVの列名と重複行を整理して', 'rockstar-csv-cleanup'],
    ['メルカリで不用品を出品して収益化したい', 'mercari-revenue'],
    ['Instagramの広告からDM受注と発送まで進めて', 'fashion-brand-ops'],
    ['この案件に応募してよいか判断して', 'coconala'],
    ['この原稿から無料版の記事を作って', 'mr-free-article'],
    ['文章を整えて', 'mr-free-article'],
    ['この記事の出典URLをまとめて', 'mr-citations'],
    ['契約と成果物を見て納品確認して', 'mr-delivery'],
    ['サブスクの更新日と支払い失敗を確認して', 'rockstar-ledger'],
    ['契約上の法的な問題を法務に相談したい', 'rockstar-legal-intake'],
    ['この発明の先行技術と請求項を整理して', 'rockstar-patent-assistant'],
    ['この出力をJevで品質評価して', 'jev-evaluation'],
  ];

  for (const [request, toolId] of cases) {
    assert.equal(routeSkyRequest(request)?.toolId, toolId);
  }
});

void test('Sky exposes twelve roles and does not guess an unrelated request', () => {
  assert.equal(skyRoles.length, 12);
  assert.deepEqual(
    skyRoles.slice(9).map((role) => role.label),
    ['法務受付', '特許アシスタント', '品質評価役'],
  );
  assert.equal(routeSkyRequest('今日の天気を教えて'), null);
  assert.equal(routeSkyRequest('  '), null);
});
