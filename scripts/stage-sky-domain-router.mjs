import { copyFile, readFile, rename, writeFile } from 'node:fs/promises';

const server = new URL('../dist/server/', import.meta.url);
const configPath = new URL('wrangler.json', server);
const config = JSON.parse(await readFile(configPath, 'utf8'));
if (config.main !== 'index.js') throw new Error('Unexpected Sky Worker entrypoint');
await rename(new URL('index.js', server), new URL('vinext.js', server));
await copyFile(new URL('../services/sky-web/domain-router.mjs', import.meta.url), new URL('domain-router.mjs', server));
await writeFile(new URL('index.js', server),
  "import skyWorker from './vinext.js';\nimport { withMiniSite } from './domain-router.mjs';\nexport default withMiniSite(skyWorker);\n");
