import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  noahRevenueDirectory,
  noahRevenueTarget,
} from '../lib/noah-revenue-directory.ts';
const now = Date.now();
const item = {
  id: 'noah-business-training',
  origin: 'first_party',
  url: 'https://avoado.si/noah/business-si',
  mcp: 'https://noah-business-si.mr-kirin999.workers.dev/consult/mcp',
  checkedAt: new Date(now).toISOString(),
};
await test('既知の自社Agentだけを共通一覧とMCP実行先に接続', async () => {
  const rows = await noahRevenueDirectory(
    async () => Response.json({ items: [item] }),
    now,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].firstParty, 'business-training');
  assert.equal(rows[0].card.sources, undefined);
  assert.equal(rows[0].card.users, 0);
  assert.equal((await noahRevenueTarget(rows[0], now)).url, item.mcp);
  assert.equal(
    await noahRevenueTarget({ ...rows[0], firstParty: undefined }, now),
    null,
  );
  assert.equal(
    await noahRevenueTarget(
      { ...rows[0], card: { ...rows[0].card, href: 'https://evil.example' } },
      now,
    ),
    null,
  );
  assert.equal(await noahRevenueTarget(rows[0], now + 1200001), null);
});
await test('取り下げ・期限・不正接続先・API失敗・過大応答は掲載しない', async () => {
  for (const patch of [
    { mcp: 'https://evil.example/mcp' },
    { origin: 'mcp-registry' },
    { id: 'unknown' },
    { checkedAt: 'invalid' },
    { checkedAt: new Date(now - 1200001).toISOString() },
    { checkedAt: new Date(now + 1).toISOString() },
  ]) {
    assert.deepEqual(
      await noahRevenueDirectory(
        async () => Response.json({ items: [{ ...item, ...patch }] }),
        now,
      ),
      [],
    );
  }
  assert.deepEqual(
    await noahRevenueDirectory(async () => Response.json({ items: [] }), now),
    [],
  );
  assert.deepEqual(
    await noahRevenueDirectory(
      async () => new Response(null, { status: 302 }),
      now,
    ),
    [],
  );
  assert.deepEqual(
    await noahRevenueDirectory(async () => new Response('x'.repeat(8193)), now),
    [],
  );
});

await test('同じ取得の公開カードだけを一括投影し、非公開列を除く', async () => {
  const { createNoahRevenueCatalog } =
    await import('../lib/noah-revenue-catalog.ts');
  const entries = await noahRevenueDirectory(
    async () => Response.json({ items: [item] }),
    now,
  );
  const response = await createNoahRevenueCatalog(async () => entries)();
  const data = await response.json();
  assert.equal(data.total, 1);
  assert.equal(data.schema, 'noah-revenue-catalog/1');
  assert.deepEqual(Object.keys(data.items[0]).sort(), [
    'id',
    'name',
    'summary',
  ]);
  assert.equal(
    (await createNoahRevenueCatalog(async () => [...entries, ...entries])())
      .status,
    503,
  );
});
