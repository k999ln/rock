#!/usr/bin/env node
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

function slug(value, fallback) {
  const result = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return result || fallback;
}

function option(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const args = process.argv.slice(2);
if (args[0] !== 'init' || !args[1]) {
  console.error(
    'Usage: create-sky-tool init <directory> [--developer developer-id] [--app-id com.example.tool]',
  );
  process.exit(2);
}

const target = resolve(args[1]);
const name = slug(basename(target), 'my-tool');
const developer = slug(option(args, '--developer', 'example-developer'), 'developer');
const appId = option(args, '--app-id', `com.example.${name}`);
if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(appId)) {
  console.error('--app-id must be a reverse-domain style lowercase identifier');
  process.exit(2);
}

await mkdir(target, { recursive: true });
if ((await readdir(target)).length) {
  console.error(`Refusing to overwrite non-empty directory: ${target}`);
  process.exit(1);
}

const packageJson = {
  name,
  version: '0.1.0',
  private: true,
  type: 'module',
  scripts: { start: 'node index.mjs' },
  dependencies: { '@rockstaros/sky-tool-sdk': '^0.1.0' },
};

const index = `import { createSkyToolApp } from '@rockstaros/sky-tool-sdk';

const sky = createSkyToolApp({
  skyUrl: process.env.SKY_URL,
  developerToken: process.env.SKY_DEVELOPER_TOKEN,
  developer: {
    id: '${developer}',
    name: '${developer}',
    supportUrl: 'https://example.com/support'
  },
  app: {
    id: '${appId}',
    name: '${name}',
    version: '0.1.0',
    sourceUrl: 'https://github.com/example/${name}',
    license: 'MIT',
    publicMcpUrl: 'https://tools.example.com/mcp'
  },
  registration: 'best_effort',
  autoPublish: false
});

sky.tool({
  name: 'run',
  title: '${name}',
  description: '入力された内容を、この自動化Toolの処理へ渡して構造化された結果を返します。',
  useWhen: ['このToolが担当する自動化処理を実行するとき'],
  doNotUseWhen: ['必要な入力、権限、予算または接続が不足しているとき'],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['input'],
    properties: { input: { type: 'string' } }
  },
  outputSchema: {
    type: 'object',
    additionalProperties: true,
    properties: {}
  },
  sideEffects: ['none'],
  fundCategories: ['未分類'],
  tags: ['starter'],

  // ここだけを、自動化したい既存コードの呼び出しへ置き換えます。
  handler: async ({ input }) => ({ result: input })
});

const runtime = await sky.start({ port: Number(process.env.PORT || 8787) });
console.log(\`Sky MCP: http://\${runtime.host}:\${runtime.port}\${runtime.path}\`);
`;

const readme = `# ${name}

Sky対応Toolの雛形です。

1. \`.env.example\`を参考に環境変数を設定します。
2. \`index.mjs\`の\`handler\`へ自動化したい処理を接続します。
3. Tool説明、Schema、副作用、料金、Fund分類を実態どおりに直します。
4. \`npm start\`でMCPを起動し、Rock Studioで検証・公開します。

開発者キー、利用者入力、外部APIキーをGitへ保存しないでください。
`;

await Promise.all([
  writeFile(
    resolve(target, 'package.json'),
    `${JSON.stringify(packageJson, null, 2)}\n`,
    { flag: 'wx' },
  ),
  writeFile(resolve(target, 'index.mjs'), index, { flag: 'wx' }),
  writeFile(
    resolve(target, '.env.example'),
    'SKY_URL=https://your-sky.example\nSKY_DEVELOPER_TOKEN=\nPORT=8787\n',
    { flag: 'wx' },
  ),
  writeFile(resolve(target, 'README.md'), readme, { flag: 'wx' }),
]);

console.log(`Created Sky Tool starter in ${target}`);
console.log('Next: edit index.mjs, set SKY_URL and SKY_DEVELOPER_TOKEN, then npm start');

