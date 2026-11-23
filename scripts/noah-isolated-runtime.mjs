import { spawn } from 'node:child_process';
import { lstat, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { InstallError, runCommand, sha256 } from './noah-source-fetch.mjs';
import { TERMINAL_SURFACE } from '../lib/noah-terminal-contract.mjs';
import { MODEL, LIMITS, modelFor, limitsFor, validArtifactName } from './noah-execution-recipes.mjs';
import { getNoahModelManager } from './noah-model-manager.mjs';
import { noahModel } from '../lib/noah-model-catalog.mjs';
import { auditNoahContainerArgs, auditNoahVmArgs } from '../lib/noah-screenless-audit.mjs';

const localEnv = () => ({ PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8' });
const engineHomes=new Map();
const managedRoots = new Set();
const managedSocket = '/run/noah-desktop/docker.sock';

export async function configureManagedDesktopEngine(root, signal) {
  if (process.platform !== 'linux' || !path.isAbsolute(root)) throw new InstallError('運営の専用Linux VMを確認できません。', 503);
  const stat = await lstat(managedSocket).catch(() => null);
  if (!stat?.isSocket()) throw new InstallError('運営の専用Linux実行器が未接続です。', 503);
  let labels;
  try {
    const output = await runCommand('docker', ['--host', 'unix://' + managedSocket, 'info', '--format', '{{json .Labels}}'],
      { env: localEnv(), signal, timeout: 5000 });
    labels = JSON.parse(output);
  } catch {
    signal.throwIfAborted();
    throw new InstallError('運営の専用Linux実行器に接続できません。', 503);
  }
  if (!Array.isArray(labels) || !labels.includes('noah.purpose=managed-desktop')) throw new InstallError('運営専用の実行器を識別できません。', 503);
  managedRoots.add(path.resolve(root));
}
export function configureNoahEngine(root,directory){if(!path.isAbsolute(directory)||Buffer.byteLength(path.join(directory,'noah-exec/docker.sock'))>100)throw new InstallError('実行環境の保存先パスが長すぎます。');engineHomes.set(path.resolve(root),directory);}
export const engineHome = root => engineHomes.get(path.resolve(root))??path.join(root, 'work/runtime-state/noah-engine/colima');
export const engineSocket = root => managedRoots.has(path.resolve(root))
  ? 'unix://' + managedSocket : `unix://${engineHome(root)}/noah-exec/docker.sock`;
const docker = (root, args, options = {}) => runCommand('docker', ['--host', engineSocket(root), ...args], { env: localEnv(), ...options });
let engineStarting;
export function engineArgs() {
  return ['start', 'noah-exec', '--activate=false', '--ssh-config=false', '--mount', 'none', '--cpus', '2', '--memory', '4', '--disk', '40', '--root-disk', '10', '--runtime', 'docker', '--vm-type', 'vz', '--binfmt=false', '--network-address=false', '--network-host-addresses=false'];
}
export function assertNoahContainerArgs(args, options = {}) {
  const violations = auditNoahContainerArgs(args, options);
  if (violations.length) throw new InstallError('本人の画面を保護する実行条件を満たしていません: ' + violations.join(' / '));
  return args;
}
export async function ensureEngine(root, signal) {
  try { await docker(root, ['info', '--format', '{{.ServerVersion}}'], { signal, timeout: 5000 }); return; } catch { signal.throwIfAborted(); }
  if (managedRoots.has(path.resolve(root))) throw new InstallError('運営の専用Linux実行器に接続できません。', 503);
  if (!engineStarting) engineStarting = (async () => {
    // Colima ignores COLIMA_HOME if the directory does not already exist.
    await mkdir(engineHome(root), { recursive: true, mode: 0o700 });
    const args = engineArgs();
    if (auditNoahVmArgs(args).length) throw new InstallError('本人の端末から分離したVMを準備できません。');
    await runCommand('colima', args,
      { env: { ...localEnv(), COLIMA_HOME: engineHome(root), COLIMA_CACHE_HOME: path.join(root, 'work/runtime-state/noah-engine/cache') }, timeout: 300000 });
  })().finally(() => { engineStarting = null; });
  await engineStarting; signal.throwIfAborted();
}

export function containerArgs(name, image, recipe = {}) {
  const fileBytes = limitsFor(recipe).scratchFileBytes;
  return ['run', '--rm', '-i', '--name', name, '--network', 'none', '--read-only', '--user', '10001:10001', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--cpus', '1.5', '--memory', '1536m', '--pids-limit', '96', '--ulimit', `fsize=${fileBytes}:${fileBytes}`,
    '--tmpfs', '/workspace:rw,nosuid,nodev,uid=10001,gid=10001,size=64m', '--tmpfs', '/tmp:rw,nosuid,nodev,uid=10001,gid=10001,size=64m', '--tmpfs', '/home/agent:rw,nosuid,nodev,uid=10001,gid=10001,size=64m', image];
}

export async function localModel(body, signal, fetcher = fetch, selectedModel = MODEL, configuredOutputTokens = LIMITS.outputTokens, modelHandle) {
  if (!noahModel(selectedModel)) throw new InstallError('対応していないローカルモデルです。');
  if (noahModel(selectedModel).derivedFrom && !modelHandle)
    throw new InstallError('Tool接続版はモデル管理で準備してから実行してください。');
  if (!body || typeof body !== 'object' || !Array.isArray(body.messages) || !body.messages.length || body.messages.length > 100 || Buffer.byteLength(JSON.stringify(body)) > 262144)
    throw new InstallError('モデルへの入力が上限を超えました。');
  // Select a fixed local endpoint/model and bounded options. Never forward URLs,
  // headers, credentials, routing hints, or provider-selected models.
  const toolNames = new Map();
  const messages = body.messages.map(m => {
    if (!m || !['system', 'developer', 'user', 'assistant', 'tool'].includes(m.role)) throw new InstallError('対応していないモデル入力です。');
    const content = Array.isArray(m.content) && m.content.every(p => p?.type === 'text' && typeof p.text === 'string') ? m.content.map(p => p.text).join('\n') : m.content ?? '';
    if (typeof content !== 'string') throw new InstallError('対応していないモデル入力です。');
    if (m.role === 'assistant' && Array.isArray(m.tool_calls))
      for (const call of m.tool_calls) if (typeof call?.id === 'string') toolNames.set(call.id, call.function?.name);
    const toolName = m.role === 'tool' ? toolNames.get(m.tool_call_id) || m.name : undefined;
    return { role: m.role === 'developer' ? 'system' : m.role, content, ...(Array.isArray(m.tool_calls) ? { tool_calls: m.tool_calls.map(t => ({ function: { name: t.function.name, arguments: typeof t.function.arguments === 'string' ? JSON.parse(t.function.arguments) : t.function.arguments } })) } : {}), ...(typeof toolName === 'string' ? { tool_name: toolName } : {}) };
  });
  // Installed qwen3 advertises thinking.values=[true]. Sending false causes its
  // reasoning to spill into answer text. Keep reasoning separate and discard it.
  // Respect a provider's smaller reserve while enforcing our independent cap.
  const requestedTokens = body.max_completion_tokens ?? body.max_tokens;
  const cap = [2048, 4096].includes(configuredOutputTokens) ? configuredOutputTokens : LIMITS.outputTokens;
  const outputTokens = Number.isInteger(requestedTokens) && requestedTokens > 0 ? Math.min(requestedTokens, cap) : cap;
  if(modelHandle) await modelHandle.validate();
  // Bound CPU inference threads per Noah request without changing the shared
  // Ollama service. This does not cap GPU work or all host CPU activity.
  const request = { model: modelHandle?.model || selectedModel, messages, stream: false, ...(modelHandle ? { keep_alive: '30s' } : {}), think: selectedModel === 'qwen3:4b', options: { num_predict: outputTokens, num_ctx: 8192, num_thread: 2, temperature: 0 }, ...(Array.isArray(body.tools) ? { tools: body.tools } : {}) };
  const r = await fetcher('http://127.0.0.1:11434/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(150000)]) });
  if (!r.ok) throw new InstallError('ローカルモデルが応答しませんでした。');
  const reader = r.body.getReader(); const chunks = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 262144) { await reader.cancel(); throw new InstallError('モデル応答が上限を超えました。'); } chunks.push(value); }
  const result = JSON.parse(Buffer.concat(chunks).toString());
  if (!result.done || !result.message || typeof result.message.content !== 'string') throw new InstallError('モデル応答の形式を確認できません。');
  const toolCalls = result.message.tool_calls?.map(t => ({ id: `call_${randomUUID().replaceAll('-', '')}`, type: 'function', function: { name: t.function.name, arguments: JSON.stringify(t.function.arguments) } }));
  if (!result.message.content.trim() && !toolCalls?.length) throw new InstallError('モデルが応答や操作を返しませんでした。依頼を短くするか、対応モデルを見直してください。');
  return { id: `chatcmpl-${randomUUID()}`, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: selectedModel,
    choices: [{ index: 0, finish_reason: toolCalls?.length ? 'tool_calls' : result.done_reason === 'length' ? 'length' : 'stop', message: { role: 'assistant', content: result.message.content, ...(toolCalls?.length ? { tool_calls: toolCalls } : {}) } }],
    usage: { prompt_tokens: result.prompt_eval_count || 0, completion_tokens: result.eval_count || 0, total_tokens: (result.prompt_eval_count || 0) + (result.eval_count || 0) } };
}

export function validateResult(value) {
  if (!value || value.type !== 'result' || !Number.isInteger(value.exitCode) || typeof value.text !== 'string' || !Array.isArray(value.files) || value.files.length > LIMITS.files || Buffer.byteLength(JSON.stringify(value)) > LIMITS.resultBytes)
    throw new InstallError('Agentの結果が上限または形式に一致しません。');
  const names = new Set(); let total = 0;
  for (const file of value.files) {
    if (!file || !validArtifactName(file.name) || names.has(file.name) || typeof file.base64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.base64)) throw new InstallError('生成ファイルの形式が不正です。');
    const bytes = Buffer.from(file.base64, 'base64'); total += bytes.length; names.add(file.name);
    if (bytes.length !== file.bytes || bytes.length > LIMITS.fileBytes || total > 65536 || sha256(bytes) !== file.sha256) throw new InstallError('生成ファイルを照合できません。');
  }
  return { text: value.text, files: value.files.map(f => ({ name: f.name, base64: f.base64, bytes: f.bytes, sha256: f.sha256 })), exitCode: value.exitCode };
}

export function runIsolated({ root, image, recipe, prompt, probe = false, signal, onModel = async () => {}, model = (body, signal) => localModel(body, signal, fetch, modelFor(recipe), limitsFor(recipe).outputTokens) }) {
  return runIsolatedProtocol({ root, args: containerArgs(`noah-run-${randomUUID()}`, image, recipe),
    request: { agent: recipe.key, model: modelFor(recipe), prompt, probe }, probe, signal, onModel, model,
    seconds: probe ? 30 : limitsFor(recipe).seconds, requireModel: !probe });
}

// Only trusted host adapters construct args; uploaded content is stdin/data.
// This protocol cannot open a host browser, request desktop access or relay URLs.
export function runIsolatedProtocol({ root, args, request, probe = false, signal, onModel = async () => {}, model,
  seconds = 240, requireModel = true, spawnProcess = spawn }) {
  signal.throwIfAborted();
  assertNoahContainerArgs(args);
  const name = args[args.indexOf('--name') + 1];
  return new Promise((resolve, reject) => {
    const child = spawnProcess('docker', ['--host', engineSocket(root), ...args], { env: localEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '', result, calls = 0, processing = false, ended = false, failure, modelTask;
    const controller = new AbortController();
    const stop = error => { if (failure) return; failure = error; controller.abort(); void docker(root, ['rm', '-f', name], { timeout: 10000 }).catch(() => {}); child.kill('SIGTERM'); };
    const abort = () => stop(new InstallError('実行を停止しました。'));
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => stop(new InstallError('実行時間の上限に達しました。')), seconds * 1000);
    child.stderr.on('data', () => {});
    child.stdin.on('error', () => stop(new InstallError('実行環境との接続が切れました。')));
    child.once('error', () => stop(new InstallError('実行環境を起動できません。')));
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      buffer += chunk;
      if (Buffer.byteLength(buffer) > 524288) { stop(new InstallError('Agent出力が上限を超えました。')); return; }
      let i;
      while ((i = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, i); buffer = buffer.slice(i + 1);
        let message; try { message = JSON.parse(line); } catch { stop(new InstallError('Agent出力を解釈できません。')); return; }
        if (message.type === 'probe' && probe) { result = message; continue; }
        if (message.type === 'result' && !probe && !result && !processing && !failure) { try { result = validateResult(message); } catch (e) { stop(e); } continue; }
        if (message.type !== 'model_request' || !model || probe || result || processing || failure || !/^[a-f0-9]{32}$/.test(message.id) || ++calls > LIMITS.modelCalls) { stop(new InstallError('モデル呼出回数・手順が上限を超えました。')); return; }
        processing = true;
        modelTask = (async () => {
          try { await onModel(calls); controller.signal.throwIfAborted(); const body = await model(message.body, controller.signal); if (!ended && !failure) child.stdin.write(JSON.stringify({ id: message.id, body }) + '\n'); }
          catch (e) { stop(e instanceof InstallError ? e : new InstallError('モデルを利用できません。')); if (e?.unconfirmed) failure = e; }
          finally { processing = false; }
        })();
      }
    });
    child.once('close', async code => {
      ended = true; clearTimeout(timer); controller.abort(); signal.removeEventListener('abort', abort);
      // Provider teardown must finish before a Work can claim confirmed stop.
      // A credential-owning harness can outlive the guest's Docker CLI.
      await modelTask;
      // Also reap after the CLI exits: cancellation may race container creation.
      try { await docker(root, ['rm', '-f', name], { timeout: 10000 }); }
      catch {
        try { if ((await docker(root, ['ps', '-a', '--filter', `name=^/${name}$`, '--format', '{{.Names}}'], { timeout: 5000 })).trim()) throw new Error('still present'); }
        catch { const uncertain = new InstallError('実行環境の停止を確認できません。ホスト復旧後に確認してください。'); uncertain.unconfirmed = true; failure = uncertain; }
      }
      if (failure) reject(failure);
      else if (code !== 0 || !result || buffer.trim() || processing) reject(new InstallError('Agentが正常な結果を返さずに終了しました。'));
      else if (requireModel && calls === 0 && result.exitCode === 0) reject(new InstallError('Agentがモデルを呼び出さずに終了しました。'));
      else resolve({ ...result, calls });
    });
    child.stdin.write(JSON.stringify(request) + '\n');
    if (signal.aborted) abort();
  });
}

const builds = new Map();
export async function prepareIsolatedRuntime({ root, recipe, signal }) {
  await ensureEngine(root, signal);
  const context = path.join(root, 'scripts/noah-agent-runtime');
  const dockerfile = ['cline', 'dsh', 'qwenpaw', 'cow'].includes(recipe.key) ? `Dockerfile.${recipe.key}` : 'Dockerfile';
  const inputs = recipe.key === 'cow' ? [dockerfile, 'runner.py', 'cow_sdk.py', 'cow/requirements.lock']
    : recipe.key === 'qwenpaw' ? [dockerfile, 'runner.py', 'qwenpaw_sdk.py', 'qwenpaw/requirements.lock', 'qwenpaw/build-requirements.lock']
    : recipe.key === 'dsh' ? [dockerfile, 'runner.py', 'dsh_cli.py', 'dsh/package.json', 'dsh/package-lock.json']
    : recipe.key === 'cline' ? [dockerfile, 'runner.py', 'cline_sdk.mjs', 'cline/package.json', 'cline/package-lock.json'] : [dockerfile, 'runner.py', 'nanobot_sdk.py', 'openhands_sdk.py', 'hermes_sdk.py', 'data_analysis_sdk.py', 'openfang_cli.py'];
  const sources = await Promise.all(inputs.map(file => readFile(path.join(context, file), 'utf8')));
  const fingerprint = sha256(JSON.stringify([...sources, recipe]));
  const tag = `noah/${recipe.key}:${fingerprint.slice(0, 16)}`;
  let image;
  const inspect = () => docker(root, ['image', 'inspect', tag, '--format', '{{.Id}}'], { signal, timeout: 10000 });
  try { image = (await inspect()).trim(); }
  catch {
    signal.throwIfAborted();
    const key = `${root}/${tag}`;
    if (!builds.has(key)) builds.set(key, docker(root, ['build', '-f', path.join(context, dockerfile), '--build-arg', `AGENT=${recipe.key}`, '-t', tag, context], { signal, timeout: 900000, maxOutput: 262144 }).finally(() => builds.delete(key)));
    try { await builds.get(key); image = (await inspect()).trim(); }
    catch { signal.throwIfAborted(); throw new InstallError('公式Agentの依存準備に失敗しました。再接続してください。'); }
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw new InstallError('実行器の内容を確認できません。');
  const probe = await runIsolated({ root, image, recipe, probe: true, signal });
  if (probe.agent !== recipe.key || probe.version !== recipe.version) throw new InstallError('Agent実行器の版が一致しません。');
  const selectedModel = modelFor(recipe);
  const modelHandle=await(await getNoahModelManager(root)).acquire(selectedModel,signal);
  let stopped = false; const runs = new Map();
  return {
    runtimeInfo: { name: recipe.name, version: recipe.version, reused: false, image, fingerprint },
    execution: { isolation: TERMINAL_SURFACE, recipe: recipe.key, model: selectedModel, modelSha256:modelHandle.digest, image, capability: recipe.capability, limits: limitsFor(recipe) },
    revalidate:()=>modelHandle.validate(),
    async probe() { if (stopped) throw new InstallError('接続は停止しています。'); await docker(root, ['image', 'inspect', image, '--format', '{{.Id}}'], { timeout: 5000 }); return { state: 'connected', message: `${recipe.name} ${recipe.version}を隔離環境で起動確認しました。下の依頼欄から実行できます。` }; },
    async run(prompt, runSignal, onModel) { if (stopped) throw new InstallError('再接続してください。'); const c = new AbortController(); const task = runIsolated({ root, image, recipe, prompt, signal: AbortSignal.any([c.signal, runSignal]), onModel,model:(body,s)=>localModel(body,s,fetch,selectedModel,limitsFor(recipe).outputTokens,modelHandle) }); runs.set(c, task); try { return await task; } finally { runs.delete(c); } },
    async stop() { stopped = true; for (const c of runs.keys()) c.abort(); await Promise.allSettled(runs.values());modelHandle.release(); },
  };
}
