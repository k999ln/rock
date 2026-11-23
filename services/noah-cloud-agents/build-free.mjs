import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
const directory = dirname(fileURLToPath(import.meta.url));
const versions = { 'server-memory': '2.2.1', 'server-sequential-thinking': '2.2.0', 'server-filesystem': '2.4.0' };
export const officialPackaging = { name: 'official-manifest-version', setup(b) {
  b.onLoad({ filter: /server-(memory|sequential-thinking|filesystem)\/dist\/version\.js$/ }, async args => {
    const manifest = JSON.parse(await readFile(resolve(args.path, '../../package.json'), 'utf8'));
    if (versions[manifest.name.split('/')[1]] !== manifest.version) throw Error('Unreviewed official package version');
    // Packaging adapter only: the published module dynamically requires package.json.
    return { contents: `export const SERVER_VERSION = ${JSON.stringify(manifest.version)};`, loader: 'js' };
  });
} };
export async function buildFree(options = {}) {
  return build({ absWorkingDir: directory, entryPoints: ['free-worker.mjs'], bundle: true, format: 'esm', platform: 'node', conditions: ['workerd'], external: ['cloudflare:workers'], minify: true, define: { 'process.env.DISABLE_THOUGHT_LOGGING': '"true"', 'import.meta.url': '"file:///bundle/free-worker.mjs"' }, plugins: [officialPackaging], ...options });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = resolve(directory, 'dist/free-worker.mjs');
  await buildFree({ outfile: output });
  const compressed = gzipSync(await readFile(output)).length;
  if (compressed > 3 * 1024 * 1024) throw Error('Worker exceeds the project gzip packaging budget');
  console.log(`Official MCP Worker built (${compressed} gzip bytes)`);
}
