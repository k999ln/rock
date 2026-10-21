import { copyFile, cp, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
// Keep domain-dependent routes out of the public asset lookup. Sites can serve
// matching assets before invoking the Worker, irrespective of Wrangler routing.
for (const [from, to] of [
  ['index.html', '_site-pages/home/index.html'],
  ['mini/index.html', '_site-pages/mini/index.html'],
  ['pro/index.html', '_site-pages/pro/index.html'],
  ['robots.txt', '_site-pages/robots.txt'],
  ['sitemap.xml', '_site-pages/sitemap.xml'],
]) {
  const destination = resolve(root, 'dist/client', to);
  await mkdir(resolve(destination, '..'), { recursive: true });
  await rename(resolve(root, 'dist/client', from), destination);
}
await rm(resolve(root, 'dist/server/.wrangler'), { recursive: true, force: true });
await mkdir(resolve(root, 'dist/server'), { recursive: true });
await mkdir(resolve(root, 'dist/.openai'), { recursive: true });
await rm(resolve(root, 'dist/.openai/drizzle'), { recursive: true, force: true });
await cp(resolve(root, 'drizzle'), resolve(root, 'dist/.openai/drizzle'), { recursive: true });
await cp(resolve(root, 'worker'), resolve(root, 'dist/server'), { recursive: true });
await copyFile(resolve(root, '.openai/hosting.json'), resolve(root, 'dist/.openai/hosting.json'));
await writeFile(resolve(root, 'dist/server/wrangler.json'), JSON.stringify({
  main: 'index.js',
  compatibility_date: '2026-08-18',
  assets: { directory: '../client', binding: 'ASSETS', run_worker_first: true },
  d1_databases: [{ binding: 'DB', database_name: 'site-creator-d1', database_id: '00000000-0000-4000-8000-000000000000' }],
}, null, 2) + '\n');
