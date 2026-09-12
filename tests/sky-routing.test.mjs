import assert from 'node:assert/strict';
import test from 'node:test';
import { routeSkyRequest, skyRoles } from '../lib/sky-routing.ts';

void test('Sky routes a plain-language request to each available role', () => {
  const cases = [
    ['この案件に応募してよいか判断して', 'coconala'],
    ['この原稿から無料版の記事を作って', 'mr-free-article'],
    ['この記事の出典URLをまとめて', 'mr-citations'],
    ['契約と成果物を見て納品確認して', 'mr-delivery'],
  ];

  for (const [request, toolId] of cases) {
    assert.equal(routeSkyRequest(request)?.toolId, toolId);
  }
});

void test('Sky exposes four roles and does not guess an unrelated request', () => {
  assert.equal(skyRoles.length, 4);
  assert.equal(routeSkyRequest('今日の天気を教えて'), null);
  assert.equal(routeSkyRequest('  '), null);
});
