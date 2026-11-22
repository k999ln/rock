import { isLocalRuntimeHost, isLocalRuntimeRequest } from '../lib/sky-private-loopback.mjs';
export const LOCAL_APP_ISOLATION_REQUIRED = 'Aniccaの本人画面に接続しない実行環境は準備中です。Mac上で直接起動せず、隔離した実行環境の対応を待ってください。';

// Compatibility endpoint only. No host subprocess, browser profile or display
// is granted to the retired onboarding server. Source acquisition is separate.
export function createNoahLocalAppManager() {
  return {
    status: async () => ({ state: 'setup_required', message: LOCAL_APP_ISOLATION_REQUIRED }),
    connect: async () => { throw new Error(LOCAL_APP_ISOLATION_REQUIRED); },
    disconnect: async () => ({ state: 'stopped' }),
  };
}
export function noahLocalAppMiddleware(manager, port) {
  return async (request, response, next) => {
    const path = new URL(request.url || '/', 'http://localhost').pathname;
    if (!path.startsWith('/__noah/local-apps/')) return next();
    const send = (status, data) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(data)); };
    if (!isLocalRuntimeHost(request, port)) return send(403, { error: 'このMacから操作してください。' });
    if (path === '/__noah/local-apps/anicca/status' && request.method === 'GET') return send(200, await manager.status());
    if (request.method !== 'POST') return send(405, { error: 'POSTで操作してください。' });
    if (!isLocalRuntimeRequest(request, port)) return send(403, { error: '同じMacのNoah画面から操作してください。' });
    if (!['/__noah/local-apps/anicca/connect', '/__noah/local-apps/anicca/disconnect'].includes(path)) return send(404, { error: '未対応のアプリです。' });
    let bytes = 0, body = '';
    for await (const chunk of request) { bytes += chunk.length; if (bytes > 64) return send(413, { error: '入力が大きすぎます。' }); body += chunk; }
    if (body.trim() !== '{}') return send(400, { error: '起動コマンドや設定は指定できません。' });
    try { send(200, await (path.endsWith('/connect') ? manager.connect() : manager.disconnect())); }
    catch (e) { send(409, { error: e.message || '接続できませんでした。' }); }
  };
}
export function createNoahLocalAppsPlugin() {
  return { name: 'noah-local-apps', configureServer(server) {
    const manager = createNoahLocalAppManager({ root: server.config.root });
    server.middlewares.use((request, response, next) => {
      const address = server.httpServer?.address(); const port = typeof address === 'object' ? address?.port : server.config.server.port;
      void noahLocalAppMiddleware(manager, port)(request, response, next).catch(() => { response.statusCode = 500; response.end(); });
    });
    server.httpServer?.once('close', () => { void manager.disconnect(); });
  } };
}
