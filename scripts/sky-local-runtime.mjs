import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createConnector } from '../toolkits/sky-mcp-connector/server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const SERVICES = new Set(['connector', 'fashion']);

export function isLocalRuntimeRequest(request, port) {
  if (!LOOPBACK.has(request.socket?.remoteAddress)) return false;
  const origin = request.headers.origin;
  if (typeof origin !== 'string' || request.headers['sec-fetch-site'] === 'cross-site') return false;
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && url.origin === origin &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      url.port === String(port) && url.host === request.headers.host;
  } catch { return false; }
}

function portOccupied(port) {
  return new Promise((done) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const finish = (occupied) => { socket.destroy(); done(occupied); };
    socket.setTimeout(700, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

/** Own only processes created here. Never replace or terminate existing services. */
export function createLocalRuntimeManager({
  projectRoot = root, connectorPort = 38479, fashionPort = 8787, fashionDbPath,
} = {}) {
  const pending = new Map();
  let connector;
  let fashion;
  let closed = false;
  let closing;

  async function existingService(service, origin) {
    const base = `http://127.0.0.1:${service === 'connector' ? connectorPort : fashionPort}`;
    try {
      const response = await fetch(`${base}/health`, {
        headers: { Origin: origin }, signal: AbortSignal.timeout(700),
      });
      const health = await response.json();
      if (!response.ok || health.service !== (service === 'connector' ? 'rockstaros-sky-mcp' : 'fashion-brand-ops-mcp')) return false;
      const allowed = await fetch(`${base}/connect`, {
        method: 'OPTIONS', headers: { Origin: origin }, signal: AbortSignal.timeout(700),
      });
      return allowed.status === 204;
    } catch { return false; }
  }

  async function start(service, origin) {
    if (closed) throw new Error('Skyの実行環境は終了しています。画面を開き直してください。');
    if (!SERVICES.has(service)) throw new Error('この実行機能は自動起動に対応していません。');
    const active = pending.get(service);
    if (active) return active;
    const attempt = (async () => {
      if (service === 'connector') {
        if (connector) { connector.allowedOrigins.add(origin); return; }
        if (await portOccupied(connectorPort)) {
          if (await existingService(service, origin)) return;
          throw new Error('PC接続用ポートは別のサービスが使用中か、このSkyからの接続を許可していません。既存の接続アプリを確認してください。');
        }
        if (closed) throw new Error('Skyの実行環境は終了しています。');
        const allowedOrigins = new Set([origin]);
        const created = await createConnector({
          registryPath: resolve(projectRoot, 'toolkits/sky-mcp-connector/registry.json'),
          allowedOrigins,
          port: connectorPort,
        });
        connector = { ...created, allowedOrigins };
        return;
      }
      if (!fashion && await portOccupied(fashionPort)) {
        if (await existingService(service, origin)) return;
        throw new Error('ブランド運営用ポートは別のサービスが使用中か、このSkyからの接続を許可していません。既存の接続アプリを確認してください。');
      }
      if (!fashion) {
        if (closed) throw new Error('Skyの実行環境は終了しています。');
        const child = spawn(process.execPath, ['src/http.mjs'], {
          cwd: resolve(projectRoot, 'toolkits/fashion-brand-ops'),
          env: {
            PATH: process.env.PATH,
            FASHION_HTTP_HOST: '127.0.0.1',
            FASHION_HTTP_PORT: String(fashionPort),
            ...(fashionDbPath ? { FASHION_BRAND_DB_PATH: fashionDbPath } : {}),
            FASHION_BROWSER_ORIGINS: ['localhost', '127.0.0.1', '[::1]']
              .map((host) => `http://${host}:${new URL(origin).port}`).join(','),
            // Managed entry: real local planning/storage, no live publishing.
            FASHION_CREATIVE_PROVIDER: 'mock',
            FASHION_SOCIAL_PROVIDER: 'mock',
            FASHION_PAYMENT_PROVIDER: 'mock',
            FASHION_NOTIFICATION_PROVIDER: 'mock',
          },
          stdio: ['ignore', 'ignore', 'ignore'],
        });
        fashion = child;
        child.on('error', () => { if (fashion === child) fashion = undefined; });
        child.on('exit', () => { if (fashion === child) fashion = undefined; });
      }
      for (let attempt = 0; attempt < 40; attempt++) {
        if (!fashion || closed) throw new Error('ブランド運営の実行機能を起動できませんでした。');
        try {
          const response = await fetch(`http://127.0.0.1:${fashionPort}/health`, { signal: AbortSignal.timeout(500) });
          const health = await response.json();
          if (response.ok && health.service === 'fashion-brand-ops-mcp') {
            const preflight = await fetch(`http://127.0.0.1:${fashionPort}/connect`, {
              method: 'OPTIONS', headers: { Origin: origin }, signal: AbortSignal.timeout(500),
            });
            if (preflight.status !== 204) throw new Error('origin_denied');
            return;
          }
        } catch (error) {
          if (error.message === 'origin_denied')
            throw new Error('このSky画面からの接続が許可されていません。同じアドレスで開き直してください。');
        }
        await delay(100);
      }
      fashion?.kill('SIGTERM');
      throw new Error('端末内の実行機能が時間内に応答しませんでした。');
    })().finally(() => { if (pending.get(service) === attempt) pending.delete(service); });
    pending.set(service, attempt);
    await attempt;
  }

  function close() {
    if (closing) return closing;
    closing = cleanup();
    return closing;
  }

  async function cleanup() {
    closed = true;
    await Promise.allSettled(pending.values());
    if (connector) {
      connector.server.closeAllConnections();
      await new Promise((done) => connector.server.close(done));
      connector = undefined;
    }
    if (fashion) {
      const child = fashion;
      await new Promise((done) => {
        const deadline = setTimeout(() => { child.kill('SIGKILL'); done(); }, 2000);
        child.once('exit', () => { clearTimeout(deadline); done(); });
        child.kill('SIGTERM');
      });
    }
  }
  return { start, close };
}

/** @returns {import('vite').Plugin} */
export function createSkyLocalRuntimePlugin(options = {}) {
  let closeRuntime;
  return {
    name: 'sky-local-runtime',
    apply: 'serve',
    // Vite awaits this hook during server.close(); an HTTP close event alone
    // does not wait for the child to exit before Vite calls process.exit().
    async buildEnd() {
      await closeRuntime?.();
    },
    configureServer(server) {
      const manager = createLocalRuntimeManager(options);
      closeRuntime = () => manager.close();
      server.httpServer?.once('close', () => void manager.close());
      const shutdown = () => void manager.close();
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
      server.httpServer?.once('close', () => {
        process.removeListener('SIGINT', shutdown);
        process.removeListener('SIGTERM', shutdown);
      });
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split('?')[0] !== '/__sky/runtime/start') return next();
        const send = (status, data) => {
          response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          response.end(JSON.stringify(data));
        };
        const address = server.httpServer?.address();
        if (!address || typeof address === 'string' || !isLocalRuntimeRequest(request, address.port))
          return send(403, { error: 'このPCで開いているSkyから操作してください。' });
        if (request.method !== 'POST') return send(405, { error: 'POST required' });
        if (request.headers['content-type'] !== 'application/json')
          return send(415, { error: 'JSON required' });
        try {
          let body = '';
          for await (const chunk of request) {
            body += chunk.toString();
            if (body.length > 512) return send(413, { error: '入力が大きすぎます。' });
          }
          const input = JSON.parse(body);
          if (!input || Object.keys(input).length !== 1 || !SERVICES.has(input.service))
            return send(400, { error: '対応する実行機能を選んでください。' });
          await manager.start(input.service, request.headers.origin);
          return send(200, { service: input.service, status: 'ready', mode: 'local' });
        } catch (error) {
          server.config.logger.warn('[Sky local runtime] startup did not complete');
          return send(503, { error: error instanceof SyntaxError ? '入力を確認してください。' : error.message });
        }
      });
    },
  };
}
