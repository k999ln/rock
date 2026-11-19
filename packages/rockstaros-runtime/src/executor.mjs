import { createPrivateTextWorkJob, applyWorkCommand, workId } from '../../../lib/workflow.ts';
import { parseLinuxAgent } from '../../../lib/sky-linux-record.ts';
import { linuxLocalPrice } from '../../../lib/sky-linux-record.ts';
import { negotiateTextAdapters } from '../../../lib/rockstar-adapters.ts';

const plain = v => v && typeof v === 'object' && !Array.isArray(v);
const exact = (v, keys) => plain(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const hash = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const safeInt = v => Number.isSafeInteger(v) && v >= 0;
const canonical = v => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : plain(v) ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}' : JSON.stringify(v);
const clone = v => structuredClone(v);
export class ExecutorError extends Error {
  constructor(code, outcome = 'not_sent') { super(code); this.name = 'ExecutorError'; this.code = code; this.outcome = outcome; }
}
function check(condition, code) { if (!condition) throw new ExecutorError(code); }
export async function executionDigest(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(typeof value === 'string' ? value : canonical(value)))), b => b.toString(16).padStart(2, '0')).join('');
}
export function parseLocalTextRequest(value, now = Date.now()) {
  check(exact(value, ['id', 'threadId', 'input', 'agent', 'model', 'deadline', 'maxOutputTokens']), 'INVALID_EXECUTION_REQUEST');
  workId(value.id); workId(value.threadId);
  check(typeof value.input === 'string' && value.input.trim().length > 0 && value.input.length <= 4000 &&
    !Array.from(value.input).some(c => c.charCodeAt(0) < 32 && !['\t', '\n', '\r'].includes(c)), 'INVALID_INPUT');
  check(exact(value.agent, ['id', 'name', 'instructions', 'modelId', 'sha256']) && hash(value.agent.sha256), 'INVALID_AGENT'); workId(value.agent.id);
  const agent = parseLinuxAgent({ name: value.agent.name, instructions: value.agent.instructions, modelId: value.agent.modelId });
  check(exact(value.model, ['id', 'scheme', 'sha256']) && ['gguf-sha256', 'ollama-manifest-sha256'].includes(value.model.scheme) &&
    hash(value.model.sha256) && value.model.id === agent.modelId, 'MODEL_PIN_REQUIRED');
  check(safeInt(now) && safeInt(value.deadline) && value.deadline > now && value.deadline - now <= 120000 &&
    safeInt(value.maxOutputTokens) && value.maxOutputTokens >= 1 && value.maxOutputTokens <= 1024, 'INVALID_RESOURCE_LIMIT');
  return { ...clone(value), input: value.input.trim(), agent: { id: value.agent.id, ...agent, sha256: value.agent.sha256 } };
}

/** Host owns identity, authorization and atomic persistence. Driver only computes text.
 * Reports are local computation evidence, never external Tool or financial receipts. */
export function createTextExecutor({ owner, journal, authorize, driver, output, host, now = Date.now }) {
  check(typeof owner === 'string' && owner.length > 0 && owner.length <= 160 && typeof authorize === 'function' &&
    ['get', 'claim', 'replace'].every(k => typeof journal?.[k] === 'function') && typeof driver?.describe === 'function' &&
    typeof driver?.generate === 'function' && typeof output?.describe === 'function', 'INVALID_EXECUTOR_HOST');
  const active = new Set();
  async function beforeDeadline(callback, deadline, code) {
    check(now() < deadline, code); let timer;
    try { return await Promise.race([Promise.resolve().then(callback), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new ExecutorError(code)), Math.max(1, deadline - now()));
    })]); } finally { clearTimeout(timer); }
  }
  function view(record) {
    check(record.owner === owner, 'OWNER_MISMATCH');
    return { ...clone(record), observedState: record.state === 'running' && !active.has(record.id) ? 'unknown' : record.state };
  }
  async function read(id) { workId(id); const r = await journal.get(id); return r ? view(r) : null; }
  async function submit(raw) {
    const request = parseLocalTextRequest(raw, now());
    check(await executionDigest(JSON.stringify({ name: request.agent.name, instructions: request.agent.instructions, modelId: request.agent.modelId })) === request.agent.sha256, 'AGENT_PIN_MISMATCH');
    const digest = await executionDigest(request), prior = await journal.get(request.id);
    if (prior) { check(prior.owner === owner, 'OWNER_MISMATCH'); check(prior.digest === digest, 'REQUEST_ID_CONFLICT'); return view(prior); }
    const descriptors = await beforeDeadline(() => Promise.all([host(), driver.describe(request.model), output.describe()]), request.deadline, 'ADAPTER_PREPARATION_TIMEOUT');
    const negotiation = negotiateTextAdapters(...descriptors, now());
    const binding = { owner, jobId: request.id, requestSha256: digest, executorId: negotiation.executorId,
      permission: 'text.generate', maximumCostMinor: 0, expiresAt: request.deadline };
    const granted = await beforeDeadline(() => authorize(clone(binding)), request.deadline, 'AUTHORIZATION_TIMEOUT');
    check(exact(granted, Object.keys(binding)) && canonical(granted) === canonical(binding), 'AUTHORIZATION_REQUIRED');
    negotiateTextAdapters(...descriptors, now()); check(now() < request.deadline, 'AUTHORIZATION_EXPIRED');
    const initial = { schema: 'rockstaros.local-execution/1', id: request.id, threadId: request.threadId, owner, digest,
      revision: 0, state: 'running', request, negotiation, work: createPrivateTextWorkJob(request.id, request.agent.name, request.input.slice(0, 1000)),
      result: null, usage: { ...linuxLocalPrice,
        resources: 'この実行先のCPU・メモリ・保存容量を使います。電気代・機器代は未計測です。',
        idle: 'この仕事の推論終了後も、実行先と保存済み成果は残ります。' }, errorCode: null };
    const claimed = await journal.claim(clone(initial));
    if (!claimed.created) { check(claimed.record.owner === owner && claimed.record.digest === digest, 'REQUEST_ID_CONFLICT'); return view(claimed.record); }
    active.add(request.id);
    const controller = new AbortController(); let timer;
    try {
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new ExecutorError('EXECUTION_DEADLINE', 'unknown')); }, Math.max(1, request.deadline - now())); });
      const rawResult = await Promise.race([driver.generate(clone(request), controller.signal), timeout]);
      check(exact(rawResult, ['text', 'model', 'durationMs']) && typeof rawResult.text === 'string' && rawResult.text.trim().length > 0 && rawResult.text.length <= 32000 &&
        canonical(rawResult.model) === canonical(request.model) && safeInt(rawResult.durationMs), 'INVALID_EXECUTOR_RESULT');
      check(canonical(await beforeDeadline(() => authorize(clone(binding)), request.deadline, 'AUTHORIZATION_TIMEOUT')) === canonical(binding) && now() < request.deadline, 'AUTHORIZATION_EXPIRED');
      const text = rawResult.text.trim();
      const work = applyWorkCommand(initial.work, { id: crypto.randomUUID(), action: 'record', stepId: 'generate',
        tool: 'sky-private-text', transport: 'local-mcp', outcome: 'passed', sample: false, durationMs: rawResult.durationMs }, initial.work.revision);
      const complete = { ...initial, revision: 1, state: 'review', work,
        result: { text, sha256: await executionDigest(text), model: clone(request.model), durationMs: rawResult.durationMs, provenance: 'owner-local-computation', externalToolSuccess: false } };
      await journal.replace(request.id, 0, clone(complete)); return view(complete);
    } catch (e) {
      // An aborted transport is not proof that the engine stopped. Never resubmit this ID.
      const uncertain = { ...initial, revision: 1, state: 'unknown', errorCode: e instanceof ExecutorError ? e.code : 'EXECUTOR_OUTCOME_UNKNOWN' };
      await journal.replace(request.id, 0, clone(uncertain)); return view(uncertain);
    } finally { clearTimeout(timer); active.delete(request.id); }
  }
  return Object.freeze({ submit, read });
}

/** Output projection keeps the text, pin, review state and usage. It grants no authority. */
export async function projectTextReceipt(record) {
  check(record?.schema === 'rockstaros.local-execution/1' && record.state === 'review' && record.work?.status === 'review' && record.work.id === record.id && record.result?.externalToolSuccess === false &&
    typeof record.result.text === 'string' && record.result.text.length > 0 && record.result.text.length <= 32000 && hash(record.result.model?.sha256) && canonical(record.result.model) === canonical(record.request.model) &&
    hash(record.result.sha256) && await executionDigest(record.result.text) === record.result.sha256 &&
    record.usage?.mode === 'owner-local' && record.usage.cloudUsageMinor === 0 && record.usage.cloudTokensUsed === 0 && record.usage.agentPriceMinor === 0, 'RESULT_NOT_READY');
  return { schema: 'rockstaros.text-output/1', jobId: record.id, threadId: record.threadId, revision: record.work.revision,
    status: 'review', text: record.result.text, outputSha256: record.result.sha256, model: clone(record.result.model),
    usage: clone(record.usage), provenance: record.result.provenance, warning: '下書きです。内容を確認してください。', externalToolSuccess: false };
}
export async function projectPixelTextReceipt(run, threadId) {
  workId(run?.job?.id); workId(threadId);
  check(run.job.templateId === 'sky-linux-private' && run.job.status === 'review' && run.stop === 'none' &&
    typeof run.text === 'string' && run.text.length > 0 && run.text.length <= 32000 && hash(run.modelSha256) &&
    run.usage?.mode === 'owner-local' && run.usage.cloudUsageMinor === 0 && run.usage.cloudTokensUsed === 0 && run.usage.agentPriceMinor === 0, 'INVALID_PIXEL_RECEIPT');
  return { schema: 'rockstaros.text-output/1', jobId: run.job.id, threadId, revision: run.job.revision,
    status: 'review', text: run.text, outputSha256: await executionDigest(run.text),
    model: { id: run.agent.modelId, scheme: 'gguf-sha256', sha256: run.modelSha256 }, usage: clone(run.usage),
    provenance: 'linked-device-report', warning: '下書きです。内容を確認してください。', externalToolSuccess: false };
}
