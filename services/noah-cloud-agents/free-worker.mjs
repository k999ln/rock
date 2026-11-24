import worker, { NoahCloudJob, NoahCloudConnection, NoahCloudBudget } from './worker.mjs';
import { parseEveAdvice } from '../../lib/noah-eve-advice.ts';
import { officialSession, executionFile } from './free-official.mjs';
import { pythonProfiles, pythonJob, timeSession, PythonModelBridge, validatePythonResult } from './free-python.mjs';
import { NOAH_FREE_CLOUD_LIMITS as limits, NOAH_CLOUD_MODEL, NOAH_EVE_ADVICE_PURPOSE, noahCloudModelInput, noahCloudDigest, noahCloudResult, noahCloudCallNeuronsCap, noahCloudReplyUsage } from '../../lib/noah-cloud-contract.ts';
export { NoahCloudConnection, NoahCloudBudget };
export default worker;
const terminal = job => !job || ['returned', 'failed', 'cancelled', 'unknown'].includes(job.state);

const eveAdviceInstructions = [
  'You are Eve. Design an untested agent workflow; no tools or agents have run. Return one JSON object in the requested language.',
  '{"input":"starting material","steps":[{"agent":null,"role":"specific job","output":"artifact"}],"scheme":{"kind":"user_goal","recipient":"who receives it","outcome":"value delivered","acceptance":"observable success condition","evidence":"specific record to check"}}',
  'Use two distinct steps unless three or four are necessary. Each takes the preceding output. Choose a fitting listed agent key once or JSON null for a custom role.',
  'Use kind user_goal for a personal outcome such as a health goal. Follow the user’s own goal; never assume a medical outcome.',
  'Use kind conversion for revenue. Check the offer’s qualifying milestone (e.g. approval), with payment only if specified. Mark unspecified conditions as proposed. Name evidence to collect.',
  'Keep each value to one short phrase. Never report an unobserved result.',
].join('\n');

// The Python Hermes adapter accepts only successful, correlated todo/memory results.
// The model can finish in prose after that point, including on a later model turn.
function hasSuccessfulHermesTool(messages) {
  const pending = new Set();
  for (const message of messages) {
    if (message.role === 'assistant') {
      for (const call of message.tool_calls ?? []) {
        if (typeof call?.id === 'string' && call.id && ['todo', 'memory'].includes(call.function?.name)) pending.add(call.id);
      }
    }
    if (message.role !== 'tool' || !pending.delete(message.tool_call_id)) continue;
    let result;
    try { result = JSON.parse(message.content); }
    catch { continue; }
    if (result && typeof result === 'object' && !Array.isArray(result) && !result.error && result.success !== false) return true;
  }
  return false;
}

/** The alarm owns execution, independently of the request/browser that admitted it. */
export class NoahFreeCloudJob extends NoahCloudJob {
  session;
  abort;
  async schedule() { await this.ctx.storage.setAlarm(Date.now() + 1000); }
  async recover(job) { if (job.state !== 'queued') await super.recover(job); }
  async stopRuntime() { this.abort?.abort(); await this.session?.close(); this.session = undefined; }
  async modelResponse(promise, deadline) {
    let timer, cancelled;
    try {
      return await Promise.race([promise, new Promise((_, reject) => {
        cancelled = () => reject(Error('stopped'));
        if (this.abort.signal.aborted) { cancelled(); return; }
        this.abort.signal.addEventListener('abort', cancelled, { once: true });
        timer = setTimeout(() => reject(Error('実行時間の上限に達しました。')), Math.max(1, deadline - Date.now()));
      })]);
    } finally { clearTimeout(timer); this.abort.signal.removeEventListener('abort', cancelled); }
  }
  async alarm() {
    const job = await this.ctx.storage.get('job');
    if (job?.state === 'queued' && Date.now() < job.deadlineAt) {
      this.running = true;
      try { await this.execute(); } finally { this.running = false; }
    } else if (job?.state === 'running' && !this.running) await this.recover(job);
    else await super.alarm();
  }
  async live() {
    const job = await this.ctx.storage.get('job');
    if (terminal(job)) throw Error('stopped');
    if (Date.now() >= job.deadlineAt) throw Error('実行時間の上限に達しました。');
    return job;
  }
  async runModel(value) {
    const owner = await this.live();
    const input = { ...noahCloudModelInput(value), max_tokens: limits.outputTokens };
    if (['boss', 'hermes'].includes(owner.profile)) input.reasoning_effort = 'low';
    if (owner.purpose === NOAH_EVE_ADVICE_PURPOSE) input.response_format = { type: 'json_object' };
    if (owner.profile === 'boss') {
      // The official command requests five JSON questions. Reserve the fixed
      // output budget for that result rather than a long reasoning preamble.
      input.response_format = { type: 'json_object' };
      const instruction = 'Return one compact JSON object in the requested language. Keep every string brief (at most 40 characters), exactly five questions, one evaluation point per question and two preparation tips. Do not omit the official fields.';
      if (input.messages[0].role === 'system') input.messages[0].content += '\n' + instruction;
      else input.messages.unshift({ role: 'system', content: instruction });
    }
    let model, deadline, inputBytes, refusal;
    await this.ctx.blockConcurrencyWhile(async () => {
      const latest = await this.live();
      // 断る理由は、この区間の外で投げる（区間の中で投げると、Durable Object が作り直され、失敗の結果を返せない）。
      if (latest.calls >= limits.modelCalls) { refusal = '無料枠のモデル呼出上限に達しました。'; return; }
      if (latest.profile === 'hermes' && input.tools?.length && !hasSuccessfulHermesTool(input.messages)) input.tool_choice = 'required';
      inputBytes = new TextEncoder().encode(JSON.stringify(input)).length;
      if (inputBytes > limits.modelInputBytes) { refusal = '無料枠のモデル入力上限に達しました。依頼を短くしてください。'; return; }
      // 1 件の上限（取り置いた分）を超えるかを、呼ぶ前に確かめる（トークンは 1 バイト以上なので、入力のバイト数を上限にする）。
      if ((latest.usage?.neurons ?? 0) + noahCloudCallNeuronsCap(inputBytes, input.max_tokens) > limits.jobNeurons) { refusal = 'この依頼は、無料のクラウドの 1 件の上限を超えます。依頼を短くするか、小さく分けてください。'; return; }
      deadline = latest.deadlineAt;
      await this.ctx.storage.put('job', { ...latest, calls: latest.calls + 1 });
      model = this.env.AI.run(NOAH_CLOUD_MODEL, input);
    });
    if (refusal) throw Error(refusal);
    let reply;
    try { reply = await this.modelResponse(model, deadline); }
    catch (error) {
      // 止めた・時間切れでも、モデルは使われているかもしれない。少なく数えないように、その 1 回の上限で数える。
      await this.count(noahCloudReplyUsage(null, inputBytes, input.max_tokens));
      throw error;
    }
    await this.count(noahCloudReplyUsage(reply, inputBytes, input.max_tokens));
    await this.live();
    return reply;
  }
  /** 使ったモデルの量を、依頼と、全体の 1 日の枠（BUDGET）に足す。依頼が止められた後に返ってきた分も数える。 */
  async count(used) {
    const job = await this.ctx.blockConcurrencyWhile(async () => {
      const latest = await this.ctx.storage.get('job'); if (!latest) return null;
      const usage = latest.usage ?? { inputTokens: 0, outputTokens: 0, neurons: 0 };
      const next = { ...latest, usage: { inputTokens: usage.inputTokens + used.inputTokens, outputTokens: usage.outputTokens + used.outputTokens, neurons: usage.neurons + used.neurons } };
      await this.ctx.storage.put('job', next); return next;
    });
    if (!job) return;
    try {
      const response = await this.env.BUDGET.getByName('global').fetch('https://runtime.internal/', { method: 'POST', body: JSON.stringify({ action: 'use', id: `${job.owner}:${job.id}`, owner: job.owner, neurons: used.neurons }) });
      await response.body?.cancel();
    } catch { /* 数え損ねても、依頼の結果は捨てない。取り置きは、依頼が終わると外れる。 */ }
  }
  async execute() {
    try {
      const job = await this.ctx.blockConcurrencyWhile(async () => {
        const current = await this.ctx.storage.get('job');
        if (!current || current.state !== 'queued') return null;
        await this.ctx.storage.put('job', { ...current, state: 'running' });
        await this.ctx.storage.setAlarm(current.deadlineAt); return current;
      });
      if (!job) return;
      this.abort = new AbortController();
      if (job.purpose === NOAH_EVE_ADVICE_PURPOSE) {
        const reply = await this.runModel({ messages: [
          { role: 'system', content: eveAdviceInstructions },
          { role: 'user', content: job.prompt },
        ] });
        const choice = reply?.choices?.[0], message = choice?.message;
        const noTool = message?.tool_calls == null || (Array.isArray(message.tool_calls) && message.tool_calls.length === 0);
        if (choice?.finish_reason !== 'stop' || !noTool || (message?.role != null && message.role !== 'assistant') || typeof message?.content !== 'string' || !parseEveAdvice(message.content)) {
          throw Error('Eveの相談に対する有効な組み合わせ案を受け取れませんでした。');
        }
        const latest = await this.live();
        const result = await noahCloudResult({ type: 'result', exitCode: 0, text: message.content, files: [], operationCount: 0 }, latest.calls);
        await this.end('returned', null, result);
        return;
      }
      if (pythonProfiles.has(job.profile)) {
        const stub = pythonJob(this.env, job);
        if (job.mode === 'probe') {
          await this.modelResponse(stub.probe(job.profile), job.deadlineAt);
          await this.live(); await this.end('returned'); return;
        }
        if (job.profile !== 'time') {
          const encoded = JSON.stringify({ profile: job.profile, prompt: job.prompt });
          const raw = await this.modelResponse(stub.execute(encoded, new PythonModelBridge(this)), job.deadlineAt);
          const result = validatePythonResult(job.profile, raw);
          result.files.push(await executionFile(job.profile, result.operations, 'official-python-workers'));
          const latest = await this.live();
          await this.end('returned', null, await noahCloudResult({ type: 'result', exitCode: 0, text: result.text, files: result.files }, latest.calls)); return;
        }
        this.session = await this.modelResponse(timeSession(stub), job.deadlineAt);
      } else this.session = await officialSession(job.profile);
      await this.live();
      if (job.mode === 'probe') { await this.end('returned'); return; }
      const session = this.session, operations = [];
      const messages = [
        { role: 'system', content: 'You are the Noah assistant using the official MCP tools. Always use the relevant tool to perform the request, then summarize the actual results in the user language. Do not claim success before a successful tool response. Do not request shell commands or external access. Files are only in /tmp/workspace. Memory lasts only for this job. Sequential Thinking steps should be brief practical plans, not hidden internal reasoning. You have at most 4 model turns. Finish after the necessary tools. Never create noah-execution.json; it is reserved for the receipt.' },
        { role: 'user', content: job.prompt },
      ];
      for (let turn = 0; turn < limits.modelCalls; turn++) {
        await this.live();
        const reply = await this.runModel({ messages, tools: session.tools });
        await this.live();
        const choice = reply?.choices?.[0], message = choice?.message;
        if (!message || !['stop', 'tool_calls'].includes(choice.finish_reason)) throw Error('モデルが正常に完了しませんでした。依頼を短くしてください。');
        const calls = message.tool_calls ?? [];
        if (!Array.isArray(calls) || calls.length > 4) throw Error('Tool呼出が上限を超えました。');
        if (!calls.length) {
          if (typeof message.content !== 'string' || !message.content.trim() || !operations.some(o => o.ok)) throw Error('公式Toolの実行結果を確認できませんでした。');
          const files = await session.files();
          if (files.some(f => f.name === 'noah-execution.json')) throw Error('実行記録のファイル名は予約されています。');
          files.push(await executionFile(job.profile, operations, job.profile === 'time' ? 'official-python-workers' : 'official-mcp-workers'));
          const latest = await this.live();
          await this.end('returned', null, await noahCloudResult({ type: 'result', exitCode: 0, text: message.content, files }, latest.calls)); return;
        }
        messages.push({ role: 'assistant', content: typeof message.content === 'string' ? message.content : '', tool_calls: calls });
        for (const call of calls) {
          await this.live();
          if (operations.length >= 12 || typeof call.id !== 'string' || typeof call.function?.name !== 'string' || typeof call.function?.arguments !== 'string') throw Error('Tool呼出の形式を確認できませんでした。');
          let operation;
          await this.ctx.blockConcurrencyWhile(async () => {
            await this.live(); operation = session.call(call.function.name, JSON.parse(call.function.arguments));
          });
          const result = await this.modelResponse(operation, job.deadlineAt);
          await this.live();
          const serialized = JSON.stringify(result);
          if (new TextEncoder().encode(serialized).length > 16384) throw Error('Toolの応答が無料枠の上限を超えました。');
          operations.push({ name: call.function.name, ok: !result.isError, inputSha256: await noahCloudDigest(call.function.arguments), resultSha256: await noahCloudDigest(serialized) });
          await session.files();
          messages.push({ role: 'tool', tool_call_id: call.id, content: serialized });
        }
      }
      throw Error('無料枠のモデル呼出上限に達しました。依頼を小さく分けてください。');
    } catch (error) {
      await this.end('failed', error instanceof Error ? error.message.slice(0, 240) : '公式Agentの実行に失敗しました。');
    } finally { await this.session?.close(); this.session = undefined; }
  }
}
