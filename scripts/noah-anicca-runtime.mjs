import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ANICCA_PIN, InstallError, runCommand, runGit, sha256 } from './noah-source-fetch.mjs';
import { containerArgs, engineSocket, ensureEngine, runIsolatedProtocol } from './noah-isolated-runtime.mjs';
import { prepareCodexRuntime, runCodexStructured } from './noah-codex-runtime.mjs';
import { VALIDATION_IMAGES } from './noah-project-validation.mjs';
import { recipeFor } from '../lib/noah-execution-contract.mjs';

export const ANICCA_RUNNER_SHA256 = '1d986a52721c60ac344eef17e4f97b844f415e72c499c6079fcbf15b1635a204';
const asset = name => fileURLToPath(new URL(`./noah-agent-runtime/${name}`, import.meta.url));
const schema = JSON.parse(await readFile(asset('anicca-schema.json'), 'utf8'));
const SHIM = '#!/usr/local/bin/python3\nimport os,sys\nos.execv(sys.executable,[sys.executable,"/opt/noah/adapter.py","--codex-transport",*sys.argv[1:]])\n';
const DOCKERFILE = `FROM ${VALIDATION_IMAGES.python}\nADD official.tar /opt/anicca/\nCOPY adapter.py schema.json codex-transport /opt/noah/\nRUN chmod 0555 /opt/noah/codex-transport\n`;

export function validateAniccaResponse(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 16384) throw new InstallError('Aniccaの応答が上限を超えました。');
  let value; try { value = JSON.parse(text); } catch { throw new InstallError('Aniccaの構造化された応答を確認できません。'); }
  if (!value || Object.keys(value).sort().join(',') !== 'answer,limitations,next_steps' || typeof value.answer !== 'string' || !value.answer.trim() ||
    ['next_steps', 'limitations'].some(k => !Array.isArray(value[k]) || value[k].length > 20 || value[k].some(v => typeof v !== 'string')))
    throw new InstallError('Aniccaの成果が指定した形式に一致しません。');
  return value;
}

export function aniccaContainerArgs(image) {
  const args = containerArgs(`noah-anicca-${randomUUID()}`, image);
  args.splice(args.length - 1, 0, '--workdir', '/workspace', '--env', 'HOME=/home/agent', '--env', 'PYTHONDONTWRITEBYTECODE=1',
    '--env', 'DISPLAY=', '--env', 'WAYLAND_DISPLAY=', '--env', 'DBUS_SESSION_BUS_ADDRESS=', '--env', 'XAUTHORITY=', '--entrypoint', 'python');
  return [...args, '-I', '-u', '/opt/noah/adapter.py'];
}

export async function buildAniccaRuntime({ root, directory, signal }) {
  await ensureEngine(root, signal);
  const parent = path.join(directory, 'isolated-build'); await mkdir(parent, { recursive: true, mode: 0o700 });
  const context = await mkdtemp(path.join(parent, 'anicca-'));
  const docker = (args, options = {}) => runCommand('docker', ['--host', engineSocket(root), ...args], { signal, ...options });
  try {
    const bare = path.join(directory, 'source/repo.git');
    const runner = await runGit(['--git-dir', bare, 'show', `${ANICCA_PIN}:runtime/agent-runner/agent_runner.py`], { signal, maxOutput: 262144 });
    if (sha256(runner) !== ANICCA_RUNNER_SHA256) throw new InstallError('Aniccaの公式実行器を固定版に照合できません。');
    // Regenerate from the pinned Git objects, not an untrusted archive receipt.
    // Only runtime modules enter the image. No host checkout or install script.
    await runGit(['--git-dir', bare, 'archive', '--format=tar', '--output', path.join(context, 'official.tar'), ANICCA_PIN,
      'runtime/agent-runner', 'runtime/host', 'runtime/loop', 'LICENSE'], { signal });
    const adapter = await readFile(asset('anicca_transport.py'));
    const schemaBytes = await readFile(asset('anicca-schema.json'));
    const fingerprint = sha256(Buffer.concat([await readFile(path.join(context, 'official.tar')), adapter, schemaBytes, Buffer.from(DOCKERFILE + SHIM)]));
    await writeFile(path.join(context, 'Dockerfile'), DOCKERFILE);
    await writeFile(path.join(context, 'adapter.py'), adapter);
    await writeFile(path.join(context, 'schema.json'), schemaBytes);
    await writeFile(path.join(context, 'codex-transport'), SHIM);
    const tag = `noah/anicca:${fingerprint.slice(0, 24)}`;
    let image;
    try { image = (await docker(['image', 'inspect', tag, '--format', '{{.Id}}'])).trim(); }
    catch { signal.throwIfAborted(); await docker(['build', '--network=none', '-t', tag, context], { timeout: 180000, maxOutput: 131072 }); image = (await docker(['image', 'inspect', tag, '--format', '{{.Id}}'])).trim(); }
    if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw new InstallError('Aniccaの隔離imageを確認できません。');
    return image;
  } finally { await rm(context, { recursive: true, force: true }); }
}

export async function runAnicca({ root, image, model, prompt, signal, onModel = async () => {}, ...codex }, { protocol = runIsolatedProtocol, structured = runCodexStructured } = {}) {
  if (typeof prompt !== 'string' || prompt.trim().length < 16 || Buffer.byteLength(prompt) > 12000) throw new InstallError('Aniccaへの依頼は16文字以上で具体的に入力してください。', 400);
  let turns = 0;
  return protocol({ root, args: aniccaContainerArgs(image), request: { schema: 'noah-anicca/1', prompt, model }, signal,
    requireModel: true, seconds: 240,
    model: async (body, providerSignal) => {
      if (!body || Object.keys(body).sort().join(',') !== 'model,prompt' || body.prompt !== prompt || body.model !== model || ++turns !== 1) throw new InstallError('Aniccaの依頼回数・内容を照合できません。');
      const response = await structured({ ...codex, model, prompt, signal: providerSignal, onModel }, schema);
      validateAniccaResponse(response.text);
      return { text: response.text };
    } });
}

export async function prepareAniccaRuntime(options) {
  const image = await buildAniccaRuntime(options);
  return prepareCodexRuntime({ ...options, recipe: recipeFor('anicca'), runtimeImage: image, execute: runAnicca });
}
