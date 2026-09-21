import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
await rm(resolve(root, 'dist/server/.wrangler'), { recursive: true, force: true });
await mkdir(resolve(root, 'dist/server'), { recursive: true });
await mkdir(resolve(root, 'dist/.openai'), { recursive: true });
await copyFile(resolve(root, 'worker/index.js'), resolve(root, 'dist/server/index.js'));
await copyFile(resolve(root, '.openai/hosting.json'), resolve(root, 'dist/.openai/hosting.json'));
await writeFile(resolve(root, 'dist/server/wrangler.json'), JSON.stringify({
  main: 'index.js',
  compatibility_date: '2026-08-18',
  assets: { directory: '../client', binding: 'ASSETS', run_worker_first: ['/api/*'] },
  d1_databases: [{ binding: 'DB', database_name: 'site-creator-d1', database_id: '00000000-0000-4000-8000-000000000000' }],
}, null, 2) + '\n');
