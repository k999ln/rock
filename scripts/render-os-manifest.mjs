import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal', '--', 'android', 'contracts', 'os', 'scripts'], { cwd: root, encoding: 'utf8' }).trim();
if (dirty) throw new Error('Commit the OS sources before generating a revision-pinned manifest.');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Invalid source revision.');
process.stdout.write(`<?xml version="1.0" encoding="UTF-8"?>
<manifest>
  <remote name="rock" fetch="https://github.com/" />
  <project name="k999ln/rock" path="device/rock" remote="rock" revision="${revision}" />
</manifest>
`);
