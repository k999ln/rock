// 接続要件の合成入力。通信・鍵・本番データを使わない。
export const H = 'a'.repeat(64);
export const remote = (change = {}) => ({
  schema: 'noah-connect/1', candidateId: 'mcp-registry:ac.mizan/registry', candidateDigest: H, mouth: 'mcp-remote', surface: 'none',
  places: ['provider'], target: { url: 'https://mizan.ac/mcp', headers: [] }, codeDelivery: 'none',
  model: { use: 'provider', needs: [], minContextTokens: 0 }, egress: ['mizan.ac'], services: [], secrets: [], uses: [], ...change,
});
export const pkg = (change = {}) => ({
  schema: 'noah-connect/1', candidateId: 'mcp-registry:ai.2kw/mcp-server', candidateDigest: H, mouth: 'mcp-package', surface: 'terminal',
  places: ['home', 'cloud'], target: { registryType: 'npm', identifier: '@2kw/ai-mcp-server', version: '8.0.3', integrity: null, args: [], env: [] },
  codeDelivery: 'device_allowed', model: { use: 'none', needs: [], minContextTokens: 0 }, egress: [], services: [], secrets: [], uses: [], ...change,
});
export const recipe = (change = {}) => ({
  schema: 'noah-connect/1', packageKey: 'catalog:research-8782e21ebeda898af4b7', manifestSha256: H, mouth: 'source', surface: 'terminal',
  places: ['home'], target: { runtime: 'recipe', key: 'goose' }, codeDelivery: 'device_allowed',
  model: { use: 'local', needs: ['qwen2.5:1.5b'], minContextTokens: 0 }, egress: [], services: [], secrets: [], uses: [], ...change,
});
