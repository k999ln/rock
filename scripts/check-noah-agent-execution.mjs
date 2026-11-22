// Explicit opt-in integration test. Uses synthetic input and local models only.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { RECIPES, limitsFor } from './noah-execution-recipes.mjs';

export async function checkNoahExecution(base = 'http://127.0.0.1:3107', { agentIds = Object.keys(RECIPES).filter(id => !RECIPES[id].provider), checkpoint = async () => {} } = {}) {
  assert.ok(agentIds.every(id => !RECIPES[id]?.provider), 'This test uses local models only; provider tests need explicit consent');
  assert.ok(agentIds.length && new Set(agentIds).size === agentIds.length && agentIds.every(id => Object.hasOwn(RECIPES, id)), 'Select unique reviewed Agent IDs');
  const url = new URL(base);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.origin !== base) throw new Error('Loopback Noah only');
  const owner = await (await fetch(base + '/api/noah/catalog/owner')).json();
  assert.equal(owner.localHostOwner, true);
  const proof = { at: new Date().toISOString(), selected: agentIds, status: 'running', agents: [], checks: {} };
  await checkpoint(proof);
  async function call(route, body, override = {}) {
    for (let attempt = 0; ; attempt++) {
      const r = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: base, 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': owner.ownerScope, ...override }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) });
      const data = await r.json();
      // A busy development host can briefly reject a read during preparation.
      // Record it and retry only GET/503, never an ambiguous mutation or denial.
      if (body === undefined && r.status === 503 && attempt < 3) {
        (proof.readRecoveries ||= []).push({ route, status: 503, attempt: attempt + 1, at: new Date().toISOString() });
        await checkpoint(proof); await new Promise(resolve => setTimeout(resolve, 1000)); continue;
      }
      return { status: r.status, data };
    }
  }
  async function ready(id) {
    const connected = await call(`/__noah/installations/${id}/connect`, {}); assert.ok([200, 202].includes(connected.status), JSON.stringify(connected.data));
    const deadline = Date.now() + 900000;
    while (Date.now() < deadline) {
      const { status, data } = await call(`/__noah/installations/${id}`), r = data.installation;
      assert.equal(status, 200, `Installation status ${status}: ${data.error || 'unavailable'}`);
      assert.ok(r, 'Installation response is missing');
      if (!r.busy) { assert.equal(r.state, 'connected', r.message); assert.ok(r.execution); return r; }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Preparation timeout');
  }
  for (const agentId of agentIds) {
    const recipe = RECIPES[agentId];
    proof.currentAgent = agentId; delete proof.currentWorkId; await checkpoint(proof);
    await call(`/__noah/installations/${agentId}/disconnect`, {});
    const installation = await ready(agentId);
    const id = randomUUID(), token = `NOAH_${recipe.key.toUpperCase()}_OK`;
    proof.currentWorkId = id; await checkpoint(proof);
    const prompt = recipe.key === 'data-analysis'
      ? 'テストデータの売上は1200と800です。Pythonで合計を計算してprintしてください。図や新たなデータは追加せず、最終レポートは計算した合計だけを日本語で書いてください。'
      : `Create result.txt containing exactly ${token} followed by a newline. Finish after saving the file.`;
    const body = { id, agentId, prompt };
    const responses = await Promise.all([call('/__noah/executions', body), call('/__noah/executions', body)]);
    for (const r of responses) { assert.equal(r.status, 202, JSON.stringify(r.data)); assert.equal(r.data.job.id, id); }
    const deadline = Date.now() + (limitsFor(recipe).seconds + 30) * 1000; let job;
    while (Date.now() < deadline) {
      const observed = await call(`/__noah/executions/${id}`);
      assert.equal(observed.status, 200, `Work status ${observed.status}: ${observed.data.error || 'unavailable'}`);
      job = observed.data.job;
      assert.ok(job?.noahExecution, 'Work response is missing its execution');
      assert.equal(job.id, id); assert.equal(job.noahExecution.agentId, agentId);
      if (!['queued', 'running'].includes(job.noahExecution.state)) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    assert.equal(job.noahExecution.state, 'returned', JSON.stringify(job.noahExecution));
    assert.equal(job.noahExecution.result.exitCode, 0, job.noahExecution.result.text.slice(-2000));
    let file;
    if (recipe.key === 'data-analysis') {
      const evidence = job.noahExecution.result.files.find(f => f.name === 'analysis-evidence.json');
      assert.ok(evidence, 'Actual Python execution evidence is required');
      const steps = JSON.parse(Buffer.from(evidence.base64, 'base64').toString()).steps;
      assert.ok(steps.some(s => s.result?.success && /\b2000\b/.test(s.result.output) && s.result.output.length < 160), 'Python must calculate the synthetic total');
      file = job.noahExecution.result.files.find(f => f.name.endsWith('/最终分析报告.md'));
      assert.ok(file, 'Official report output is required');
      const report = Buffer.from(file.base64, 'base64').toString();
      assert.ok(report.includes('2000') && report.length < 120, 'Report must agree with observed total and not invent unrelated data');
    } else {
      file = job.noahExecution.result.files.find(f => f.name === 'result.txt');
      assert.ok(file, job.noahExecution.result.text.slice(-2000));
      assert.equal(Buffer.from(file.base64, 'base64').toString(), token + '\n');
    }
    assert.ok(job.noahExecution.calls > 0 && job.noahExecution.calls <= 8);
    assert.equal(job.status, 'review'); assert.equal(job.steps[0].passed, false);
    assert.equal((await call('/__noah/executions', { ...body, prompt: 'changed' })).status, 409);
    assert.equal((await call('/__noah/executions', body)).data.job.id, id);
    proof.agents.push({ agentId, name: recipe.name, version: recipe.version, image: installation.execution.image, model: installation.execution.model, jobId: id, calls: job.noahExecution.calls, file });
    await checkpoint(proof);
    console.log(`${recipe.name}: connected → model → file → Work verified`);
  }
  const agentId = agentIds[0], id = randomUUID(), body = { id, agentId, prompt: 'Create ten numbered example text files. Work one by one.' };
  assert.equal((await call('/__noah/executions', body, { Origin: 'https://example.invalid' })).status, 403);
  assert.equal((await call('/__noah/executions', body, { 'X-Rock-Owner-Scope': `owner-v1:${'0'.repeat(64)}` })).status, 409);
  assert.equal((await call('/__noah/executions', body)).status, 202);
  const stopped = await call(`/__noah/executions/${id}/stop`, {});
  assert.equal(stopped.status, 200); assert.equal(stopped.data.job.noahExecution.state, 'cancelled');
  assert.equal((await call('/api/noah/executions', { id, action: 'finish', claim: '0'.repeat(64), state: 'returned', calls: 1 })).status, 403);
  await call(`/__noah/installations/${agentId}/disconnect`, {}); const restored = await ready(agentId);
  assert.equal(restored.execution.image, proof.agents[0].image);
  proof.checks = { duplicateRequests: 'same Work ID, one run', changedInput: 409, wrongOrigin: 403, changedOwner: 409, forgedReceipt: 403, stop: 'cancelled', reconnect: 'same image', automaticBusinessCompletion: false };
  proof.status = 'passed'; delete proof.currentAgent; delete proof.currentWorkId; await checkpoint(proof);
  return proof;
}
if (process.argv[1]?.endsWith('/check-noah-agent-execution.mjs') && process.argv.includes('--live')) {
  const outputIndex = process.argv.indexOf('--output');
  const agentIndex = process.argv.indexOf('--agents');
  let latest;
  const checkpoint = async proof => { latest = structuredClone(proof); if (outputIndex >= 0) await writeFile(process.argv[outputIndex + 1], JSON.stringify(proof, null, 2), { mode: 0o600 }); };
  try { await checkNoahExecution('http://127.0.0.1:3107', { ...(agentIndex >= 0 ? { agentIds: process.argv[agentIndex + 1].split(',') } : {}), checkpoint }); console.log('Noah connection/execution integration: PASS'); }
  catch (e) { if (latest) await checkpoint({ ...latest, status: 'failed', error: e.message.slice(0, 1000) }); console.error(e); process.exitCode = 1; }
}
