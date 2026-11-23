import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { InstallError, runCommand, sha256 } from './noah-source-fetch.mjs';
import { engineSocket } from './noah-isolated-runtime.mjs';

// Only this repository-owned image can supply the display. A manifest cannot
// choose an image, mount a host window server or change the display command.
export async function prepareDesktopImage(root, signal) {
  const context = path.join(root, 'scripts/noah-agent-runtime');
  const files = await Promise.all(['Dockerfile.desktop', 'desktop_runner.py', 'desktop_session.py', 'noah_desktop.py'].map(n => readFile(path.join(context, n))));
  const tag = 'noah/desktop:' + sha256(Buffer.concat(files)).slice(0, 16);
  const docker = (args, options = {}) => runCommand('docker', ['--host', engineSocket(root), ...args], { signal, ...options });
  const inspect = () => docker(['image', 'inspect', tag, '--format', '{{.Id}}']);
  let image;
  try { image = (await inspect()).trim(); }
  catch {
    signal.throwIfAborted();
    await docker(['build', '-f', path.join(context, 'Dockerfile.desktop'), '-t', tag, context], { timeout: 900000, maxOutput: 262144 });
    image = (await inspect()).trim();
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw new InstallError('専用画面の実行imageを確認できません。');
  return image;
}
