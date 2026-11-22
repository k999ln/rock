import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnector } from '../sky-mcp-connector/server.mjs';
import { jobStore, stageFile, site } from './jobs.mjs';
import { launchProfile } from './browser.mjs';
import { stateDirectory } from './server.mjs';

process.umask(0o077);
const root = stateDirectory();
await mkdir(root, { recursive: true, mode: 0o700 });
const [command, file] = process.argv.slice(2);
if (command === 'stage' && file) {
  console.log(JSON.stringify(await stageFile(root, file), null, 2));
} else if (command === 'reconcile') {
  const store = await jobStore(root);
  try {
    console.log(store.reconcile(file, process.argv[4]).message);
  } finally {
    store.close();
  }
} else if (command === 'login') {
  const browser = await launchProfile(root, true);
  try {
    const page = browser.pages()[0] ?? (await browser.newPage());
    await page.goto(site + '/login');
    console.log(
      'この専用ウィンドウでログインを済ませ、ウィンドウを閉じてください。',
    );
    await once(browser, 'close');
  } finally {
    await browser.close();
  }
} else if (command === 'start') {
  const directory = await mkdtemp(join(tmpdir(), 'noah-coconala-'));
  const registryPath = fileURLToPath(
    new URL('./registry.json', import.meta.url),
  );
  const origin = file ?? 'https://avoado.si';
  if (
    ![
      'https://avoado.si',
      'http://127.0.0.1:3000',
      'http://localhost:3000',
    ].includes(origin)
  )
    throw Error('NoahのURLを指定してください。');
  const { server, hub } = await createConnector({
    registryPath,
    port: 38483,
    allowedOrigins: new Set([origin]),
    localToolDirectory: directory,
  });
  console.log('Noahでココナラを開いてください。終了はCtrl+Cです。');
  const close = () => {
    hub.close();
    server.closeAllConnections();
    server.close();
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  await once(server, 'close');
  await rm(directory, { recursive: true, force: true });
} else {
  console.error(
    'node mac.mjs login | start | stage <納品ファイル> | reconcile <受付番号> sent|not-sent',
  );
  process.exitCode = 1;
}
