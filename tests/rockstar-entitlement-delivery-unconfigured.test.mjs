import assert from 'node:assert/strict';
import test from 'node:test';
import { handleRockstarEntitlementDeliveryRequest } from '../lib/rockstar-entitlement-delivery-http.ts';

// 使い勝手と抜け道の確かめ（2026-11-22）の S4 / task 129 の D3:
// 鍵を持たない知らない人が GET すると、503 と SELLER_REGISTRY_UNCONFIGURED が返り、何が未設定かが外から分かった。
// 鍵（Bearer）を持たない人には、設定の有無に関わらず 401 だけを返す。鍵を持つ売り手には、今までどおり設定の不足を知らせる。
const db = { prepare() { throw Error('鍵の無い人のために DB を読まない'); } };
const url = 'https://rockstar.test/api/internal/rockstar/entitlement-deliveries';

void test('鍵の無い人には、売り手の一覧や鍵の束が無くても 401 だけを返し、DB も読まない', async () => {
  for (const config of [
    {},
    { ROCKSTAR_ENTITLEMENT_DELIVERY_SELLERS: '[]' },
    { ROCKSTAR_ENTITLEMENT_DELIVERY_SELLERS: undefined, ROCKSTAR_ENTITLEMENT_DELIVERY_CODE_KEYS: undefined },
  ]) {
    for (const method of ['GET', 'POST', 'PATCH']) {
      for (const authorization of [null, 'Bearer short', 'Basic abc']) {
        const headers = new Headers();
        if (authorization) headers.set('authorization', authorization);
        const response = await handleRockstarEntitlementDeliveryRequest(new Request(url, { method, headers }), db, config);
        assert.equal(response.status, 401, `${method} ${authorization ?? '(なし)'}`);
        const body = await response.json();
        assert.deepEqual(body, { code: 'UNAUTHORIZED' });
        assert.doesNotMatch(JSON.stringify(body), /UNCONFIGURED/);
      }
    }
  }
});

void test('形の正しい鍵を持つ売り手には、今までどおり設定の不足（503）を知らせる', async () => {
  const headers = new Headers({ authorization: `Bearer seller_${'t'.repeat(40)}` });
  const response = await handleRockstarEntitlementDeliveryRequest(new Request(url, { method: 'GET', headers }), db, {});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'SELLER_REGISTRY_UNCONFIGURED');
});
