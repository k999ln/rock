import assert from 'node:assert/strict';
import test from 'node:test';
import { routeSkyRequest, skyRoles } from '../lib/sky-routing.ts';

void test('Sky routes a plain-language request to each available role', () => {
  const cases = [
    ['この案件に応募してよいか判断して', 'coconala'],
    ['この原稿から無料版の記事を作って', 'mr-free-article'],
    ['この記事の出典URLをまとめて', 'mr-citations'],
    ['契約と成果物を見て納品確認して', 'mr-delivery'],
    ['サブスクの次の更新日を確認して', 'rockstar-ledger'],
    ['逮捕について日本語で法律相談したい', 'rockstar-legal-intake'],
    ['この発明を特許出願できるか調べて', 'rockstar-patent-assistant'],
  ];

  for (const [request, toolId] of cases) {
    assert.equal(routeSkyRequest(request)?.toolId, toolId);
  }
});

void test('Sky exposes seven roles and does not guess an unrelated request', () => {
  assert.equal(skyRoles.length, 7);
  assert.equal(routeSkyRequest('今日の天気を教えて'), null);
  assert.equal(routeSkyRequest('  '), null);
});
