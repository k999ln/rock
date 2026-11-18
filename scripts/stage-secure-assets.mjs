import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir, rename, unlink, copyFile } from 'node:fs/promises';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function stageSecureAssets(root) {
  const client = join(root, 'dist/client'), server = join(root, 'dist/server');
  const entryFile = join(server, 'index.js');
  const entrySource = await readFile(entryFile, 'utf8');
  if (entrySource.includes('withAssetResponses(')) return;
  const entries = {};
  async function visit(folder, prefix = '') {
    for (const item of await readdir(folder, { withFileTypes: true })) {
      if (item.name.startsWith('.') || item.name === '_headers') continue;
      const relative = prefix + item.name, file = join(folder, item.name);
      if (item.isDirectory()) { await visit(file, relative + '/'); continue; }
      if (!item.isFile()) throw new Error('Unexpected asset type: ' + relative);
      const bytes = await readFile(file), hash = createHash('sha256').update(bytes).digest('hex');
      const path = '/' + relative;
      if (['.html', '.svg'].includes(extname(file)) || path === '/sw.js') {
        const types = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.js': 'application/javascript; charset=utf-8' };
        entries[path] = { body: bytes.toString('base64'), type: types[extname(file)], etag: '"' + hash + '"' };
        await unlink(file);
      } else {
        const storage = '/_site-assets/' + hash + '/' + relative;
        await mkdir(dirname(join(client, storage)), { recursive: true });
        await rename(file, join(client, storage));
        entries[path] = { storage };
      }
    }
  }
  await visit(client);
  await writeFile(join(server, 'asset-map.json'), JSON.stringify(entries));
  await writeFile(join(server, 'asset-map.mjs'), 'export default ' + JSON.stringify(entries) + ';\n');
  await copyFile(join(root, 'services/sky-web/asset-responses.mjs'), join(server, 'asset-responses.mjs'));
  await rename(entryFile, join(server, 'routed-worker.mjs'));
  await writeFile(entryFile, "import worker from './routed-worker.mjs';\nimport entries from './asset-map.mjs';\nimport {withAssetResponses} from './asset-responses.mjs';\nexport default withAssetResponses(worker, entries);\n");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await stageSecureAssets(process.cwd());
