import { build } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(
  process.argv[2] || join(root, 'work', 'noah-resale-agent-template'),
);
await mkdir(target, { recursive: true });
const result = await build({
  entryPoints: [join(root, 'toolkits/noah-resale-agent/cli.mjs')],
  outfile: join(target, 'agent.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  metafile: true,
  logLevel: 'silent',
});
const imports = Object.values(result.metafile.outputs).flatMap(
  (x) => x.imports,
);
if (imports.some((x) => x.external && !x.path.startsWith('node:')))
  throw Error('Portable package has external dependencies');
for (const file of [
  'README.md',
  'agent.example.json',
  '.env.example',
  'actions.example.json',
])
  await copyFile(
    join(root, 'toolkits/noah-resale-agent', file),
    join(target, file),
  );
await writeFile(
  join(target, 'package.json'),
  JSON.stringify(
    {
      name: 'noah-select-resale-agent-template',
      version: '0.1.0',
      private: true,
      type: 'module',
      engines: { node: '>=22.13.0' },
      scripts: { start: 'node agent.mjs', demo: 'node agent.mjs demo' },
    },
    null,
    2,
  ) + '\n',
);
const bytes = await readFile(join(target, 'agent.mjs'));
await writeFile(
  join(target, 'manifest.json'),
  JSON.stringify(
    {
      schema: 'noah.resale.cli-package/1',
      entry: 'agent.mjs',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length,
      requiresWebServer: false,
      requiresNodeModules: false,
      realProviderAccepted: false,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    directory: target,
    entry: join(target, 'agent.mjs'),
    bytes: bytes.length,
  }),
);
