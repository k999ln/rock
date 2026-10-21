import { build } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(process.argv[2] || join(root, 'work/sky-linux-pixel-package'));
await mkdir(join(out, 'ui'), { recursive: true });
await mkdir(join(out, 'toolkits/sky-linux-local'), { recursive: true });
await build({ absWorkingDir: root, entryPoints: ['toolkits/sky-linux-local/pixel-client.tsx'], bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic', minify: true,
  outfile: join(out, 'ui/app.js'), alias: { '@': root }, define: { 'process.env.NODE_ENV': '"production"' } });
await build({ absWorkingDir: root, entryPoints: ['toolkits/sky-linux-local/pixel-server.mjs'], bundle: true, platform: 'node', format: 'esm', target: 'node22', outfile: join(out, 'server.mjs') });
await writeFile(join(out, 'ui/index.html'), '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Sky — このPixelで使う</title><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script></html>');
for (const name of ['worker.py', 'runtime-lock.json', 'prepare-pixel.py', 'node-lock.json', 'models.json', 'android-bridge.py', 'install-android-bridge.py']) await copyFile(join(root, 'toolkits/sky-linux-local', name), join(out, 'toolkits/sky-linux-local', name));
await copyFile(join(root, 'toolkits/sky-linux-local/pixel-bootstrap.py'), join(out, 'bootstrap.py'));
// One-time reviewed service setup travels with the owner package, separate from the running app.
await copyFile(join(root, 'toolkits/sky-linux-local/install-startup.py'), join(out, 'install-startup.py'));
await copyFile(join(root, 'toolkits/sky-linux-local/update-pixel.py'), join(out, 'update-pixel.py'));
const paths = ['server.mjs', 'ui/index.html', 'ui/app.js', 'ui/app.css', 'toolkits/sky-linux-local/worker.py', 'toolkits/sky-linux-local/runtime-lock.json', 'toolkits/sky-linux-local/prepare-pixel.py', 'toolkits/sky-linux-local/node-lock.json', 'toolkits/sky-linux-local/models.json'];
const files = {};
paths.push('toolkits/sky-linux-local/android-bridge.py', 'toolkits/sky-linux-local/install-android-bridge.py');
for (const path of paths) files[path] = createHash('sha256').update(await readFile(join(out, path))).digest('hex');
await writeFile(join(out, 'package-manifest.json'), JSON.stringify({ schema: 'sky.pixel-linux-package/1', files }, null, 2));
console.log('Pixel用の本人用Skyを作成しました。配布・実機受入は別です。');
