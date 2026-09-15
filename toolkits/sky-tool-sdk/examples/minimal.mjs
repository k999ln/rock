import { createSkyToolApp } from '../src/index.mjs';

const sky = createSkyToolApp({
  skyUrl: process.env.SKY_URL,
  developerToken: process.env.SKY_DEVELOPER_TOKEN,
  developer: {
    id: 'example-developer',
    name: 'Example Developer',
    supportUrl: 'https://example.com/support',
  },
  app: {
    id: 'com.example.text-tools',
    name: 'Example Text Tools',
    version: '0.1.0',
    sourceUrl: 'https://github.com/example/text-tools',
    license: 'MIT',
    publicMcpUrl: 'https://tools.example.com/mcp',
  },
  autoPublish: false,
  registration: 'best_effort',
});

sky.tool({
  name: 'count_characters',
  title: '文字数を数える',
  description: '入力された文章のUnicode文字数を数え、構造化された結果として返します。',
  useWhen: ['文章の文字数を確認する必要があるとき'],
  doNotUseWhen: ['単語数やトークン数を求められているとき'],
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['text'],
    properties: { text: { type: 'string' } },
  },
  outputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['characters'],
    properties: { characters: { type: 'integer' } },
  },
  sideEffects: ['none'],
  fundCategories: ['文章制作'],
  tags: ['text', 'offline-calculation'],
  handler: async ({ text }) => ({ characters: [...text].length }),
});

const runtime = await sky.start({ port: 8787 });
console.log(`Sky MCP: http://${runtime.host}:${runtime.port}${runtime.path}`);
