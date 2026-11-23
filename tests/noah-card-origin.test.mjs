import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { noahRevenueDirectory } from '../lib/noah-revenue-directory.ts';
import { NOAH_AD_NOTICE, noahCardOrigin } from '../lib/noah-pins.ts';

// ホームの先頭に出る Noah 自身の紹介の窓口（広告を含む）は、カードの下の行に
// 「noah-revenue-agents.mr-kirin999.workers.dev」とだけ出て、誰の案内か分からなかった。
// 決め（2026-11-23、本人「好きにしていいよ」）: 出し続ける。カードの表には「Noahの案内（広告を含む）」と書き、送信先は詳細の画面に出す。
const now = Date.now();
const items = [
  { id: 'noah-business-training', url: 'https://avoado.si/noah/business-si', mcp: 'https://noah-business-si.mr-kirin999.workers.dev/consult/mcp' },
  { id: 'noah-wordpress-maintenance', url: 'https://noah-revenue-agents.mr-kirin999.workers.dev/agent/wordpress-maintenance', mcp: 'https://noah-revenue-agents.mr-kirin999.workers.dev/consult/site/wordpress-maintenance/mcp' },
  { id: 'noah-ec-production', url: 'https://noah-revenue-agents.mr-kirin999.workers.dev/agent/ec-production', mcp: 'https://noah-revenue-agents.mr-kirin999.workers.dev/consult/site/ec-production/mcp' },
].map((item) => ({ ...item, origin: 'first_party', checkedAt: new Date(now).toISOString() }));

await test('Noah 自身の窓口は、カードの表で「Noahの案内（広告を含む）」と分かり、送信先の名前は詳細のために残る', async () => {
  const rows = await noahRevenueDirectory(async () => Response.json({ items }), now);
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.equal(row.card.notice, 'noah-ad');
    assert.equal(noahCardOrigin(row.card), NOAH_AD_NOTICE);
    assert.equal(row.card.provider, 'Noah');
    assert.ok(row.card.host, '送信先の名前は、詳細の画面のために残す');
  }
  assert.equal(NOAH_AD_NOTICE, 'Noahの案内（広告を含む）');
});

await test('ほかの Agent のカードは、今までどおり送信先の名前（無ければ提供元）を出す', () => {
  assert.equal(noahCardOrigin({ host: 'tools.example.com', provider: 'Example' }), 'tools.example.com');
  assert.equal(noahCardOrigin({ host: null, provider: 'Example' }), 'Example');
});

await test('ホームと探す画面のカードは、この決まりで下の行を作る', () => {
  const grid = readFileSync(new URL('../components/noah-pin-grid.tsx', import.meta.url), 'utf8');
  assert.match(grid, /\{noahCardOrigin\(item\)\} · /);
  assert.doesNotMatch(grid, /\{item\.host \?\? item\.provider\}/);
});
