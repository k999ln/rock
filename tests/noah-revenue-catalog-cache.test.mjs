import assert from 'node:assert/strict';
import test from 'node:test';
import { createNoahRevenueCatalog, NOAH_REVENUE_CATALOG_CACHE_MS } from '../lib/noah-revenue-catalog.ts';

// 誰でも呼べる一覧。呼ぶたびに全件を作り直すと、外から繰り返し呼ぶだけで DB の全件読みと外向きの取得を起こせた。
const entry = (id) => ({ card: { id, feedbackId: id, name: `名前 ${id}`, summary: `説明 ${id}` } });

void test('the public revenue catalog is rebuilt at most once per five minutes and failures are not reused', async () => {
  let reads = 0, time = 1_000_000, fail = false;
  const catalog = createNoahRevenueCatalog(async () => { reads++; if (fail) throw Error('down'); return [entry('a'), entry('b')]; }, { now: () => time });
  const first = await catalog();
  assert.equal(first.status, 200);
  assert.match(first.headers.get('cache-control'), /max-age=300/);
  const body = await first.json();
  assert.equal(body.total, 2);
  time += NOAH_REVENUE_CATALOG_CACHE_MS - 1;
  assert.deepEqual(await (await catalog()).json(), body);
  assert.equal(reads, 1);
  time += 1; fail = true;
  const failed = await catalog();
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get('cache-control'), 'no-store');
  fail = false;
  assert.equal((await catalog()).status, 200);
  assert.equal(reads, 3);
});
