// Agent の詳細の「操作の流れと道具」（ほかの Agent では「使い方を読む」）は、最初から開いている（本人 2026-11-28
// 「操作の流れと道具…開かないと使い方の流れでこの Agent でできる事出てこないの嫌だから最初からトグル開いてるようにして」）。
// 接続の前でも開いている。中の「Agentの詳細」（つなぎ方・提供者のページ）は、今までどおり閉じたまま（tests/noah-ready-ui.test.mjs）。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as ownerIntent from '../lib/owner-intent.ts';
import * as askView from '../lib/noah-ask-view.ts';
import * as botNotice from '../lib/noah-bot-notice.ts';
import * as formLib from '../lib/noah-form.ts';
import * as view from '../lib/noah-ready-view.ts';
import * as surface from '../lib/noah-surface.ts';
import { entry } from './fixtures/noah/intake.mjs';
import { mcpServer, tool } from './fixtures/noah/mcp-server.mjs';
import { world, familyId, hostOf, handshakes } from './fixtures/noah/connect-world.mjs';
import { screen } from './fixtures/noah/screen.mjs';

const MODULES = { '@/lib/owner-intent': ownerIntent, '@/lib/noah-ready-view': view, '@/lib/noah-ask-view': askView, '@/lib/noah-bot-notice': botNotice, '@/lib/noah-form': formLib, '@/lib/noah-surface': surface, 'next/image': { default: 'img' }, 'next/navigation': { usePathname: () => '/noah/ready' } };
const more = (page) => page.find('details').find((node) => node.props.id === 'noah-detail-more');

void test('接続する前から、「操作の流れと道具」は開いている。中の「Agentの詳細」は閉じたまま。開いても相手へは送らない', async (t) => {
  const server = mcpServer({ tools: [tool('lookup', true)] });
  const w = await world(t, { [hostOf(1)]: server }, { records: [entry(1, { title: 'Mizan', description: 'Looks up game bans.' })] });
  for (const user of [null, 'owner-a']) {
    const ui = screen({ fetch: w.browser({ user }), modules: MODULES, now: w.f.time() });
    const page = ui.mount('components/noah-ready-detail.tsx', { id: familyId(1) });
    await page.flush();
    const details = more(page);
    assert.ok(details, `${user ?? 'サインインしていない'}: 説明の欄がある`);
    assert.equal(details.props.open, true, `${user ?? 'サインインしていない'}: 最初から開いている`);
    assert.equal(page.find('details').find((node) => node.props.className === 'agentDetails').props.open, undefined);
  }
  assert.equal(handshakes(server), 0, '開いただけでは、相手へ送らない');
});

void test('雛形は、どの Agent の詳細でも同じく開いて始まる（呼ぶ側に、閉じて始める指定は残っていない）', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const template = readFileSync(new URL('../components/noah-detail-template.tsx', import.meta.url), 'utf8');
  assert.match(template, /id="noah-detail-more" open>/);
  for (const file of readdirSync(new URL('../components/', import.meta.url)).filter((name) => /^noah-.*\.tsx$/.test(name))) {
    const source = readFileSync(new URL(`../components/${file}`, import.meta.url), 'utf8');
    if (!source.includes('NoahDetailTemplate')) continue;
    assert.doesNotMatch(source, /<NoahDetailTemplate[^>]*\bexpanded=/s, file);
  }
});
