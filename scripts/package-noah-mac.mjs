import { build } from 'esbuild';
import { createRequire } from 'node:module';
import {
  mkdir,
  readFile,
  writeFile,
  cp,
  readdir,
  lstat,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(
  process.argv[process.argv.indexOf('--out') + 1] || 'work/noah-mac-package',
);
if (!process.argv.includes('--out') || output === root)
  throw new Error('Use --out with a new output directory.');
await mkdir(output, { recursive: true });
const stage = path.join(output, 'Noah-Mac');
await mkdir(stage);
await build({
  entryPoints: [path.join(root, 'scripts/noah-mac-runner.mjs')],
  outfile: path.join(stage, 'scripts/noah-mac-runner.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  banner: {
    js: "import { createRequire as noahCreateRequire } from 'node:module'; const require=noahCreateRequire(import.meta.url); const __filename=import.meta.filename; const __dirname=import.meta.dirname;",
  },
  legalComments: 'eof',
});
await cp(
  path.join(root, 'scripts/noah-agent-runtime'),
  path.join(stage, 'scripts/noah-agent-runtime'),
  {
    recursive: true,
    filter: (p) => !p.includes('node_modules') && !p.includes('__pycache__'),
  },
);
const tsdir = path.dirname(
  createRequire(import.meta.url).resolve('typescript'),
);
for (const file of await readdir(tsdir))
  if (/^lib.*\.d\.ts$/.test(file))
    await cp(path.join(tsdir, file), path.join(stage, 'scripts', file));
await cp(
  path.join(path.dirname(tsdir), 'LICENSE.txt'),
  path.join(stage, 'TypeScript-LICENSE.txt'),
);
await cp(
  path.join(root, 'scripts/noah-mac-install.mjs'),
  path.join(stage, 'install.mjs'),
);
await writeFile(
  path.join(stage, 'Install.command'),
  `#!/bin/zsh\nset -eu\ncd -- "$(dirname -- "$0")"\nexport PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"\nif ! command -v node >/dev/null; then\n  echo 'Node.js 24以上が必要です。https://nodejs.org/en/download からインストールして再実行してください。'\n  read '?Enterで閉じる'\n  exit 1\nfi\nnode install.mjs\nread '?Enterで閉じる'\n`,
  { mode: 0o755 },
);
await writeFile(
  path.join(stage, 'README.txt'),
  'Noah Mac preview\nApple Silicon / macOS. Node.js 24+, Colima, Docker CLI, Ollama and Git are required.\nInstall.command installs only into your account. It does not log in or start jobs.\nThen use noah pair and noah start. Control jobs from https://avoado.si/noah/launch.\nInitial login and runtime installation require your own action.\nThis preview has not yet passed acceptance on a second Mac.\n',
);
const files = {};
async function walk(dir) {
  for (const name of (await readdir(dir)).sort()) {
    const p = path.join(dir, name),
      s = await lstat(p);
    if (s.isSymbolicLink()) throw new Error('No symlinks in distribution');
    if (s.isDirectory()) await walk(p);
    else
      files[path.relative(stage, p)] = createHash('sha256')
        .update(await readFile(p))
        .digest('hex');
  }
}
await walk(stage);
await writeFile(
  path.join(stage, 'manifest.json'),
  JSON.stringify(
    { schema: 'noah-mac-distribution/1', platform: 'darwin-arm64', files },
    null,
    2,
  ) + '\n',
);
const archive = path.join(output, 'Noah-Mac.zip');
execFileSync('/usr/bin/ditto', ['-c', '-k', '--keepParent', stage, archive]);
const sha256 = createHash('sha256')
  .update(await readFile(archive))
  .digest('hex');
await writeFile(archive + '.sha256', sha256 + '  Noah-Mac.zip\n');
console.log(
  JSON.stringify({ archive, sha256, files: Object.keys(files).length }),
);
