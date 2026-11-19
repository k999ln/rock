import { spawn } from 'node:child_process';
import { InstallError } from './noah-source-fetch.mjs';

// The trusted official harness retains its own auth. No environment variable
// supplied by an Agent, catalog entry or browser request reaches this process.
export const codexEnvironment = () => Object.fromEntries(['PATH', 'HOME', 'LANG', 'TMPDIR', 'CODEX_HOME'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
// Code-mode is the official V8 tool dispatcher (no filesystem/network APIs),
// needed by code-mode-only models. It may dispatch only the tools below; the
// environment selection is empty and desktop/shell/MCP connectors are disabled.
export const CODEX_DISABLED_FEATURES = Object.freeze(['apps', 'plugins', 'remote_plugin', 'browser_use', 'browser_use_external', 'browser_use_full_cdp_access', 'computer_use', 'in_app_browser', 'hooks', 'goals', 'multi_agent', 'view_image', 'image_generation', 'workspace_dependencies', 'skill_search', 'tool_suggest', 'auth_elicitation', 'shell_tool', 'unified_exec']);
export function codexProcessArgs() {
  return [...CODEX_DISABLED_FEATURES.flatMap(k => ['-c', `features.${k}=false`]), '-c', 'features.skip_host_skill_discovery=true', '-c', 'cloud.skills.enabled=false', '-c', 'orchestrator.mcp.enabled=false', '-c', 'web_search="disabled"', '-c', 'project_doc_max_bytes=0', 'app-server', '--listen', 'stdio://'];
}

export function createCodexChannel(executable, cwd, { signal, spawnProcess = spawn, onRequest, onEvent = () => {}, timeout = 15000 } = {}) {
  signal?.throwIfAborted();
  const child = spawnProcess(executable, codexProcessArgs(), { cwd, env: codexEnvironment(), stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  let next = 0, buffer = '', failure, closing = false, closed = false, stopPromise;
  const waiting = new Map(), listeners = new Set();
  const done = new Promise(resolve => child.once('close', () => { closed = true; resolve(); }));
  const fail = error => {
    if (!failure) failure = error;
    for (const p of waiting.values()) { clearTimeout(p.timer); p.reject(failure); }
    waiting.clear();
    for (const listener of listeners) listener(failure);
    listeners.clear();
  };
  const kill = sig => {
    try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, sig); else child.kill(sig); } catch { /* close confirmation below */ }
  };
  const stop = () => stopPromise ||= (async () => {
    closing = true; fail(new InstallError('Codexとの接続を終了しました。'));
    signal?.removeEventListener('abort', abort);
    if (closed) return;
    child.stdin.end(); kill('SIGTERM');
    let timer; const force = setTimeout(() => kill('SIGKILL'), 1500);
    try { await Promise.race([done, new Promise((_, reject) => { timer = setTimeout(() => { const e = new InstallError('Codexの停止を確認できません。'); e.unconfirmed = true; reject(e); }, 5000); })]); }
    finally { clearTimeout(force); clearTimeout(timer); }
  })();
  const abort = () => { void stop().catch(() => {}); };
  const fatal = error => { fail(error); abort(); };
  signal?.addEventListener('abort', abort, { once: true });
  child.stderr.on('data', () => {}); // Never persist auth, config or provider diagnostics.
  child.stdin.on('error', () => fatal(new InstallError('Codexの入力接続が切れました。')));
  child.once('error', () => fatal(new InstallError('公式Codexを起動できません。')));
  child.once('close', () => { signal?.removeEventListener('abort', abort); fail(new InstallError('Codexとの接続が切れました。')); });
  const send = message => { if (!closing && !closed) child.stdin.write(JSON.stringify(message) + '\n'); };
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffer += chunk;
    if (Buffer.byteLength(buffer) > 1048576) return fatal(new InstallError('Codexの応答が上限を超えました。'));
    let at;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at); buffer = buffer.slice(at + 1);
      let m; try { m = JSON.parse(line); if (!m || typeof m !== 'object') throw new Error(); } catch { fatal(new InstallError('Codexの応答形式を確認できません。')); return; }
      if (m.method && m.id !== undefined) {
        // Only the caller's fixed dynamic tool is serviced. Approval, login,
        // token refresh and arbitrary host/server requests are rejected.
        if (m.method !== 'item/tool/call' || !onRequest) { send({ id: m.id, error: { code: -32601, message: 'Host access is disabled' } }); continue; }
        void Promise.resolve().then(() => onRequest(m.params)).then(result => send({ id: m.id, result }), () => { send({ id: m.id, error: { code: -32602, message: 'Noah tool request rejected' } }); fatal(new InstallError('許可されていない作業要求を拒否しました。')); });
      } else if (m.method) {
        try { onEvent(m.method, m.params); } catch { fatal(new InstallError('Codexの実行手順を確認できません。')); }
      } else {
        const p = waiting.get(m.id); if (!p) continue;
        waiting.delete(m.id); clearTimeout(p.timer);
        if (m.error) p.reject(new InstallError('Codexが指定した実行方式を受け付けませんでした。')); else p.resolve(m.result);
      }
    }
  });
  const rpc = (method, params) => new Promise((resolve, reject) => {
    if (failure || closing || closed) return reject(failure || new InstallError('Codexは停止しています。'));
    const id = ++next, timer = setTimeout(() => fatal(new InstallError('Codexの応答が時間切れです。')), timeout);
    waiting.set(id, { resolve, reject, timer }); send({ id, method, params });
  });
  if (signal?.aborted) abort();
  return { rpc, stop, onFailure(listener) { if (failure) listener(failure); else listeners.add(listener); return () => listeners.delete(listener); },
    async initialize() { await rpc('initialize', { clientInfo: { name: 'noah_isolated_executor', title: 'Noah Isolated Executor', version: '1.0.0' }, capabilities: { experimentalApi: true } }); send({ method: 'initialized' }); },
  };
}

export function codexThreadParams(cwd, mcpNames = [], model) {
  if (mcpNames.some(n => typeof n !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(n))) throw new InstallError('Codexの接続設定を安全に分離できません。');
  return { cwd, ephemeral: true, environments: [], runtimeWorkspaceRoots: [], selectedCapabilityRoots: [], approvalPolicy: 'never', sandbox: 'read-only', modelProvider: 'openai', ...(model ? { model } : {}), allowProviderModelFallback: false,
    config: { ...Object.fromEntries(CODEX_DISABLED_FEATURES.map(k => [`features.${k}`, false])), 'features.skip_host_skill_discovery': true, 'cloud.skills.enabled': false, 'orchestrator.mcp.enabled': false, web_search: 'disabled', project_doc_max_bytes: 0,
      ...Object.fromEntries(mcpNames.map(n => [`mcp_servers.${n}.enabled`, false])) },
    developerInstructions: 'You work for Noah inside an isolated terminal workspace. Use only noah_workspace for file and command work. The personal desktop, host filesystem, browser, clipboard, accounts, network and host tools are unavailable. Do not request them. Save deliverables in /workspace; for text-only requests save answer.txt using noah_workspace. Report failures accurately. Work is not accepted without a real workspace tool call and a deliverable file.',
    dynamicTools: [{ type: 'function', name: 'noah_workspace', description: 'Execute a bounded POSIX shell command inside the dedicated, credential-free Linux workspace. Python 3 and standard utilities are available. No network, desktop or host files. The working directory is /workspace.', inputSchema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'], additionalProperties: false } }],
  };
}

export function assertCodexThread(result, model) {
  if (!result?.thread?.id || result.thread.ephemeral !== true || !Array.isArray(result.thread.environments) || result.thread.environments.length ||
    !Array.isArray(result.runtimeWorkspaceRoots) || result.runtimeWorkspaceRoots.length || !Array.isArray(result.instructionSources) || result.instructionSources.length ||
    result.approvalPolicy !== 'never' || result.sandbox?.type !== 'readOnly' || result.sandbox.networkAccess !== false || result.modelProvider !== 'openai' ||
    typeof result.model !== 'string' || !/^[a-zA-Z0-9_.:-]{1,120}$/.test(result.model) || (model && model !== result.model)) throw new InstallError('Codexの画面・端末からの分離を確認できません。実行を開始しません。');
  return result;
}

export function codexStructuredThreadParams(cwd, mcpNames = [], model) {
  const params = codexThreadParams(cwd, mcpNames, model);
  return { ...params, dynamicTools: [],
    developerInstructions: 'You provide a structured text response for an isolated Anicca composition task. Return only the JSON object specified by the output schema. No tools, commands, files, desktop, browser, network or personal accounts are available. Do not claim to have executed any external action. State limitations in the response when the request needs unavailable capabilities.' };
}
