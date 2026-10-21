import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Inspect the index: ignored build outputs on disk are expected after verification.
// Keep archive work/, reviewed public downloads and native Tool fixtures in Git.
const generated = /^(?:(?:node_modules|dist|out|outputs|work|coverage|\.next|\.vinext|\.wrangler)\/|sites\/[^/]+\/(?:dist|node_modules|\.astro|\.wrangler)\/|services\/[^/]+\/(?:work|node_modules|\.wrangler)\/)/;
const paths = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0').filter(Boolean);
const unexpected = paths.filter(path => generated.test(path));
if (unexpected.length) {
  console.error(`repository hygiene: ${unexpected.length} generated files are tracked. Remove them from the index; rebuild locally.`);
  console.error(unexpected.slice(0, 20).join('\n'));
  process.exitCode = 1;
} else {
  console.log('repository hygiene: no tracked build output or service scratch directories');
}
