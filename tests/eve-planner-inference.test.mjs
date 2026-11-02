import test from 'node:test';
import assert from 'node:assert/strict';
import { eveAgentFixture } from './helpers/eve-agent-fixture.mjs';
import { eveToolWorkStore } from '../lib/eve-tool-work.ts';
import { runEvePlannerInference } from '../lib/eve-planner-inference.ts';
import { evePlannerPrompt } from '../lib/eve-plan-candidate.ts';
import { LlmProviderError } from '../lib/llm-providers.ts';
import { observeLlmUsage } from '../lib/sky-usage-observation.ts';
const runtime = { SKY_OLLAMA_BASE_URL: 'http://127.0.0.1:11434' };
async function setup(t) {
  const f = eveAgentFixture(t), tools = () => eveToolWorkStore(f.db, 'alice', f.keys);
  let job = (await tools().create({ jobId: crypto.randomUUID(), threadId: crypto.randomUUID(), objective: '引用を整理', source: '本文 [資料](https://example.com/test)', saveMaterial: true, plannerRequest: { modelLabel: 'installed-fixture', modelDigest: 'a'.repeat(64) } })).job;
  job = (await tools().plannerCommand({ jobId: job.id, revision: job.revision, commandId: crypto.randomUUID(), action: 'planner-claim' })).job;
  const input = { jobId: job.id, attemptId: job.eveTool.planning.attempts[0].id };
  const result = () => ({ provider: 'ollama', model: 'installed-fixture', text: evePlannerPrompt({ jobId: job.id, objective: job.plan.objective, sourceSha256: job.eveTool.sourceSha256 }).prompt.split('\n').slice(1).join('\n'), metering: { ...observeLlmUsage('ollama', { model: 'installed-fixture', prompt_eval_count: 21, eval_count: 34 }), resourceId: 'installed-fixture' }, durationMs: 1 });
  const run = (generate, owner = 'alice', config = runtime, inspect = async () => 'a'.repeat(64)) => runEvePlannerInference(f.db, owner, f.keys, input, 'installed-fixture', config, generate, inspect);
  return { ...f, tools, job, input, result, run };
}
void test('server saves provider usage and validated candidate before browser receipt; reopening never resends the same attempt', async t => {
  const f = await setup(t); let calls = 0;
  const response = await f.run(async request => { calls++; assert.equal(request.maxOutputTokens, 600); assert.equal(request.ollamaLocalTimeoutMs,40000); assert.ok(!request.prompt.includes('本文')); assert.equal(request.ollamaSchema.additionalProperties,false); assert.equal(request.ollamaSchema.properties.jobId.const,f.job.id); assert.equal(request.ollamaSchema.properties.objective.const,f.job.plan.objective); assert.equal(request.ollamaSchema.properties.sourceSha256.const,f.job.eveTool.sourceSha256); assert.ok(JSON.stringify(request.ollamaSchema).length<16000); return f.result(); });
  assert.equal(response.eveWork.eveTool.planning.status, 'proposed');
  const reopened = await f.tools().get(f.job.id), usage = reopened.eveTool.planning.attempts[0].inference.usage;
  assert.equal(usage.metrics.find(m => m.meter === 'output_tokens').quantity, 34);
  assert.equal(usage.amountMinor, null); assert.equal(usage.invoiceVerified, false);
  assert.equal(usage.developerPayment.status, 'contract_not_bound');
  assert.equal(response.historySaved, true);
  const conversation = await (await import('../lib/eve-history.ts')).eveHistoryStore(f.db, 'alice', f.keys, true).get(f.job.eveTool.threadId);
  assert.match(conversation.session.messages[1].text, /計画候補を検証済み・本人の採用待ち/);
  assert.match(conversation.session.messages[1].text, /入力: 21 tokens/);
  assert.match(conversation.session.messages[1].text, /出力: 34 tokens/);
  assert.ok(!conversation.session.messages[1].text.includes('"nodes"'));
  await assert.rejects(f.run(async () => { calls++; return f.result(); }), /開始済み/);
  assert.equal(calls, 1);
});
void test('concurrent requests claim one inference only; public candidate substitution while sending is rejected', async t => {
  const f = await setup(t); let release, ready;
  const barrier = new Promise(resolve => { release = resolve; }), entered = new Promise(resolve => { ready = resolve; });
  let calls = 0;
  const first = f.run(async () => { calls++; ready(); await barrier; return f.result(); });
  await entered;
  await assert.rejects(f.run(async () => { calls++; return f.result(); }), /開始済み/);
  const current = await f.tools().get(f.job.id);
  await assert.rejects(f.tools().plannerCommand({ jobId: current.id, revision: current.revision, commandId: crypto.randomUUID(), action: 'planner-submit', attemptId: f.input.attemptId, output: f.result().text }), /server/);
  release(); await first; assert.equal(calls, 1);
});
void test('late usage survives owner cancellation without reviving or adopting the plan', async t => {
  const f = await setup(t);
  const r = await f.run(async () => { const current = await f.tools().get(f.job.id); await f.tools().command({ jobId: current.id, revision: current.revision, commandId: crypto.randomUUID(), action: 'cancel' }); return f.result(); });
  assert.equal(r.eveWork.status, 'cancelled'); assert.equal(r.eveWork.eveTool.planning.candidate, undefined);
  assert.equal(r.eveWork.eveTool.planning.attempts[0].inference.state, 'reported');
});
void test('transport uncertainty records unknown usage, never zero, and cannot be silently retried', async t => {
  const f = await setup(t), r = await f.run(async () => { throw new Error('synthetic response lost'); });
  const attempt = r.eveWork.eveTool.planning.attempts[0];
  assert.equal(attempt.state, 'unknown'); assert.equal(attempt.reason, 'inference_unconfirmed'); assert.equal(attempt.inference.errorCode, 'provider_failed'); assert.equal(attempt.inference.usage, null);
  assert.equal(r.inferenceOutcome, 'unknown');
  await assert.rejects(f.run(async () => f.result()), /開始済み/);
});
void test('invalid and oversized candidates retain provider usage without retaining arbitrary output', async t => {
  for (const text of ['untrusted output', 'x'.repeat(17000)]) {
    const f = await setup(t), r = await f.run(async () => ({ ...f.result(), text }));
    const state = r.eveWork.eveTool.planning;
    assert.equal(state.attempts[0].inference.usage.metrics[0].quantity, 21);
    assert.equal(state.attempts[0].state, 'invalid'); assert.equal(state.candidate, undefined);
    assert.ok(!JSON.stringify(state).includes('untrusted output'));
  }
});
void test('owner mismatch, remote endpoint and model mismatch deny before inference', async t => {
  const f = await setup(t); let calls = 0;
  const generate = async () => { calls++; return f.result(); };
  await assert.rejects(f.run(generate, 'bob'), /見つかりません/);
  await assert.rejects(f.run(generate, 'alice', { SKY_OLLAMA_BASE_URL: 'https://remote.example' }), /端末内/);
  await assert.rejects(runEvePlannerInference(f.db, 'alice', f.keys, f.input, 'wrong-model', runtime, generate), /一致/);
  assert.equal(calls, 0);
});
void test('changed or unavailable model before sending saves a refusal without inference or silent fallback', async t => {
  for (const digest of ['b'.repeat(64), null]) {
    const f = await setup(t); let calls = 0;
    const r = await f.run(async () => { calls++; return f.result(); }, 'alice', runtime, async () => digest);
    const a = r.eveWork.eveTool.planning.attempts[0];
    assert.equal(calls, 0); assert.equal(a.inference.state, 'not_sent'); assert.equal(a.inference.usage, null);
    assert.equal(a.state, 'invalid'); assert.equal(a.reason, digest ? 'model_changed' : 'model_unavailable');
    assert.equal(r.plannerBlocked, a.reason); assert.equal(r.eveWork.eveTool.planning.candidate, undefined);
    assert.equal(r.historySaved, true);
    const conversation = await (await import('../lib/eve-history.ts')).eveHistoryStore(f.db, 'alice', f.keys, true).get(f.job.eveTool.threadId);
    assert.match(conversation.session.messages[1].text, digest ? /AIの版変更・候補採用停止/ : /AIの版を確認できません・要確認/);
    assert.match(conversation.session.messages[1].text, /AIへ未送信/);
    await assert.rejects(f.run(async () => { calls++; return f.result(); }), /開始済み/);
    assert.equal(calls, 0);
  }
});
void test('post-response model drift, missing identity or inventory failure retains usage but never proposes a plan', async t => {
  for (const mode of ['changed', 'missing', 'error', 'response-model']) {
    const f = await setup(t); let checks = 0, calls = 0;
    const r = await f.run(async () => { calls++; const v = f.result(); if (mode === 'response-model') v.metering.reportedResourceId = 'other-model'; return v; }, 'alice', runtime, async () => {
      if (++checks === 1) return 'a'.repeat(64);
      if (mode === 'error') throw new Error('private transport detail must not be stored');
      return mode === 'missing' ? null : (mode === 'changed' ? 'b' : 'a').repeat(64);
    });
    const a = r.eveWork.eveTool.planning.attempts[0];
    assert.equal(calls, 1); assert.equal(a.state, 'invalid'); assert.equal(a.inference.state, 'reported');
    assert.equal(a.inference.usage.metrics[0].quantity, 21);
    assert.equal(r.eveWork.eveTool.planning.candidate, undefined); assert.ok(r.plannerBlocked);
    assert.ok(!JSON.stringify(a).includes('private transport'));
    await assert.rejects(f.tools().plannerCommand({ jobId: f.job.id, revision: r.eveWork.revision, commandId: crypto.randomUUID(), action: 'planner-adopt' }), /検証済み/);
  }
});
void test('owner stop while checking model identity wins the send CAS before inference', async t => {
  const f = await setup(t); let calls = 0;
  await assert.rejects(f.run(async () => { calls++; return f.result(); }, 'alice', runtime, async () => {
    const job = await f.tools().get(f.job.id);
    await f.tools().command({ jobId: job.id, revision: job.revision, commandId: crypto.randomUUID(), action: 'cancel' });
    return 'a'.repeat(64);
  }), /更新されました/);
  assert.equal(calls, 0); assert.equal((await f.tools().get(f.job.id)).status, 'cancelled');
});

for (const stopped of [false,true]) void test(`empty provider response retains reported usage without adopting a plan, stopped=${stopped}`,async t=>{
 const f=await setup(t);let calls=0;
 const response=await f.run(async()=>{calls++;if(stopped){const current=await f.tools().get(f.job.id);await f.tools().command({jobId:current.id,revision:current.revision,commandId:crypto.randomUUID(),action:'cancel'});}const error=new LlmProviderError('EMPTY_RESPONSE');error.metering={...observeLlmUsage('ollama',{model:'installed-fixture',prompt_eval_count:17,eval_count:8}),resourceId:'installed-fixture'};throw error;});
 const job=response.eveWork,a=job.eveTool.planning.attempts[0];assert.equal(calls,1);assert.equal(a.inference.state,'reported');assert.equal(a.inference.errorCode,'provider_failed');assert.equal(a.inference.usage.metrics.find(m=>m.meter==='input_tokens').quantity,17);assert.equal(a.inference.usage.metrics.find(m=>m.meter==='output_tokens').quantity,8);assert.equal(a.inference.usage.amountMinor,null);assert.equal(a.inference.usage.invoiceVerified,false);assert.equal(job.eveTool.planning.candidate,undefined);assert.deepEqual(job.composition.artifacts,{});assert.equal(job.status,stopped?'cancelled':'active');
 const reopened=await f.tools().get(job.id);assert.deepEqual(reopened.eveTool.planning.attempts[0],a);await assert.rejects(f.run(async()=>{calls++;return f.result();}),/開始済み/);assert.equal(calls,1);
 const h=await(await import('../lib/eve-history.ts')).eveHistoryStore(f.db,'alice',f.keys,true).get(job.eveTool.threadId);assert.match(h.session.messages[1].text,/入力: 17 tokens/);assert.match(h.session.messages[1].text,/出力: 8 tokens/);
});
