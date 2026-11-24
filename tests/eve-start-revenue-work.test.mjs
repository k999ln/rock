import test from 'node:test';
import assert from 'node:assert/strict';
import { screen } from './fixtures/noah/screen.mjs';
import * as ownerIntent from '../lib/owner-intent.ts';
import * as askView from '../lib/noah-ask-view.ts';
import * as myRoutes from '../lib/noah-my-routes.ts';
import { noahPageTab } from '../lib/noah-page-routes.ts';

const buttonFile = 'components/eve-start-revenue-work.tsx';
const combination = { combinationId: 'affiliate:ai-tools:blog', version: 1 };
const workId = 'fb19398d-f1b8-4e57-aa4c-21f646324033';
const action = 'この案件の収益記録を始める';
const unused = { default: () => null };
const modules = {
  '@/lib/owner-intent': ownerIntent, '@/lib/noah-ask-view': askView,
  '@/lib/noah-my-routes': myRoutes, '@/lib/noah-page-routes': { noahPageTab },
  './noah-library': unused, './noah-boards': unused, './sky-agent-library': unused,
  './sky-output-center': unused, './noah-result-data': unused, './noah-theater': unused,
};

void test('an uncertain start retries the same request for the same owner; My Agent reopens the resulting Work without rerunning it', async () => {
  const ownerScope = await ownerIntent.ownerScopeFor('owner-a');
  const created = new Map();
  const job = {
    id: workId, workId, mode: 'revenue', revision: 1, state: 'succeeded', stopRequested: false,
    createdAt: 1, updatedAt: 2, finishedAt: 2, host: null, tool: '紹介案件の収益記録', agentId: combination.combinationId,
  };
  let loseFirstReply = true;
  const ui = screen({ modules, fetch: async ({ method, url, headers, body }) => {
    if (url === '/api/noah/ask' && method === 'GET') return { body: { ownerScope, asks: created.size ? [job] : [] } };
    if (url === '/api/noah/revenue/work' && method === 'POST') {
      assert.equal(headers[ownerIntent.OWNER_SCOPE_HEADER], ownerScope);
      assert.equal(body.combinationId, combination.combinationId);
      assert.match(body.requestId, /^[\da-f-]{36}$/);
      if (!created.has(body.requestId)) created.set(body.requestId, workId);
      if (loseFirstReply) { loseFirstReply = false; throw new Error('response interrupted'); }
      return { body: { ownerScope, workId: created.get(body.requestId) } };
    }
    assert.deepEqual([method, url], ['GET', '/api/noah/ask/' + workId]);
    return { body: {
      ...job, ownerScope, result: { text: '紹介案件の成果記録', files: [] },
      revenueReceipt: { approvedYen: 8000, paidYen: null, costYen: null, shareBps: 2000, authorShareYen: null, authorShareStatus: 'pending-payment' },
    } };
  } });
  const button = ui.mount(buttonFile, combination);
  await button.click(action);
  assert.ok(button.find('p').some(node => node.props.role === 'alert'));
  assert.deepEqual(ui.visits, []);
  await button.click(action);
  assert.deepEqual(ui.visits, ['/noah/tasks/' + workId]);
  const posts = ui.calls.filter(req => req.method === 'POST');
  assert.equal(posts.length, 2);
  assert.equal(posts[0].body.requestId, posts[1].body.requestId);
  assert.equal(created.size, 1);

  const saved = ui.mount('components/noah-my.tsx', { params: { view: 'saved', tab: 'results' } });
  await saved.flush();
  const resultCards = saved.find('li').filter(node => node.props.className === 'resultCard');
  assert.equal(resultCards.length, 1);
  assert.equal(saved.nodes(resultCards[0]).find(node => node.type === 'time')?.props.dateTime, new Date(job.createdAt).toISOString());
  assert.equal(ui.calls.filter(req => req.url === '/api/noah/ask/' + workId).length, 0);
  assert.match(saved.text(resultCards[0]), /紹介案件の収益記録\s*収益記録を作成済み/);
  const link = saved.nodes(resultCards[0]).find(node => node.type === 'a');
  assert.equal(link.props.href, ui.visits[0]);
  const detail = ui.mount('components/noah-task-detail.tsx', { id: link.props.href.split('/').at(-1) });
  await detail.flush();
  assert.match(detail.text(), /この仕事の収益明細成果承認額[￥¥]8,000入金額入金記録なし/);
  assert.match(detail.text(), /収益記録を作成済み/);
  assert.doesNotMatch(detail.text(), /応答を受信|この仕事の利用明細/);
  assert.equal(detail.find('a', 'この組み合わせを開く')[0]?.props.href, '/noah/engineering/combinations/affiliate%3Aai-tools%3Ablog');
  assert.equal(ui.calls.filter(req => req.method === 'POST').length, 2);
});

void test('owner scope must be valid at preflight and match the successful Work response', async () => {
  const owner = await ownerIntent.ownerScopeFor('owner-a'), other = await ownerIntent.ownerScopeFor('owner-b');
  let verified = false;
  const ui = screen({ modules, fetch: async ({ method, headers }) => {
    if (method === 'GET') return { body: { ownerScope: verified ? owner : 'invalid' } };
    assert.equal(headers[ownerIntent.OWNER_SCOPE_HEADER], owner);
    return { body: { ownerScope: other, workId } };
  } });
  const button = ui.mount(buttonFile, combination);
  await button.click(action);
  assert.equal(ui.calls.length, 1);
  assert.deepEqual(ui.visits, []);
  verified = true;
  await button.click(action);
  assert.equal(ui.calls.filter(req => req.method === 'POST').length, 1);
  assert.ok(button.find('p').some(node => node.props.role === 'alert'));
  assert.deepEqual(ui.visits, []);
});

void test('a pending creation cannot be retried as a different owner', async () => {
  const first = await ownerIntent.ownerScopeFor('owner-a'), second = await ownerIntent.ownerScopeFor('owner-b');
  let ownerScope = first;
  const ui = screen({ modules, fetch: async ({ method }) => {
    if (method === 'GET') return { body: { ownerScope } };
    if (ownerScope === first) throw new Error('response interrupted');
    return { body: { workId, ownerScope } };
  } });
  const button = ui.mount(buttonFile, combination);
  await button.click(action);
  ownerScope = second;
  await button.click(action);
  assert.deepEqual(ui.calls.filter(call => call.method === 'POST').map(call => call.headers[ownerIntent.OWNER_SCOPE_HEADER]), [first]);
  assert.deepEqual(ui.visits, []);
});
