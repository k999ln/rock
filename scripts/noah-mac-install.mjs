import path from 'node:path';
import os from 'node:os';
import { readFile, writeFile, mkdir, cp, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function installMacRunner({
  source,
  target = path.join(os.homedir(), 'Library/Application Support/Noah/runner'),
  platform = process.platform,
  arch = process.arch,
}) {
  if (
    platform !== 'darwin' ||
    arch !== 'arm64' ||
    Number(process.versions.node.split('.')[0]) < 24
  )
    throw new Error('Apple Silicon MacとNode.js 24以上が必要です。');
  source = path.resolve(source);
  target = path.resolve(target);
  if (
    target.split('').some((c) => c.charCodeAt(0) < 32) ||
    source === target ||
    target.startsWith(source + path.sep)
  )
    throw new Error('別の保存先を指定してください。');
  const raw = await readFile(path.join(source, 'manifest.json')),
    manifest = JSON.parse(raw);
  if (
    manifest.schema !== 'noah-mac-distribution/1' ||
    manifest.platform !== 'darwin-arm64' ||
    !manifest.files ||
    typeof manifest.files !== 'object'
  )
    throw new Error('配布形式を確認できません。');
  if (!manifest.files['scripts/noah-mac-runner.mjs'])
    throw new Error('実行器がありません。');
  // Verify every payload file before writing; neither source code nor a symlink selects a destination.
  const verified = new Map();
  for (const [name, hash] of Object.entries(manifest.files)) {
    if (
      !/^[a-zA-Z0-9_./-]+$/.test(name) ||
      name.startsWith('/') ||
      name.split('/').some((p) => !p || p === '.' || p === '..') ||
      !/^[a-f0-9]{64}$/.test(hash)
    )
      throw new Error('配布ファイル名が不正です。');
    let p = source;
    for (const part of name.split('/')) {
      p = path.join(p, part);
      if ((await lstat(p)).isSymbolicLink())
        throw new Error('配布物にリンクを含めることはできません。');
    }
    const bytes = await readFile(p);
    if (
      !(await lstat(p)).isFile() ||
      createHash('sha256').update(bytes).digest('hex') !== hash
    )
      throw new Error('配布ファイルのhashが一致しません。');
    verified.set(name, bytes);
  }
  const version = createHash('sha256').update(raw).digest('hex').slice(0, 16),
    release = path.join(target, 'versions', version);
  await mkdir(release, { recursive: true, mode: 0o700 });
  for (const name of Object.keys(manifest.files)) {
    const dest = path.join(release, name);
    await mkdir(path.dirname(dest), { recursive: true, mode: 0o700 });
    await writeFile(dest, verified.get(name), { mode: 0o600 });
  }
  // Runtime assets are private copies, independent of the repository and external SSD.
  await mkdir(path.join(target, 'scripts'), { recursive: true, mode: 0o700 });
  await cp(
    path.join(release, 'scripts/noah-agent-runtime'),
    path.join(target, 'scripts/noah-agent-runtime'),
    { recursive: true },
  );
  const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'",
    bin = path.join(target, 'noah');
  await writeFile(
    bin,
    `#!/bin/zsh\nset -eu\nexport PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"\nexport NOAH_RUNNER_HOME=${quote(target)}\nexec ${quote(process.execPath)} ${quote(path.join(release, 'scripts/noah-mac-runner.mjs'))} "$@"\n`,
    { mode: 0o700 },
  );
  return { target, bin, version };
}
if (
  process.argv[1] &&
  ['noah-mac-install.mjs', 'install.mjs'].includes(
    path.basename(process.argv[1]),
  ) &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const i = process.argv.indexOf('--root');
  installMacRunner({
    source: path.dirname(fileURLToPath(import.meta.url)),
    ...(i >= 0 ? { target: process.argv[i + 1] } : {}),
  })
    .then((result) => {
      console.log(
        `Noahを保存しました: ${result.target}\n次の順に実行してください:\n"${result.bin}" doctor\n"${result.bin}" pair\n"${result.bin}" start\n依頼・停止: https://avoado.si/noah/launch`,
      );
    })
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    });
}
