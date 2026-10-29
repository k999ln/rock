import { createSkyToolApp } from '../src/index.mjs';

/** Example declarations are not an OS grant; real authors choose their own targets. */
export const examplePermissions = [
  { permission: 'read_user_input', scopes: ['job:owner-input'] },
  { permission: 'write_results', scopes: ['job:owner-result'] },
  { permission: 'network', scopes: ['loopback:local-tool'] },
];

/** A deterministic, non-inference example. Registration and execution require explicit setup. */
export function createLineCounter(options = {}) {
  const app = createSkyToolApp({
    developer: { id: 'example-developer', name: 'Example Developer', supportUrl: 'https://example.com/support' },
    app: { id: 'com.example.line-counter', name: 'Example Line Counter', version: '1.0.0',
      sourceUrl: 'https://example.com/source', license: 'MIT', ...(options.publicMcpUrl ? { publicMcpUrl: options.publicMcpUrl } : {}) },
    registration: false, autoPublish: false,
    ...(options.localToolDirectory ? { localToolDirectory: options.localToolDirectory } : {}),
    ...(options.skyUrl ? { skyUrl: options.skyUrl } : {}),
    ...(options.developerToken ? { developerToken: options.developerToken } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.logger ? { logger: options.logger } : {}),
  });
  app.tool({
    name: 'count_lines', title: '行数を数える',
    description: '入力された文章の行数を数える端末内の決定的処理です。',
    useWhen: ['文章の行数を確認する'], doNotUseWhen: ['文章の意味を推測する'],
    inputSchema: { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string' } },
      'x-rockstaros-tool-contract': { schema: 'rockstaros.tool-capability/1', capabilityIds: ['example.count-lines'], permissions: examplePermissions } },
    outputSchema: { type: 'object', additionalProperties: false, required: ['lines'], properties: { lines: { type: 'integer' } } },
    sideEffects: ['none'], price: { model: 'free', note: '端末内のサンプル処理です。' },
    handler: async ({ text }) => ({ lines: text.length === 0 ? 0 : text.split(/\r\n|\r|\n/u).length }),
  });
  app.tool({
    name: 'add_integers', title: '二つの整数を足す',
    description: '入力された二つの整数の和を返す端末内の決定的処理です。',
    useWhen: ['二つの整数を合計する'], doNotUseWhen: ['文章の意味を推測する'],
    inputSchema: { type: 'object', additionalProperties: false, required: ['left', 'right'],
      'x-rockstaros-tool-contract': { schema: 'rockstaros.tool-capability/1', capabilityIds: ['example.add-integers'], permissions: examplePermissions }, properties: {
      left: { type: 'integer' }, right: { type: 'integer' },
    } },
    outputSchema: { type: 'object', additionalProperties: false, required: ['sum'], properties: { sum: { type: 'integer' } } },
    sideEffects: ['none'], price: { model: 'free', note: '端末内のサンプル処理です。' },
    handler: async ({ left, right }) => {
      const sum = left + right;
      if (![left, right, sum].every(Number.isSafeInteger)) throw new Error('安全に扱える整数の範囲を確認してください。');
      return { sum };
    },
  });
  return app;
}
