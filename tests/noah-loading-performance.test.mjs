import test from 'node:test';
import assert from 'node:assert/strict';
import * as botNotice from '../lib/noah-bot-notice.ts';
import * as formLib from '../lib/noah-form.ts';
import * as askView from '../lib/noah-ask-view.ts';
import { screen } from './fixtures/noah/screen.mjs';
import { createNoahProjectApi } from '../lib/noah-project-api.ts';
import { noahCardIdentity, readNoahDirectory } from '../lib/noah-agent-directory.ts';
import { isNoahRevenueProject } from '../lib/noah-revenue-directory.ts';

void test('online waits use a status, never the tiger game, for every loading surface', () => {
  const ui = screen();
  for (const variant of ['default', 'cards', 'connection', 'page']) {
    const page = ui.mount('components/noah-loading.tsx', { variant });
    assert.equal(page.find('output').length, 1);
    assert.match(page.text(), /読み込み中/);
    assert.equal(page.find('canvas').length, 0);
    assert.equal(page.find('button').length, 0);
    assert.doesNotMatch(page.text(), /スケボー|ぶつかった|スペースキー/);
  }
});

void test('browser boundary shows tiger only offline and returns to content online', async () => {
  const navigator = { onLine: false };
  let starts = 0;
  const ui = screen({ navigator, modules: {
    'next/navigation': { usePathname: () => '/noah' },
    '@/lib/noah-browser-start': { startNoahBrowser: async () => { starts++; } },
    './noah-tiger-game': { NoahTigerOffline: () => 'offline tiger' },
  } });
  const page = ui.mount('components/noah-browser-access.tsx', { children: 'Agent list' });
  assert.match(page.text(), /offline tiger/);
  assert.equal(starts, 0);
  navigator.onLine = true;
  await page.tick(0);
  assert.match(page.text(), /Agent list/);
  assert.doesNotMatch(page.text(), /offline tiger/);
  assert.equal(starts, 1);
});

void test('ready detail inherits its known public project identity without resolving the family again', async () => {
  let passed;
  const familyId = 'mcp-registry:ai.dotsy/mcp', id = 'project-' + 'a'.repeat(64);
  const ui = screen({ modules: {
    '@/lib/noah-bot-notice': botNotice, '@/lib/noah-form': formLib, '@/lib/noah-ask-view': askView,
    './noah-detail-template': { default: props => { passed = props; return null; } },
  }, fetch: async () => ({ body: { id: familyId, name: 'dotsy', listed: true, summary: 'Organize tasks', tools: 0, connect: { price: { model: "free" } }, connection: null } }) });
  const page = ui.mount('components/noah-ready-detail.tsx', { id: familyId, feedbackId: id });
  await page.flush();
  assert.equal(passed?.feedbackId, id);
  assert.equal(ui.calls.some(call => call.url.includes('/discover/project')), false);
});

void test('targeted project lookup validates inputs and sees a newly withdrawn entry', async () => {
  const id = 'project-' + 'a'.repeat(64), calls = [];
  let row = { card: { id, name: 'Example' }, families: [], observedAt: 0 };
  const api = createNoahProjectApi({ directory: async () => { throw Error('whole directory not needed'); }, find: async (...args) => { calls.push(args); return row; } });
  const url = `https://noah.test/api/noah/discover/project?id=${id}`;
  assert.equal((await api(new Request(url))).status, 200);
  row = undefined;
  assert.equal((await api(new Request(url))).status, 404);
  assert.deepEqual(calls, [[id, null], [id, null]]);
  assert.equal((await api(new Request(url + '&family=invalid'))).status, 400);
  assert.equal(calls.length, 2);
});

void test('reused project hashes never retain stale catalog rows or listing permission', async () => {
  const url = 'https://github.com/example/fresh-agent';
  let rows = [{ id: 'example/fresh-agent', name: 'Fresh', external_key: 'example/fresh-agent', summary: 'Current', repository: url, record_json: JSON.stringify({ repository: { url } }), connect_json: null }];
  const deps = { db: { prepare: () => ({ all: async () => ({ results: rows }) }) }, listed: true };
  const first = await readNoahDirectory(deps);
  assert.equal(first.length, 1);
  assert.equal(first[0].card.feedbackId, await noahCardIdentity(url, 'unused'));
  rows = [];
  assert.deepEqual(await readNoahDirectory(deps), []);
  assert.equal(await isNoahRevenueProject(first[0].card.feedbackId), false);
  assert.equal(await isNoahRevenueProject(await noahCardIdentity('https://avoado.si/noah/business-si', 'unused')), true);
});
