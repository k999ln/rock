import { spawn } from 'node:child_process';
import { access, mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import { runCommand, InstallError } from './noah-source-fetch.mjs';
import { recipeFor } from './noah-execution-recipes.mjs';
import { prepareIsolatedRuntime } from './noah-isolated-runtime.mjs';
import { prepareCodexRuntime } from './noah-codex-runtime.mjs';
import { prepareAniccaRuntime } from './noah-anicca-runtime.mjs';

// Only administrator-reviewed recipes run code. Neither catalog metadata nor a
// downloaded README/package.json can supply a command or environment variable.
const CODEX_VERSION = '0.169.0';
const CODEX_INTEGRITY = 'sha512-KhzYlkKPxoNssR8CEm45IjqnFWn7UtlF4CiD3tOJPea51xBs7MaHy0UQG9GSbCqk6Lrjn5QdJDV0QD1/FgWlGw==';
const localEnv = () => Object.fromEntries(['PATH', 'HOME', 'LANG', 'TMPDIR', 'CODEX_HOME'].filter(k => process.env[k]).map(k => [k, process.env[k]]));

export function codexChannel(executable, cwd, { signal, spawnProcess = spawn } = {}) {
  signal?.throwIfAborted();
  const child = spawnProcess(executable, ['app-server', '--listen', 'stdio://'], { cwd, env: localEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
  let next = 0, buffer = '', stopped = false;
  const waiting = new Map();
  const failAll = () => { for (const p of waiting.values()) { clearTimeout(p.timer); p.reject(new InstallError('Codexとの接続が切れました。')); } waiting.clear(); };
  const stop = async () => {
    if (stopped) return; stopped = true; failAll(); signal?.removeEventListener('abort', abort);
    if (child.exitCode !== null || child.signalCode !== null) return;
    await new Promise(done => { const timer = setTimeout(() => child.kill('SIGKILL'), 2000); timer.unref(); child.once('close', () => { clearTimeout(timer); done(); }); child.stdin.end(); child.kill('SIGTERM'); });
  };
  const abort = () => { void stop(); };
  signal?.addEventListener('abort', abort, { once: true });
  child.stderr.on('data', () => {});
  child.stdin.on('error', failAll);
  child.once('error', failAll); child.once('close', () => { stopped = true; failAll(); signal?.removeEventListener('abort', abort); });
  child.stdout.on('data', chunk => {
    buffer += chunk.toString();
    if (buffer.length > 1024 * 1024) { void stop(); return; }
    let boundary;
    while ((boundary = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 1);
      let message; try { message = JSON.parse(line); } catch { void stop(); return; }
      // Reject server requests; this connection never approves tool execution,
      // starts a turn, refreshes credentials or handles external token requests.
      if (message.method && message.id !== undefined) { child.stdin.write(JSON.stringify({ id: message.id, error: { code: -32601, message: 'Connection inspection only' } }) + '\n'); continue; }
      const pending = waiting.get(message.id); if (!pending) continue;
      waiting.delete(message.id); clearTimeout(pending.timer);
      if (message.error) pending.reject(new InstallError('Codexの接続確認に失敗しました。')); else pending.resolve(message.result);
    }
  });
  const rpc = (method, params) => new Promise((resolve, reject) => {
    if (stopped) return reject(new InstallError('Codexは停止しています。'));
    const id = ++next, timer = setTimeout(() => { waiting.delete(id); reject(new InstallError('Codexの応答が時間切れです。')); void stop(); }, 15000);
    waiting.set(id, { resolve, reject, timer }); child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
  return {
    stop,
    async initialize() { await rpc('initialize', { clientInfo: { name: 'noah_local_connector', title: 'Noah Local Connector', version: '1.0.0' } }); child.stdin.write('{"method":"initialized"}\n'); },
    async probe() {
      const state = await rpc('account/read', { refreshToken: false });
      // Return no email, account IDs, tokens or plan details.
      return state?.account ? { state: 'connected', message: 'このMacのCodexと接続し、既存の認証を確認しました。推論・業務処理は開始していません。' }
        : { state: 'setup_required', message: 'Codex本体は準備できました。公式Codexで本人のログインを一度完了してから再接続してください。' };
    },
  };
}

export async function prepareCodex(directory, signal, { discoverInstalled = true } = {}) {
  const existing = discoverInstalled ? ['/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex', '/opt/homebrew/bin/codex', '/usr/local/bin/codex'] : [];
  for (const candidate of existing) {
    try { await access(candidate, constants.X_OK); const version = (await runCommand(candidate, ['--version'], { signal, env: localEnv(), timeout: 10000 })).trim(); return { executable: candidate, version, reused: true }; } catch { signal.throwIfAborted(); }
  }
  const prefix = path.join(directory, 'codex-runtime');
  await mkdir(prefix, { recursive: true, mode: 0o700 });
  const lock = path.join(prefix, 'package-lock.json');
  await writeFile(path.join(prefix, 'package.json'), JSON.stringify({ name: 'noah-codex-runtime', private: true, dependencies: { '@openai/codex': CODEX_VERSION } }));
  const userconfig = path.join(prefix, '.npmrc-user'), globalconfig = path.join(prefix, '.npmrc-global');
  await writeFile(userconfig, '', { mode: 0o600 }); await writeFile(globalconfig, '', { mode: 0o600 });
  const env = { ...localEnv(), npm_config_cache: path.join(directory, 'npm-cache'), npm_config_userconfig: userconfig, npm_config_globalconfig: globalconfig };
  await runCommand('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org'], { cwd: prefix, env, signal });
  const manifest = JSON.parse(await readFile(lock, 'utf8'));
  if (manifest.packages?.['node_modules/@openai/codex']?.integrity !== CODEX_INTEGRITY || Object.entries(manifest.packages).some(([key, p]) => key && (!p.resolved?.startsWith('https://registry.npmjs.org/@openai/codex/') || !p.integrity))) throw new InstallError('Codex配布物の内容照合情報が一致しません。');
  await runCommand('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org'], { cwd: prefix, env, signal });
  const executable = path.join(prefix, 'node_modules/.bin/codex');
  // macOS may verify the freshly downloaded native executable on first launch.
  const version = (await runCommand(executable, ['--version'], { signal, env, timeout: 60000 })).trim();
  if (version !== `codex-cli ${CODEX_VERSION}`) throw new InstallError('準備したCodexの版が一致しません。');
  return { executable, version, reused: false };
}

export async function startManagedAdapter({ plan, directory, signal, root }) {
  if (plan.adapter === 'isolated') return prepareIsolatedRuntime({ root, recipe: recipeFor(plan.agentId), signal });
  if (plan.adapter === 'source') return null;
  if (plan.adapter === 'codex') {
    const installed = await prepareCodex(directory, signal);
    return prepareCodexRuntime({ root, directory, installed, signal, recipe: recipeFor('research-adc2fb98c295eaf3fc52') });
  }
  if (plan.adapter === 'anicca') {
    const installed = await prepareCodex(directory, signal);
    return prepareAniccaRuntime({ root, directory, installed, signal });
  }
  throw new InstallError('未登録の実行方式です。');
}
