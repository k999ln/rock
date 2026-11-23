import test from 'node:test';
import assert from 'node:assert/strict';
import { noahCardIdentity } from '../lib/noah-agent-directory.ts';
import { createNoahDirectoryApi } from '../lib/noah-agent-directory-api.ts';
import { noahFirstJobs } from '../lib/noah-first-jobs.ts';
import { parseNoahFlags } from '../lib/noah-flags.ts';
import { createNoahProjectApi, withNoahCloudAvailability } from '../lib/noah-project-api.ts';
import { noahRevenueDirectory } from '../lib/noah-revenue-directory.ts';
import { SITE_DESTINATIONS } from '../toolkits/noah-affiliate-agents/site-acquisition.mjs';
import { SITE_ADAPTERS } from '../toolkits/noah-affiliate-agents/site-diagnostics.mjs';

const now = Date.now();
const siteOrigin = 'https://noah-revenue-agents.mr-kirin999.workers.dev';
const diagnostics = await noahRevenueDirectory(async () => Response.json({
  items: Object.keys(SITE_DESTINATIONS).map(id => ({
    id: `noah-${id}`, origin: 'first_party', checkedAt: new Date(now).toISOString(),
    url: `${siteOrigin}/agent/${id}`, mcp: `${siteOrigin}/consult/site/${id}/mcp`,
  })),
}), now);
const collected = async (url, name) => {
  const id = await noahCardIdentity(url, '');
  return { families: [], observedAt: now, card: { id, feedbackId: id, href: url, name, provider: 'Docker', summary: '' } };
};
const memory = await collected('https://hub.docker.com/r/mcp/memory', 'Memory');
const impostor = await collected('https://hub.docker.com/r/other/memory', 'Memory');
const deployed = rows => withNoahCloudAvailability(rows, true, ['memory']);
const enabled = rows => rows.filter(row => row.href).map(row => row.id);
const get = (api, path) => api(new Request(new URL(path, 'https://avoado.si')));

void test('初回の仕事は正式な診断2件と有効なMemoryに同一サイト内で案内する', async () => {
  const choices = await noahFirstJobs([...diagnostics, ...deployed([impostor, memory])], true, now);
  assert.deepEqual(enabled(choices), ['wordpress-maintenance', 'ec-production', 'memory']);
  for (const choice of choices) {
    const url = new URL(choice.href, 'https://avoado.si');
    assert.equal(url.pathname, '/noah/discover/agent');
    assert.equal(url.searchParams.get('firstJob'), choice.id);
    if (choice.id === 'memory') {
      assert.equal(url.searchParams.get('id'), memory.card.id);
      assert.equal(choice.operation, undefined);
    } else {
      assert.equal(url.searchParams.get('id'), new URL(SITE_DESTINATIONS[choice.id]).searchParams.get('id'));
      assert.equal(choice.operation, SITE_ADAPTERS[choice.id].tool);
    }
  }
  assert.deepEqual(enabled(await noahFirstJobs(deployed([impostor]), true, now)), []);
});

void test('非公開・期限切れ・停止・同じIDで上書きされた候補からは仕事を始められない', async () => {
  assert.deepEqual(enabled(await noahFirstJobs(diagnostics, false, now)), []);
  assert.deepEqual(enabled(await noahFirstJobs(diagnostics, true, now + 20 * 60000 + 1)), []);
  assert.deepEqual(enabled(await noahFirstJobs(withNoahCloudAvailability([memory], false), true, now)), []);
  const shadow = { ...diagnostics[0], firstParty: undefined };
  assert.deepEqual(enabled(await noahFirstJobs([shadow, ...diagnostics], true, now)), ['ec-production']);
});

void test('初回データは最初の頁でだけ取得し、一覧の順位や件数・検索結果に依存しない', async () => {
  let lookups = 0;
  const entries = [...diagnostics, ...deployed([memory])];
  const api = createNoahDirectoryApi({
    authenticate: async () => { throw Error('UNAUTHORIZED'); },
    db: {}, flags: parseNoahFlags({ NOAH_INTAKE_PUBLIC: 'true', NOAH_ASK_FORM: 'true' }),
    now: () => now, directory: async () => { lookups++; return entries; },
  });
  const request = '/api/noah/discover?source=discovered&q=nomatch';
  const resp = await get(api, request + '&firstJobs=1');
  assert.equal(resp.status, 200);
  const data = await resp.json();
  assert.equal(lookups, 1);
  assert.equal(data.total, 0);
  assert.equal(enabled(data.firstJobs).length, 3);
  assert.equal((await (await get(api, request)).json()).firstJobs, undefined);
  assert.equal((await (await get(api, request + '&firstJobs=1&cursor=20')).json()).firstJobs, undefined);
});

void test('詳細の仕事を再照合し、他用途のID・掲載終了・接続停止は実行へ案内しない', async () => {
  const rows = [...diagnostics, ...deployed([memory])];
  let live = rows;
  const api = createNoahProjectApi({ directory: async () => live, publicAsk: true, cloudEnabled: true, cloudProfiles: ['memory'] });
  const choices = await noahFirstJobs(rows, true, now);
  for (const choice of choices) {
    const path = choice.href.replace('/noah/discover/agent?', '/api/noah/discover/project?');
    const detail = await (await get(api, path)).json();
    assert.deepEqual(detail.firstJob, choice);
    assert.equal(detail.connection.kind, choice.id === 'memory' ? 'cloud' : 'setup');
    const other = path.replace(/firstJob=[^&]+/, 'firstJob=wrong');
    assert.equal((await (await get(api, other)).json()).firstJob, undefined);
  }
  const wordpressPath = '/api/noah/discover/project?id=' + diagnostics[0].card.id + '&firstJob=wordpress-maintenance';
  const paused = createNoahProjectApi({ directory: async () => rows, publicAsk: false });
  assert.equal((await (await get(paused, wordpressPath)).json()).firstJob, undefined);
  const memoryPath = '/api/noah/discover/project?id=' + memory.card.id + '&firstJob=memory';
  assert.equal((await (await get(paused, memoryPath)).json()).firstJob, undefined);
  live = [];
  assert.equal((await get(api, wordpressPath)).status, 404);
});
