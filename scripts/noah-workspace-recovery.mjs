import { access, realpath } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const exec = promisify(execFile);
export const defaultNoahWorkspace = '/Volumes/avokado';
export const defaultNoahImage = '/Volumes/Extreme SSD/avokado/avokado.sparsebundle';

// Never create a missing mountpoint or fall back to an empty local database.
// Mount only the existing image selected by the operator; no format/repair/prune.
export async function recoverNoahWorkspace({ workspace = defaultNoahWorkspace, image = defaultNoahImage,
  exists = async p => { try { await access(p); return true; } catch { return false; } },
  resolve = realpath, execute = exec, platform = process.platform } = {}) {
  if (!path.isAbsolute(workspace) || !path.isAbsolute(image)) throw new Error('保存先は絶対パスで指定してください。');
  const ready = () => exists(path.join(workspace, 'package.json'));
  let mounted = false;
  if (!await ready()) {
    if (platform !== 'darwin') throw new Error('保存先が未接続です。既存の作業ディスクを接続してください。');
    if (!await exists(image)) throw new Error('既存のSSDイメージが見つかりません。Extreme SSDの接続を確認してください。');
    if (await exists(workspace)) throw new Error('保存先に別の内容があります。空の環境を作らず停止しました。');
    await execute('/usr/bin/hdiutil', ['attach', image, '-nobrowse', '-mountpoint', workspace], { timeout: 120000, maxBuffer: 65536 });
    mounted = true;
  }
  if (!await ready() || !await exists(path.join(workspace, '.git')) || !await exists(path.join(workspace, 'scripts/noah-managed-installations.mjs')))
    throw new Error('Noahの既存プロジェクトを確認できません。保存先を変更せず停止しました。');
  const root = await resolve(workspace);
  return { root, mounted };
}

export function noahDevCommand(root, env = process.env) {
  return { command: 'npm', args: ['run', 'dev', '--', '--port', '3107'],
    options: { cwd: root, env: { ...env, SKY_LINUX_PRIVATE_PREVIEW: '1' }, stdio: 'inherit' } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.some(x => x !== '--check')) throw new Error('対応するオプションは --check です。保存先は NOAH_WORKSPACE / NOAH_WORKSPACE_IMAGE で指定してください。');
    const state = await recoverNoahWorkspace({ workspace: process.env.NOAH_WORKSPACE, image: process.env.NOAH_WORKSPACE_IMAGE });
    console.log(`Noah: ${state.root}${state.mounted ? '（既存ディスクを再接続）' : ''}`);
    if (!args.includes('--check')) {
      const spec = noahDevCommand(state.root), child = spawn(spec.command, spec.args, spec.options);
      for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
      child.once('error', () => { console.error('Noahを起動できません。Nodeとnpmを確認してください。'); process.exitCode = 1; });
      child.once('close', code => { process.exitCode = code ?? 1; });
    }
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
