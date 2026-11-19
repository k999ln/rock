// Opt-in real local evaluation. No downloads, paid Provider or authority grant.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runEvePlannerInference } from '../lib/eve-planner-inference.ts';
import { eveTextDigest, EVE_PLANNER_MAX_ATTEMPTS } from '../lib/eve-plan-candidate.ts';
import { eveToolWorkStore } from '../lib/eve-tool-work.ts';
import { runtimeFixture } from '../tests/helpers/eve-runtime-fixture.mjs';
const model = process.argv[2] || 'qwen2.5:1.5b';
const outputPath = process.argv[3] || '/private/tmp/eve-si-local-planner-evidence.json';
const base = 'http://127.0.0.1:11434';
const tagsResponse = await fetch(`${base}/api/tags`, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
if (!tagsResponse.ok) throw new Error('Installed local model inventory unavailable');
const tags = await tagsResponse.json();
const installed = tags.models?.find(m => m.name === model && /^[a-f0-9]{64}$/.test(m.digest));
if (!installed) throw new Error('Model must already be installed; no download will be started');
const source = '合成原稿です。（出典: [一次資料](https://example.com/planner-live)）';
const ctx = { jobId: crypto.randomUUID(), objective: '原稿内の引用を出典欄へ整理し、リンク先を保持する', sourceSha256: await eveTextDigest(source) };
const attempts = [], cleanup = [];
const evidence = { schema: 'eve.local-planner-evaluation/2', recordedAt: new Date().toISOString(), model: { name: installed.name, digest: installed.digest, bytes: installed.size }, attempts, paidProviderCalled: false, modelDownloaded: false, gpuRented: false, syntheticInputOnly: true, productionAccepted: false };
try {
  const f = runtimeFixture({ after: fn => cleanup.push(fn) });
  f.sql.exec(readFileSync(new URL('../drizzle/0002_work_jobs.sql', import.meta.url), 'utf8'));
  const store = () => eveToolWorkStore(f.db, 'local-planner-synthetic', f.keys);
  let job = (await store().create({ jobId: ctx.jobId, threadId: crypto.randomUUID(), objective: ctx.objective, source, saveMaterial: true, plannerRequest: { modelLabel: installed.name, modelDigest: installed.digest } })).job;
  const save = async (action, extra = {}) => { job = (await store().plannerCommand({ jobId: job.id, revision: job.revision, commandId: crypto.randomUUID(), action, ...extra })).job; };
  for (let i = 0; i < EVE_PLANNER_MAX_ATTEMPTS; i++) {
    await save('planner-claim');
    // Read a newly constructed service: all limits/lease data come from SQLite.
    job = await store().get(job.id);
    const attemptId = job.eveTool.planning.attempts.at(-1).id;
    const response = await runEvePlannerInference(f.db, 'local-planner-synthetic', f.keys, { jobId: job.id, attemptId }, model, { SKY_OLLAMA_BASE_URL: base });
    job = response.eveWork;
    const inference = job.eveTool.planning.attempts.at(-1).inference;
    const accepted = job.eveTool.planning.status === 'proposed';
    attempts.push({ model, outputSha256: inference.outputSha256 ?? null, durationMs: inference.finishedAt - inference.startedAt, metering: inference.usage, candidateAccepted: accepted, inferenceOutcome: inference.state });
    if (inference.state === 'unknown') break;
    if (accepted) break;
  }
  evidence.llmCandidateAccepted = job.eveTool.planning.status === 'proposed';
  evidence.persistedPlanner = job.eveTool.planning;
  if (!evidence.llmCandidateAccepted) throw new Error('No acceptable live candidate within the durable attempt cap');
  job = await store().get(job.id); await save('planner-adopt');
  const nodeLimit = job.steps.length;
  for (let i = 0; i < nodeLimit && job.status === 'active'; i++) job = (await store().command({ jobId: job.id, revision: job.revision, commandId: crypto.randomUUID(), action: 'advance' })).job;
  if (job.status !== 'review' || !job.eveTool.verification.checks.every(c => c.passed)) throw new Error('Independent output review failed');
  job = (await store().command({ jobId: job.id, revision: job.revision, commandId: crypto.randomUUID(), action: 'complete' })).job;
  const reopened = await store().get(job.id), history = await f.history('local-planner-synthetic').get(job.eveTool.threadId);
  if (reopened.status !== 'completed' || !history.session.messages.some(m => m.text.includes(job.id) && m.text.includes('検査済み・完了'))) throw new Error('Durable work/history readback failed');
  const conversationText = history.session.messages.find(m => m.id === `tool-result-${job.id}`)?.text ?? '';
  for (const attempt of reopened.eveTool.planning.attempts) for (const metric of attempt.inference?.usage?.metrics ?? []) {
    const name = { input_tokens: '入力', output_tokens: '出力' }[metric.meter];
    if (name && metric.quantity !== null && !conversationText.includes(`${name}: ${metric.quantity} tokens`)) throw new Error('History usage projection mismatch');
  }
  if (!conversationText.includes(`計画用AI: ${model}`)) throw new Error('History model projection mismatch');
  evidence.execution = { status: reopened.status, planner: reopened.eveTool.planner, durableState: reopened.eveTool.planning.status, attemptsSaved: reopened.eveTool.planning.attempts.length, steps: reopened.steps.map(s => ({ tool: s.tool, passed: s.passed })), verification: reopened.eveTool.verification, historyReadback: true, historyUsageReadback: true, scope: 'real local LLM + real bounded Tool, synthetic isolated SQLite; not public/physical/cloud acceptance' };
  evidence.pass = true;
} catch (e) { evidence.pass = false; evidence.failure = e.message; process.exitCode = 1; }
finally {
  for (const fn of cleanup) fn();
  evidence.sourceSha256 = Object.fromEntries(['lib/eve-history.ts', 'lib/ollama-model-inventory.ts', 'lib/eve-planner-inference.ts', 'lib/eve-planner-state.ts', 'lib/eve-plan-candidate.ts', 'lib/eve-tool-work.ts', 'lib/workflow.ts', 'lib/llm-providers.ts', 'scripts/check-eve-local-planner.mjs'].map(f => [f, createHash('sha256').update(readFileSync(new URL('../' + f, import.meta.url))).digest('hex')]));
  writeFileSync(outputPath, JSON.stringify(evidence, null, 2) + '\n');
}
console.log(JSON.stringify({ pass: evidence.pass, llmCandidateAccepted: evidence.llmCandidateAccepted, attempts: attempts.length, model: installed.name, evidence: outputPath }));
