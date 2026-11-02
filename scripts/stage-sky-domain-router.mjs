import {
  access,
  copyFile,
  readFile,
  rename,
  writeFile,
} from 'node:fs/promises';

const server = new URL('../dist/server/', import.meta.url);
const configPath = new URL('wrangler.json', server);
const config = JSON.parse(await readFile(configPath, 'utf8'));
if (config.main !== 'index.js')
  throw new Error('Unexpected Sky Worker entrypoint');
// Assets must reach the same outer security policy as application responses.
// Do not overwrite an unrelated binding or invent an asset directory.
if (typeof config.assets?.directory !== 'string' || !config.assets.directory.trim())
  throw new Error('Sky Worker asset directory is missing');
if (config.assets.binding !== undefined && config.assets.binding !== 'ASSETS')
  throw new Error('Unexpected Sky Worker asset binding');
async function stageAssetRouting() {
  await writeFile(configPath, JSON.stringify({
    ...config,
    assets: { ...config.assets, binding: 'ASSETS', run_worker_first: true },
  }, null, 2) + '\n');
}
try {
  await access(new URL('vinext.js', server));
  const staged = await readFile(new URL('index.js', server), 'utf8');
  if (staged.includes('withMiniSite(skyWorker)')) {
    await copyFile(
      new URL('../services/sky-web/domain-router.mjs', import.meta.url),
      new URL('domain-router.mjs', server),
    );
    await stageAssetRouting();
    console.log('Sky domain router refreshed; Worker-first assets enabled; built application unchanged.');
    process.exit(0);
  }
  throw new Error(
    'Sky Worker has vinext.js but the domain router entrypoint is not staged',
  );
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
await rename(new URL('index.js', server), new URL('vinext.js', server));
await copyFile(
  new URL('../services/sky-web/domain-router.mjs', import.meta.url),
  new URL('domain-router.mjs', server),
);
await writeFile(
  new URL('index.js', server),
  "import skyWorker from './vinext.js';\nimport { withMiniSite } from './domain-router.mjs';\nexport default withMiniSite(skyWorker);\n",
);

await stageAssetRouting();
