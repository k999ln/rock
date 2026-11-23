import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { buildFree } from '../services/noah-cloud-agents/build-free.mjs';
import {
  NOAH_CLOUD_PROFILES, NOAH_FREE_CLOUD_LIMITS, noahCloudNeurons, noahCloudReplyUsage, noahCloudDailyNeurons, noahCloudUsageOf, noahCloudListYen,
} from '../lib/noah-cloud-contract.ts';
import { createNoahCloudApi, createNoahCloudResultApi } from '../lib/noah-cloud-api.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { fixture } from './fixtures/noah/intake.mjs';

// 2026-11-24 本人「クラウドのシステム作って」「100人とかいったら黒字化するよね？」「cloudflareでいいから最初は」、
// Workers Paid はまだ申し込まない。無料のクラウドを、件数（全体 1 日 10 件・1 人 3 件）ではなく、
// Workers AI の無料の割当（1 日 10,000 neuron）の中で、使った量で数える。1 件ごとに使った量を記録して、Work に残す。

const key = 'test-only-' + 'k'.repeat(40), project = 'project-' + 'b'.repeat(64);
const ownerA = 'a'.repeat(64), ownerB = 'c'.repeat(64);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

await test('neuron の数え方: gpt-oss-20b の料金表のとおり、切り上げ。usage が無い時は上限で数える。環境変数は下げるだけ', () => {
  assert.equal(noahCloudNeurons(1_000_000, 0), 18182);
  assert.equal(noahCloudNeurons(0, 1_000_000), 27273);
  assert.equal(noahCloudNeurons(3000, 200), 61);
  assert.equal(noahCloudNeurons(-5, Number.NaN), 0);
  assert.deepEqual(noahCloudReplyUsage({ usage: { prompt_tokens: 3000, completion_tokens: 200 } }, 99999, 1024), { inputTokens: 3000, outputTokens: 200, neurons: 61 });
  assert.deepEqual(noahCloudReplyUsage({ choices: [] }, 4000, 1024), { inputTokens: 4000, outputTokens: 1024, neurons: noahCloudNeurons(4000, 1024) }, 'usage が無ければ少なく数えない');
  assert.deepEqual(noahCloudReplyUsage({ usage: { prompt_tokens: -1, completion_tokens: 1.5 } }, 10, 20), { inputTokens: 10, outputTokens: 20, neurons: noahCloudNeurons(10, 20) });
  assert.equal(noahCloudDailyNeurons(undefined), NOAH_FREE_CLOUD_LIMITS.dailyNeurons);
  assert.equal(noahCloudDailyNeurons('1500'), 1500);
  assert.equal(noahCloudDailyNeurons('999999'), NOAH_FREE_CLOUD_LIMITS.dailyNeurons, '上げる事はできない');
  assert.equal(noahCloudDailyNeurons('-3'), NOAH_FREE_CLOUD_LIMITS.dailyNeurons);
  assert.ok(NOAH_FREE_CLOUD_LIMITS.dailyNeurons < 10000, '無料の割当（1 日 10,000）より下');
  assert.ok(NOAH_FREE_CLOUD_LIMITS.ownerDailyNeurons >= 2 * NOAH_FREE_CLOUD_LIMITS.jobNeurons, '1 人が少なくとも 1 件は頼める');
  assert.deepEqual(noahCloudUsageOf({ inputTokens: 1, outputTokens: 2, neurons: 3 }), { inputTokens: 1, outputTokens: 2, neurons: 3 });
  assert.equal(noahCloudUsageOf({ inputTokens: 1, outputTokens: 2 }), null);
  assert.equal(noahCloudUsageOf({ inputTokens: '1', outputTokens: 2, neurons: 3 }), null);
  assert.equal(noahCloudListYen({ inputTokens: 0, outputTokens: 0, neurons: 1000 }), 1.7);
});

const source = `
import worker, { NoahFreeCloudJob, NoahCloudConnection, NoahCloudBudget } from './free-worker.mjs';
export { NoahCloudConnection, NoahCloudBudget };
export class TestJob extends NoahFreeCloudJob {
  constructor(ctx, env) { super(ctx, {...env, AI: {run: async (model,input) => (await env.MODEL.fetch('https://model/', {method:'POST',body:JSON.stringify({model,input})})).json()}}); }
}
export default worker;`;
const bundle = await buildFree({ entryPoints: undefined, stdin: { contents: source, resolveDir: new URL('../services/noah-cloud-agents/', import.meta.url).pathname, sourcefile: 'neurons-entry.mjs' }, write: false });

/** モデルは、道具を 1 回呼ばせてから終わる。usage は呼ぶたびに usage(n) を返す。 */
async function world(t, usage, bindings = {}) {
  const received = [], modelInputs = [];
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-10-01', compatibilityFlags: ['nodejs_compat'],
    bindings: { NOAH_CLOUD_KEY: key, NOAH_CLOUD_MODE: 'free', ...bindings },
    durableObjects: { JOBS: { className: 'TestJob', useSQLite: true }, CONNECTIONS: { className: 'NoahCloudConnection', useSQLite: true }, BUDGET: { className: 'NoahCloudBudget', useSQLite: true } },
    serviceBindings: { MODEL: async req => {
      const b = await req.json(); modelInputs.push(b);
      const n = modelInputs.length;
      const reply = b.input.messages.at(-1).role === 'tool'
        ? { choices: [{ finish_reason: 'stop', message: { content: '保存しました。' } }] }
        : { choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{ id: `call${n}`, type: 'function', function: { name: 'create_entities', arguments: JSON.stringify({ entities: [{ name: `n${n}`, entityType: 'test', observations: ['saved'] }] }) } }] } }] };
      const u = usage(n);
      return Response.json(u ? { ...reply, usage: u } : reply);
    } },
    outboundService: async req => { received.push(await req.json()); return Response.json({ saved: true }); },
  }));
  t.after(() => mf.dispose());
  const rpc = (owner, body) => mf.dispatchFetch('https://runtime/rpc', { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: JSON.stringify({ owner, project, profile: 'memory', distribution: NOAH_CLOUD_PROFILES.memory.sha256, ...body }) });
  const wait = async predicate => { const deadline = Date.now() + 20000; while (!predicate()) { if (Date.now() > deadline) throw Error('timed out'); await new Promise(r => setTimeout(r, 30)); } };
  const connect = async (owner, n) => {
    await rpc(owner, { action: 'connect', id: id(n) });
    const deadline = Date.now() + 20000;
    for (;;) {
      const s = await (await rpc(owner, { action: 'status' })).json();
      if (s.connection?.state === 'connected') return;
      if (s.connection?.state === 'failed') throw Error(s.connection.error);
      if (Date.now() > deadline) throw Error('probe timeout');
      await new Promise(r => setTimeout(r, 30));
    }
  };
  const start = (owner, connection, job) => rpc(owner, { action: 'start', connectionId: id(connection), jobId: id(job), prompt: 'Save a note', receipt: 'r'.repeat(40) });
  return { rpc, wait, connect, start, received, modelInputs };
}

await test('1 件ごとに、使ったトークンと neuron を記録して、結果と一緒に Noah へ送る', async t => {
  const w = await world(t, () => ({ prompt_tokens: 3000, completion_tokens: 200 }));
  await w.connect(ownerA, 1);
  assert.equal((await w.start(ownerA, 1, 2)).status, 202);
  await w.wait(() => w.received.length === 1);
  const job = w.received[0].job;
  assert.equal(job.state, 'returned');
  assert.equal(job.calls, 2);
  assert.deepEqual(job.usage, { inputTokens: 6000, outputTokens: 400, neurons: 122 });
});

await test('全体の 1 日の neuron を使い切る時は、新しい依頼を、戻る時刻つきで断る', async t => {
  const w = await world(t, () => ({ prompt_tokens: 20000, completion_tokens: 0 }), { NOAH_CLOUD_DAILY_NEURONS: '1500' });
  await w.connect(ownerA, 1);
  assert.equal((await w.start(ownerA, 1, 2)).status, 202, '0 + 取り置き 1,200 ≤ 1,500');
  await w.wait(() => w.received.length === 1);
  assert.deepEqual(w.received[0].job.usage, { inputTokens: 40000, outputTokens: 0, neurons: 728 });
  const refused = await w.start(ownerA, 1, 3);
  assert.equal(refused.status, 429, '728 + 1,200 > 1,500');
  const body = await refused.json();
  assert.match(body.error, /今日の無料のクラウドの枠を使い切りました/);
  assert.match(body.error, /日本時間の朝 9 時/);
  assert.equal(w.modelInputs.length, 2, '断った依頼ではモデルを呼ばない');
});

await test('1 人の 1 日の取り分を超える時は、その人だけ断り、ほかの人は頼める', async t => {
  const w = await world(t, () => ({ prompt_tokens: 30000, completion_tokens: 0 }));
  await w.connect(ownerA, 1);
  assert.equal((await w.start(ownerA, 1, 2)).status, 202);
  await w.wait(() => w.received.length === 1);
  assert.equal(w.received[0].job.usage.neurons, 2 * 546);
  assert.equal((await w.start(ownerA, 1, 3)).status, 202, '1,092 + 取り置き 1,200 ≤ 2,400');
  await w.wait(() => w.received.length === 2);
  const refused = await w.start(ownerA, 1, 6);
  assert.equal(refused.status, 429, '2,184 + 1,200 > 2,400');
  assert.match((await refused.json()).error, /今日のあなたの無料のクラウドの枠を使い切りました/);
  await w.connect(ownerB, 4);
  assert.equal((await w.start(ownerB, 4, 5)).status, 202, 'ほかの人は、全体の枠が残っていれば頼める');
});

await test('1 件の上限（取り置き）を超えるモデルの呼び出しは、呼ぶ前に止めて、失敗として返す', async t => {
  const w = await world(t, n => (n === 1 ? { prompt_tokens: 62000, completion_tokens: 1000 } : { prompt_tokens: 10, completion_tokens: 10 }));
  await w.connect(ownerA, 1);
  assert.equal((await w.start(ownerA, 1, 2)).status, 202);
  await w.wait(() => w.received.length === 1);
  const job = w.received[0].job;
  assert.equal(job.state, 'failed');
  assert.match(job.error, /無料のクラウドの 1 件の上限を超えます/);
  assert.equal(w.modelInputs.length, 1, '2 回目は呼ばない');
  assert.equal(job.usage.neurons, noahCloudNeurons(62000, 1000));
});

await test('Noah は、届いた使った量を Work に残して、画面に返す。おかしい値は捨てて、結果は残す', async t => {
  const f = fixture(t);
  const owner = 'owner-a', secret = crypto.randomUUID() + crypto.randomUUID(), origin = 'https://noah.test';
  const hermes = NOAH_CLOUD_PROFILES.hermes, entry = { card: { id: project, feedbackId: project, href: 'https://github.com/NousResearch/hermes-agent', name: 'Hermes', sources: [] }, families: [] };
  let receipt;
  const api = createNoahCloudApi({ db: f.db, now: f.time, receiptKey: secret, authenticate: async () => owner, directory: async () => [entry], authorize: async () => {}, runtime: async input => {
    if (input.action === 'start') { receipt = input.receipt; return Response.json({ id: input.jobId, profile: input.profile, version: hermes.version, distribution: hermes.sha256, mode: 'run', state: 'running', calls: 0 }); }
    return Response.json({ connection: null });
  } });
  const request = async body => api(new Request(origin + '/api/noah/cloud-agents', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': await ownerScopeFor(owner) }, body: JSON.stringify({ projectId: project, ...body }) }));
  const deliver = job => createNoahCloudResultApi({ db: f.db, receiptKey: secret, now: f.time })(new Request(origin + '/api/noah/cloud-agents/result', { method: 'POST', headers: { Authorization: `Bearer ${secret}` }, body: JSON.stringify({ ticket: receipt, job }) }));
  const saved = jobId => JSON.parse(f.sql.prepare('SELECT payload FROM work_jobs WHERE id=?').get(jobId).payload);
  const base = { profile: 'hermes', version: hermes.version, distribution: hermes.sha256, mode: 'run', state: 'returned', calls: 2, result: { text: '計画です', files: [], exitCode: 0 } };

  await request({ action: 'start', jobId: id(1), connectionId: id(9), prompt: 'plan' });
  assert.equal((await deliver({ ...base, id: id(1), usage: { inputTokens: 6000, outputTokens: 400, neurons: 122 } })).status, 200);
  assert.deepEqual(saved(id(1)).noahRemote.cloud.usage, { inputTokens: 6000, outputTokens: 400, neurons: 122 });

  await request({ action: 'start', jobId: id(2), connectionId: id(9), prompt: 'plan again' });
  assert.equal((await deliver({ ...base, id: id(2), usage: { inputTokens: -1, outputTokens: 1, neurons: 1 } })).status, 200);
  assert.equal(saved(id(2)).noahRemote.cloud.usage, undefined, 'おかしい値は残さない');
  assert.equal(saved(id(2)).noahRemote.result.text, '計画です', '結果は残す');

  await request({ action: 'start', jobId: id(3), connectionId: id(9), prompt: 'fail' });
  assert.equal((await deliver({ ...base, id: id(3), state: 'failed', error: '上限', result: undefined, usage: { inputTokens: 100, outputTokens: 0, neurons: 2 } })).status, 200);
  assert.deepEqual(saved(id(3)).noahRemote.cloud.usage, { inputTokens: 100, outputTokens: 0, neurons: 2 }, '失敗した依頼でも、使った分は残す');

  const status = await (await api(new Request(origin + `/api/noah/cloud-agents?projectId=${project}`, { headers: { Origin: origin } }))).json();
  const shown = status.jobs.find(job => job.id === id(1));
  assert.deepEqual(shown.usage, { inputTokens: 6000, outputTokens: 400, neurons: 122 });
});
