import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { buildFree } from '../services/noah-cloud-agents/build-free.mjs';
const key = 'test-only-' + 'k'.repeat(40), owner = 'a'.repeat(64);
const source = `
import worker, { NoahCloudBudget } from './worker.mjs';
export class TestBudget extends NoahCloudBudget {
  async fetch(request) { if(new URL(request.url).pathname === '/inspect') return Response.json(await this.ctx.storage.get('budget')); return super.fetch(request); }
}
export default {fetch(request, env, ctx) {
 if(new URL(request.url).pathname === '/inspect') return env.BUDGET.getByName('global').fetch('https://internal/inspect');
 return worker.fetch(request, {...env, AI:{ run:async (model,input)=>(await env.MODEL.fetch('https://model/',{method:'POST',body:JSON.stringify({model,input})})).json() }, JOBS:{getByName(){throw Error('must not persist a job')}}, CONNECTIONS:{getByName(){throw Error('must not persist a connection')}} },ctx);
}};`;
const bundle = await buildFree({ entryPoints: undefined, stdin: { contents: source, resolveDir: new URL('../services/noah-cloud-agents/', import.meta.url).pathname }, write: false });
void test('stateless chat uses shared quota and deduplicates requests without persisting transcript or model output', async t => {
  let calls = 0, release;
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-10-01', compatibilityFlags: ['nodejs_compat'], bindings: { NOAH_CLOUD_KEY: key, NOAH_CLOUD_MODE: 'free' }, durableObjects: { BUDGET: { className: 'TestBudget', useSQLite: true } },
    serviceBindings: { MODEL: async request => { const value = await request.json(); calls++; assert.equal(value.input.tools, undefined); if (calls === 1) await new Promise(r => { release = r; }); return Response.json({ usage: { prompt_tokens: 100, completion_tokens: 100 }, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ reply: 'private-model-answer', plan: null }) } }] }); } },
  }));
  t.after(() => mf.dispose());
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const rpc = (n, changes = {}, headers = {}) => mf.dispatchFetch('https://runtime/rpc', { method: 'POST', headers: { Authorization: 'Bearer ' + key, ...headers }, body: JSON.stringify({ action: 'chat', owner, id: id(n), candidates: [], messages: [{ role: 'user', content: 'private-user-question' }], ...changes }) });
  assert.equal((await rpc(1, {}, { Authorization: 'wrong' })).status, 401);
  assert.equal((await rpc(1, { messages: [{ role: 'system', content: 'bad' }] })).status, 400);
  const first = rpc(1);
  for (let i = 0; !release && i < 100; i++) await new Promise(r => setTimeout(r, 20));
  assert.ok(release);
  const pending = await (await mf.dispatchFetch('https://runtime/inspect')).json();
  assert.ok(pending.neurons > 0, 'quota is charged before the model can lose its response');
  assert.equal((await rpc(1)).status, 409); assert.equal(calls, 1);
  release(); assert.equal((await first).status, 200);
  assert.equal((await rpc(1)).status, 409); assert.equal(calls, 1);
  const state = await (await mf.dispatchFetch('https://runtime/inspect')).json();
  assert.equal(state.jobs, 1); assert.ok(state.neurons > 0); assert.equal(Object.keys(state.leases).length, 0);
  assert.doesNotMatch(JSON.stringify(state), /private-user-question|private-model-answer|messages|content/);
  for (let n = 2; n <= 12; n++) assert.equal((await rpc(n)).status, 200);
  assert.equal((await rpc(13)).status, 429); assert.equal(calls, 12);
});
