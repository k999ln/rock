import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createLinuxLocalManager } from '../../scripts/sky-linux-local-runtime.mjs';
import { isLocalRuntimeHost, isLocalRuntimeRequest } from '../../lib/sky-private-loopback.mjs';

if (process.platform !== 'linux' || process.arch !== 'arm64') throw new Error('Pixel内Linuxで起動してください。');
const base = join(homedir(), 'sky-private');
const root = join(base, 'app');
const port = 5199;
function execute(args, { input, timeout = 240000, signal, onProgress } = {}) {
  const child = spawn(args[0], args.slice(1), { stdio: ['pipe', 'pipe', 'pipe'], env: process.env, detached: true });
  const abort = () => { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already exited. */ } };
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const promise = new Promise((resolve, reject) => {
    let text = '', error = '', pending = '';
    const timer = setTimeout(abort, timeout);
    child.stdout.on('data', chunk => { text += chunk; pending += chunk; if (text.length > 150000) abort();
      const lines = pending.split('\n'); pending = lines.pop();
      for (const line of lines) { try { const v = JSON.parse(line); if (v.progress) onProgress?.(v.progress); } catch { /* Final result checked by prepare. */ } }
    });
    child.stderr.on('data', chunk => { error = (error + chunk).slice(-4000); });
    child.on('error', e => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(e); });
    child.on('close', code => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      let message = '端末内Linuxの処理が完了しませんでした。空き容量・通信・選んだAIを確認してください。';
      try { const result = JSON.parse(text.trim().split('\n').at(-1)); if (typeof result.error === 'string') message = result.error.slice(0, 300); } catch { /* Keep plain fallback. */ }
      code === 0 ? resolve(text.trim()) : reject(new Error(message, { cause: error }));
    });
    child.stdin.on('error', () => {}); child.stdin.end(input);
  });
  return { child, promise };
}
const manager = await createLinuxLocalManager({ root, stateDir: join(base, 'state'), environment: {
  id: 'pixel-linux', spawn: execute, bootId: (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim(),
  phaseLabels: { stopped: 'AIの実行を停止しました。成果とSkyの画面は残っています' },
  async prepare(lock, worker, options) {
    const raw = await execute(['python3', join(root, 'toolkits/sky-linux-local/prepare-pixel.py'), '--progress'], { ...options, input: JSON.stringify(lock.model), timeout: 900000 }).promise;
    const result = JSON.parse(raw.split('\n').at(-1));
    if (result.error) throw new Error(result.error);
    return result;
  },
  async stop() {
    const result = JSON.parse(await execute(['python3', join(base, 'worker.py'), 'stop-all'], { timeout: 30000 }).promise);
    if (!result.confirmed) throw new Error('端末内のAIを停止できたか確認できません。');
  },
} });
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']], ['/sky', ['index.html', 'text/html; charset=utf-8']], ['/eve', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']], ['/app.css', ['app.css', 'text/css; charset=utf-8']],
]);
const server = createServer(async (request, response) => {
  const send = (status, value, type = 'application/json; charset=utf-8') => {
    response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" });
    response.end(type.startsWith('application/json') ? JSON.stringify(value) : value);
  };
  // A top-level Android browser intent can be cross-site. Static files carry no
  // owner data; mutations below still require matching Origin/Host and Fetch Site.
  if (!isLocalRuntimeHost(request, port)) return send(403, { error: 'このPixelのSkyから操作してください。' });
  const path = request.url?.split('?')[0];
  if (assets.has(path) && request.method === 'GET') {
    const [name, type] = assets.get(path); return send(200, await readFile(join(root, 'ui', name)), type);
  }
  if (path !== '/__sky/linux' || request.method !== 'POST' || request.headers['content-type'] !== 'application/json' || !isLocalRuntimeRequest(request, port)) return send(404, { error: 'この操作は利用できません。' });
  try {
    let body = '';
    for await (const chunk of request) { body += chunk; if (Buffer.byteLength(body) > 32000) return send(413, { error: '入力が長すぎます。' }); }
    return send(200, await manager.action(JSON.parse(body)));
  } catch (error) { return send(400, { error: error.message }); }
});
let closing = false;
async function close() { if (closing) return; closing = true; await manager.close(); server.closeAllConnections(); server.close(); }
process.on('SIGINT', () => void close()); process.on('SIGTERM', () => void close());
server.listen(port, '127.0.0.1', async () => {
  await mkdir(base, { recursive: true, mode: 0o700 });
  await writeFile(join(base, 'server.pid'), String(process.pid), { mode: 0o600 });
  console.log('SkyはこのPixel内の http://127.0.0.1:5199/ で使えます。');
});
