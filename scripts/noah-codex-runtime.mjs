import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { createCodexChannel, codexThreadParams, codexStructuredThreadParams, assertCodexThread } from './noah-codex-channel.mjs';
import { createCodexWorkspace, prepareCodexWorkspace } from './noah-codex-workspace.mjs';
import { InstallError, sha256 } from './noah-source-fetch.mjs';
import { TERMINAL_SURFACE } from '../lib/noah-terminal-contract.mjs';
import { limitsFor } from '../lib/noah-execution-contract.mjs';

async function openThread(channel, cwd, model, structured = false) {
  await channel.initialize();
  const auth = await channel.rpc('account/read', { refreshToken: false });
  if (auth?.account?.type !== 'chatgpt') throw new InstallError('本人のChatGPTアカウントで公式Codexへログインしてから再接続してください。');
  const config = await channel.rpc('config/read', { includeLayers: false, cwd });
  if (!config?.config || typeof config.config !== 'object') throw new InstallError('Codexの接続設定を確認できません。');
  // Only names are retained. Credentials and user configuration are not copied.
  const names = Object.keys(config.config.mcp_servers || {});
  return assertCodexThread(await channel.rpc('thread/start', (structured ? codexStructuredThreadParams : codexThreadParams)(cwd, names, model)), model);
}

export const runCodexIsolated = options => runCodexTurn(options);
export const runCodexStructured = (options, outputSchema) => runCodexTurn(options, outputSchema);

async function runCodexTurn({ root, cwd, executable, image, model, prompt, signal, onModel = async () => {}, createChannel = createCodexChannel, createWorkspace = createCodexWorkspace }, outputSchema) {
  signal.throwIfAborted();
  const controller = new AbortController(), combined = AbortSignal.any([signal, controller.signal, AbortSignal.timeout(240000)]);
  let threadId, turnId, workspace, channel, text = '', settled = false, unsubscribe, outcome, failure;
  const callIds = new Set();
  let resolveTurn, rejectTurn;
  const completed = new Promise((resolve, reject) => { resolveTurn = resolve; rejectTurn = reject; });
  completed.catch(() => {}); // A stop/failure may arrive before turn/start returns.
  const reject = error => { if (!settled) { settled = true; rejectTurn(error); } };
  const abort = () => {
    reject(new InstallError(signal.aborted ? '実行を停止しました。' : '実行時間の上限に達しました。'));
    if (threadId && turnId) void channel?.rpc('turn/interrupt', { threadId, turnId }).catch(() => {});
  };
  combined.addEventListener('abort', abort, { once: true });
  try {
    if (!outputSchema) workspace = await createWorkspace(root, image, combined);
    channel = createChannel(executable, cwd, {
      onRequest: async p => {
        if (outputSchema || settled || !threadId || !turnId || p?.threadId !== threadId || p.turnId !== turnId || p.tool !== 'noah_workspace' || p.namespace != null || typeof p.callId !== 'string' || callIds.has(p.callId)) throw new InstallError('作業要求の実行元が一致しません。');
        callIds.add(p.callId); combined.throwIfAborted(); await onModel(1);
        const result = await workspace.execute(p.arguments);
        return { contentItems: [{ type: 'inputText', text: JSON.stringify(result) }], success: result.exitCode === 0 && !result.timedOut };
      },
      onEvent: (method, p) => {
        if (!threadId || p?.threadId !== threadId || settled) return;
        if (method === 'turn/started') {
          if (turnId && turnId !== p.turn?.id) throw new Error('unexpected turn');
          turnId = p.turn?.id;
        }
        if (p.turnId && turnId && p.turnId !== turnId) throw new Error('wrong turn');
        if (method === 'item/completed' && p.item?.type === 'agentMessage') {
          if (typeof p.item.text !== 'string') throw new Error('message');
          text = outputSchema ? p.item.text : text + p.item.text + '\n';
          if (Buffer.byteLength(text) > 32768) throw new Error('output limit');
        }
        if (method === 'turn/completed') {
          if (!turnId || p.turn?.id !== turnId) throw new Error('wrong completion');
          if (p.turn.status !== 'completed') reject(new InstallError(p.turn.status === 'interrupted' ? 'Codexの実行が停止しました。' : 'Codexが仕事を完了できませんでした。'));
          else { settled = true; resolveTurn(); }
        }
      },
    });
    unsubscribe = channel.onFailure(reject);
    const started = await openThread(channel, cwd, model, Boolean(outputSchema)); threadId = started.thread.id;
    combined.throwIfAborted(); await onModel(1); // Provider turn, not an inferred model-call count.
    const accepted = await channel.rpc('turn/start', { threadId, environments: [], runtimeWorkspaceRoots: [], approvalPolicy: 'never', sandboxPolicy: { type: 'readOnly', networkAccess: false }, input: [{ type: 'text', text: prompt }], model, ...(outputSchema ? { outputSchema, effort: 'medium' } : {}) });
    if (!accepted?.turn?.id || (turnId && turnId !== accepted.turn.id)) throw new InstallError('Codexの実行受付を照合できません。');
    turnId = accepted.turn.id;
    await completed; combined.throwIfAborted();
    if (outputSchema) {
      if (!text.trim()) throw new InstallError('Codexの文章応答を確認できません。');
      outcome = { text: text.trim(), calls: 1 };
    } else {
      const result = await workspace.collect(text.trim());
      if (!callIds.size || !result.files.length) throw new InstallError('Codexの隔離Tool実行と成果ファイルを確認できませんでした。');
      outcome = { ...result, calls: 1, toolCalls: callIds.size };
    }
  } catch (error) { failure = error; }
  finally {
    combined.removeEventListener('abort', abort); controller.abort(); unsubscribe?.();
    const stopped = await Promise.allSettled([channel?.stop(), workspace?.stop()]);
    const failed = stopped.find(r => r.status === 'rejected');
    if (failed) { failure = new InstallError('Codexまたは隔離作業領域の停止を確認できません。'); failure.unconfirmed = true; }
  }
  if (failure) throw failure;
  return outcome;
}

export async function prepareCodexRuntime({ root, directory, installed, recipe, signal, runtimeImage, execute = runCodexIsolated }) {
  // Fail closed on unsupported protocol instead of falling back to host exec.
  const image = runtimeImage || await prepareCodexWorkspace(root, signal);
  const executableSha256 = sha256(await readFile(installed.executable));
  const parent = path.join(directory, 'isolated-sessions'); await mkdir(parent, { recursive: true, mode: 0o700 });
  const cwd = await mkdtemp(path.join(parent, 'probe-'));
  const channel = createCodexChannel(installed.executable, cwd, { signal });
  let model;
  try { const result = await openThread(channel, cwd); model = result.model; }
  finally { await channel.stop(); await rm(cwd, { recursive: true, force: true }); }
  let stopped = false; const runs = new Map();
  const provider = { name: 'openai-codex', model, version: installed.version, sha256: executableSha256, consent: 'codex-account/1', metric: 'provider_turns' };
  const check = async () => { if (stopped || sha256(await readFile(installed.executable)) !== executableSha256) throw new InstallError('Codexの版または接続が変わりました。再接続してください。'); };
  return {
    runtimeInfo: { name: recipe.name, version: recipe.key === 'codex' ? installed.version : recipe.version, reused: installed.reused, image },
    binding: { recipe: recipe.key, version: recipe.version, model: 'codex-account', provider },
    execution: { isolation: TERMINAL_SURFACE, recipe: recipe.key, model: 'codex-account', providerModel: model, image, capability: recipe.capability, limits: limitsFor(recipe) },
    revalidate: check,
    async probe() { await check(); return { state: 'connected', message: `${recipe.name}と本人Codexの背景実行を準備しました。依頼内容の送信を確認して実行できます。` }; },
    async run(prompt, runSignal, onModel) {
      await check(); const c = new AbortController(); const combined = AbortSignal.any([c.signal, runSignal]);
      const task = (async () => { const workdir = await mkdtemp(path.join(parent, 'run-')); try { return await execute({ root, cwd: workdir, executable: installed.executable, image, model, prompt, signal: combined, onModel }); } finally { await rm(workdir, { recursive: true, force: true }); } })();
      runs.set(c, task); try { return await task; } finally { runs.delete(c); }
    },
    async stop() { stopped = true; for (const c of runs.keys()) c.abort(); await Promise.allSettled(runs.values()); },
  };
}
