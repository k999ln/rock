import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm, readdir, lstat } from 'node:fs/promises';
import { createWriteStream, createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import path from 'node:path';
import { recipeFor } from './noah-execution-recipes.mjs';

export const ANICCA_PIN = '28e7f3f333474f18b5da51acfe18b063cf727ad0';
export class InstallError extends Error {
  constructor(message, status = 409) { super(message); this.status = status; }
}
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const LIMIT = 256 * 1024 * 1024;
export function sourcePlan(entry) {
  if (!['agent', 'candidate'].includes(entry.kind)) return { type: 'unavailable', reason: 'これは関連資産です。単独Agentとしての導入対象ではありません。' };
  if (entry.id === 'anicca') return { type: 'git', url: 'https://github.com/Daisuke134/anicca.git', pin: ANICCA_PIN, adapter: 'anicca' };
  if (entry.id === 'research-adc2fb98c295eaf3fc52') return { type: 'git', url: 'https://github.com/openai/codex.git', adapter: 'codex' };
  const recipe = recipeFor(entry.id);
  if (recipe?.artifact) return { type: 'artifact', ...recipe.artifact, version: recipe.version, adapter: 'isolated', agentId: entry.id };
  if (recipe) return { type: 'git', url: recipe.source, ...(recipe.sourcePin ? { pin: recipe.sourcePin } : {}), adapter: 'isolated', agentId: entry.id };
  if (entry.identity === 'name_group') return { type: 'unavailable', reason: '配布元を特定できていません。同名の別Agentを取り寄せないよう、提供元の確認が必要です。' };
  for (const source of entry.sources || []) {
    if (source.type !== 'primary') continue;
    let url; try { url = new URL(source.url); } catch { continue; }
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.search || url.hash) continue;
    const github = url.hostname === 'github.com' && /^\/([a-z0-9-]+)\/([a-z0-9_.-]+)\/?$/i.exec(url.pathname);
    const hf = url.hostname === 'huggingface.co' && /^\/spaces\/([a-z0-9_-]+)\/([a-z0-9_.-]+)\/?$/i.exec(url.pathname);
    const match = github || hf;
    if (!match || ['.', '..'].includes(match[2])) continue;
    const repo = match[2].replace(/\.git$/, '');
    return { type: 'git', url: `https://${url.hostname}/${hf ? 'spaces/' : ''}${match[1]}/${repo}.git`, adapter: 'source' };
  }
  return { type: 'unavailable', reason: 'この登録には本体の配布先がありません。提供元の配布・接続仕様と利用条件の確認が必要です。' };
}

export async function directoryBytes(directory) {
  let total = 0;
  for (const ent of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const target = path.join(directory, ent.name);
    if (ent.isSymbolicLink()) throw new InstallError('保存領域のリンクを検出しました。');
    total += ent.isDirectory() ? await directoryBytes(target) : (await lstat(target)).size;
  }
  return total;
}
// No shell, hooks, global Git settings, credential helpers, SSH, submodules or
// LFS download. Public repositories are data until a reviewed adapter handles them.
export function gitEnvironment() {
  return { PATH: process.env.PATH, LANG: 'C', HOME: '/var/empty', GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0',
    GIT_ALLOW_PROTOCOL: 'https', GIT_LFS_SKIP_SMUDGE: '1' };
}
export function runCommand(command, args, { cwd, signal, env = gitEnvironment(), timeout = 180000, maxOutput = 1024 * 1024 } = {}) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    const chunks = []; let size = 0, reason, killTimer, killing = false;
    const kill = () => { if (killing) return; killing = true;
      try { if (process.platform === 'win32') child.kill('SIGTERM'); else if (child.pid) process.kill(-Number(child.pid), 'SIGTERM'); } catch { /* already stopped */ }
      killTimer = setTimeout(() => { if (child.exitCode !== null || child.signalCode !== null) return;
        try { if (process.platform === 'win32') child.kill('SIGKILL'); else if (child.pid) process.kill(-Number(child.pid), 'SIGKILL'); } catch { /* stopped */ } }, 2000); killTimer.unref(); };
    const abort = () => { reason = signal.reason || new InstallError('取り寄せを中止しました。'); kill(); };
    const timer = setTimeout(() => { reason = new InstallError('取り寄せが時間切れです。再試行してください。'); kill(); }, timeout);
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', c => { size += c.length; if (size > maxOutput) { reason = new InstallError('配布物の情報量が上限を超えています。'); kill(); } else chunks.push(c); });
    child.stderr.on('data', () => {}); // Never expose process output/credentials to the browser.
    const cleanup = () => { clearTimeout(timer); clearTimeout(killTimer); signal?.removeEventListener('abort', abort); };
    child.once('error', () => { cleanup(); reject(new InstallError('必要な実行プログラムを起動できません。')); });
    child.once('close', code => { cleanup(); if (reason || code !== 0) reject(reason || new InstallError('配布物を取得・確認できません。公開範囲と通信を確認してください。')); else resolve(Buffer.concat(chunks).toString('utf8')); });
  });
}
const gitArgs = args => ['-c', 'core.hooksPath=/dev/null', '-c', 'credential.helper=', '-c', 'http.followRedirects=false', ...args];
export const runGit = (args, options) => runCommand('git', gitArgs(args), options);
async function hashFile(file) { const hash = createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest('hex'); }

// Release artifacts are never unpacked or executed on the host. Only the pinned
// recipe may select the URL; redirects must stay on official distribution hosts.
const ARTIFACT_HOSTS = new Set(['github.com', 'codeload.github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com', 'registry.npmjs.org', 'files.pythonhosted.org']);
export async function downloadArtifact({ url, sha256: expected, destination, signal, fetcher = fetch, limit = LIMIT }) {
  if (!/^[a-f0-9]{64}$/.test(expected)) throw new InstallError('配布物のハッシュを確認できません。');
  let current = new URL(url), response;
  for (let redirects = 0; redirects <= 3; redirects++) {
    signal?.throwIfAborted();
    if (current.protocol !== 'https:' || current.port || current.username || current.password || !ARTIFACT_HOSTS.has(current.hostname)) throw new InstallError('配布物の転送先が許可されていません。');
    response = await fetcher(current, { redirect: 'manual', signal, credentials: 'omit', headers: { Accept: 'application/octet-stream' } });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (!location || redirects === 3) throw new InstallError('配布物の転送を確認できません。');
    current = new URL(location, current);
  }
  if (!response.ok || !response.body) { await response.body?.cancel(); throw new InstallError('配布物を取得できません。'); }
  if (Number(response.headers.get('content-length')) > limit) { await response.body.cancel(); throw new InstallError('配布物が取得容量の上限を超えています。'); }
  let bytes = 0, created = false; const hash = createHash('sha256');
  const output = createWriteStream(destination, { flags: 'wx', mode: 0o600 });
  output.once('open', () => { created = true; });
  try {
    await pipeline(response.body, new Transform({ transform(chunk, _encoding, done) {
      bytes += chunk.length;
      if (bytes > limit) return done(new InstallError('配布物が取得容量の上限を超えています。'));
      hash.update(chunk); done(null, chunk);
    } }), output, { signal });
    if (!bytes || hash.digest('hex') !== expected) throw new InstallError('配布物のハッシュが固定版と一致しません。');
    return bytes;
  } catch (error) { if (created) await rm(destination, { force: true }); throw error; }
}

async function acquireArtifact({ plan, directory, signal, progress }) {
  const recipe = recipeFor(plan.agentId);
  if (!recipe?.artifact || plan.url !== recipe.artifact.url || plan.sha256 !== recipe.artifact.sha256 || plan.version !== recipe.version) throw new InstallError('確認済みの配布版ではありません。');
  signal?.throwIfAborted();
  const final = path.join(directory, 'runtime-source'), receiptFile = path.join(final, 'receipt.json');
  try {
    const old = JSON.parse(await readFile(receiptFile, 'utf8'));
    if (old.url !== plan.url || old.commit !== plan.version || old.sha256 !== plan.sha256 || await hashFile(path.join(final, 'artifact')) !== plan.sha256) throw new InstallError('保存した配布物が固定版と一致しません。削除して取り寄せ直してください。');
    return old;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const staging = path.join(directory, `.fetch-${randomUUID()}`);
  await mkdir(staging, { mode: 0o700 });
  const combined = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(180000)]);
  try {
    await progress('fetching', '公式の配布済みプログラムを取り寄せ、固定版のハッシュを検証しています。');
    const bytes = await downloadArtifact({ ...plan, destination: path.join(staging, 'artifact'), signal: combined });
    combined.throwIfAborted();
    const receipt = { kind: 'artifact', url: plan.url, commit: plan.version, sha256: plan.sha256, bytes, detected: [recipe.package], receivedAt: new Date().toISOString() };
    await writeFile(path.join(staging, 'receipt.json'), JSON.stringify(receipt), { mode: 0o600 });
    await rename(staging, final);
    return receipt;
  } finally { await rm(staging, { recursive: true, force: true }); }
}

export async function acquireSource({ plan, directory, signal, progress = async () => {} }) {
  if (plan.type === 'artifact') return acquireArtifact({ plan, directory, signal, progress });
  if (plan.type !== 'git' || !/^https:\/\/(github\.com\/[a-z0-9-]+|huggingface\.co\/spaces\/[a-z0-9_-]+)\/[a-z0-9_.-]+\.git$/i.test(plan.url)) throw new InstallError('配布元が確認できません。');
  const final = path.join(directory, 'source'), receiptFile = path.join(final, 'receipt.json');
  try {
    const old = JSON.parse(await readFile(receiptFile, 'utf8'));
    if (!matchesSourceReceipt(plan, old) || !/^[a-f0-9]{40}$/.test(old.commit) || await hashFile(path.join(final, 'source.tar')) !== old.sha256) throw new InstallError('保存した本体の内容が一致しません。削除して取り寄せ直してください。');
    await runGit(['--git-dir', path.join(final, 'repo.git'), 'fsck', '--no-reflogs'], { signal });
    return old;
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const staging = path.join(directory, `.fetch-${randomUUID()}`), bare = path.join(staging, 'repo.git');
  await mkdir(staging, { mode: 0o700 });
  const controller = new AbortController();
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  let measuring = false;
  const monitor = setInterval(async () => {
    if (measuring) return; measuring = true;
    try { if (await directoryBytes(bare) > LIMIT) controller.abort(new InstallError('本体が256MiBを超えています。この実行先には取り寄せできません。')); }
    catch (e) { controller.abort(e); } finally { measuring = false; }
  }, 250);
  const deadline = setTimeout(() => controller.abort(new InstallError('本体の取得が3分で完了しませんでした。')), 180000);
  try {
    await progress('fetching', '登録された配布元からAgent本体を取り寄せています。');
    const options = { signal: combined };
    await runGit(['init', '--bare', '--template=', bare], options);
    await runGit(['--git-dir', bare, 'fetch', '--depth=1', '--no-tags', '--no-recurse-submodules', plan.url, plan.pin || 'HEAD'], options);
    if (await directoryBytes(bare) > LIMIT) throw new InstallError('本体が256MiBの上限を超えています。');
    const commit = (await runGit(['--git-dir', bare, 'rev-parse', 'FETCH_HEAD^{commit}'], options)).trim();
    if (!/^[a-f0-9]{40}$/.test(commit) || (plan.pin && commit !== plan.pin)) throw new InstallError('配布版が一致しません。');
    await runGit(['--git-dir', bare, 'fsck', '--no-reflogs'], options);
    const tree = await runGit(['--git-dir', bare, 'ls-tree', '-r', '--name-only', commit], { ...options, maxOutput: 4 * 1024 * 1024 });
    const files = tree.split('\n');
    const detected = ['Dockerfile', 'docker-compose.yml', 'compose.yaml', 'pyproject.toml', 'requirements.txt', 'package.json', 'SKILL.md', 'README.md'].filter(f => files.includes(f));
    const archive = path.join(staging, 'source.tar');
    const child = spawn('git', gitArgs(['--git-dir', bare, 'archive', '--format=tar', commit]), { env: gitEnvironment(), stdio: ['ignore', 'pipe', 'ignore'], signal: combined });
    let size = 0; const hash = createHash('sha256');
    const exited = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => code === 0 ? resolve() : reject(new InstallError('配布物の保存に失敗しました。'))); });
    const transfer = pipeline(child.stdout, new Transform({ transform(chunk, _encoding, done) {
      size += chunk.length; if (size > LIMIT) return done(new InstallError('展開前の本体が256MiBを超えています。'));
      hash.update(chunk); done(null, chunk);
    } }), createWriteStream(archive, { flags: 'wx', mode: 0o600 }), { signal: combined });
    try { await Promise.all([exited, transfer]); } catch (e) { child.kill('SIGKILL'); await Promise.allSettled([exited, transfer]); throw e; }
    combined.throwIfAborted();
    const receipt = { url: plan.url, commit, sha256: hash.digest('hex'), bytes: size, detected, receivedAt: new Date().toISOString() };
    await writeFile(path.join(staging, 'receipt.json'), JSON.stringify(receipt), { mode: 0o600 });
    await rename(staging, final);
    return receipt;
  } finally { clearInterval(monitor); clearTimeout(deadline); await rm(staging, { recursive: true, force: true }); }
}

export function matchesSourceReceipt(plan, receipt) {
  // One verified upstream rename at one immutable commit. Preserve the original
  // receipt; do not generalize redirects or reuse a different source/version.
  const renamed = plan.adapter === 'anicca' && plan.pin === ANICCA_PIN &&
    plan.url === 'https://github.com/Daisuke134/anicca.git' && receipt.url === 'https://github.com/Daisuke134/life-manager.git';
  return (receipt.url === plan.url || renamed) && (!plan.pin || receipt.commit === plan.pin);
}
