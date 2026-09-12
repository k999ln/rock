import assert from 'node:assert/strict';
import { build } from 'esbuild';
const site = process.argv[2] || 'http://127.0.0.1:3011';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(site))
  throw new Error('Use a loopback HTTP URL for the local Sky test server.');
const user = 'loop-mcp-flow-test-' + crypto.randomUUID();
const nativeFetch = globalThis.fetch;
const storage = new Map();
globalThis.sessionStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
};
globalThis.window = new EventTarget();
globalThis.fetch = (path, options = {}) => {
  if (typeof path !== 'string')
    throw new Error('Expected a string request URL');
  const isLocal = String(path).startsWith('http://127.0.0.1:38479/');
  const endpoint = isLocal ? path : site + path;
  const headers = new Headers(options.headers);
  headers.set(
    'Origin',
    isLocal ? 'https://rock-star.kirin-999.chatgpt.site' : site,
  );
  if (!isLocal) headers.set('oai-authenticated-user-id', user);
  return nativeFetch(endpoint, { ...options, headers });
};
const compiled = await build({
  stdin: {
    contents:
      "export {connectDevice,runDevice} from './lib/device.ts'; export {executeTracked,processedBytes} from './lib/operations-client.ts';",
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
});
const { connectDevice, runDevice, executeTracked, processedBytes } =
  await import(
    'data:text/javascript;base64,' +
      Buffer.from(compiled.outputFiles[0].text).toString('base64')
  );
await connectDevice();
const args = { text: '本文（出典: [Python](https://docs.python.org/3/)）' };
const first = await executeTracked({
  tool: 'mr-citations',
  transport: 'local-mcp',
  sample: true,
  inputBytes: processedBytes(args),
  task: () => runDevice('format_citations', args),
});
assert.ok(first.result.output.includes('https://docs.python.org/3/'));
assert.equal(first.warning, '');
const delivery = await executeTracked({
  tool: 'mr-delivery',
  transport: 'local-mcp',
  sample: true,
  inputBytes: processedBytes({ sample: true }),
  task: () => runDevice('verify_delivery', { sample: true }),
});
assert.equal(delivery.result.status, 'PASS');
assert.equal(delivery.warning, '');
const overview = await (await fetch('/api/operations')).json();
assert.equal(overview.jobs.length, 2);
assert.ok(
  overview.jobs.every((j) => j.status === 'completed' && j.sample === 1),
);
assert.equal(overview.devices.length, 1);
assert.equal(overview.devices[0].online, true);
assert.equal((await (await fetch('/api/fund')).json()).totalRuns, 2);
console.log(
  'PASS: App coordinator → authenticated Worker/D1 → real loopback MCP ping/tools/call → persisted completion/history. Citation and delivery synthetic samples.',
);
