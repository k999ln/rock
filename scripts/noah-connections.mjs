import { createNoahLocalRequest } from './noah-local-api.mjs';
import path from 'node:path';
import { isLocalRuntimeHost, isLocalRuntimeRequest } from '../lib/sky-private-loopback.mjs';
import { createNoahConnectionManager, ConnectionError } from './noah-connection-manager.mjs';
import { noahConnectionAdapters } from './noah-connection-adapters.mjs';
import { connectNoahCloud } from './noah-cloud-bridge.mjs';

export function noahConnectionMiddleware({ manager, port, getAgent, connectCloud }) {
  return async (request, response, next) => {
    const pathname = request.url?.split('?')[0] || '';
    if (!pathname.startsWith('/__noah/connections/')) return next();
    const send = (status, data) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(data)); };
    try {
      if (!isLocalRuntimeHost(request, port) || request.headers['sec-fetch-site'] === 'cross-site') throw new ConnectionError('このMacのNoah画面から接続してください。', 403);
      const match = /^\/__noah\/connections\/([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})(?:\/(connect|disconnect|run|cloud|operation\/start|operation\/stop))?$/.exec(pathname);
      if (!match) throw new ConnectionError('接続先が見つかりません。', 404);
      const action = match[2] === 'operation/start' ? 'startOperation' : match[2] === 'operation/stop' ? 'stopOperation' : match[2] || 'status';
      if (request.method !== (action === 'status' ? 'GET' : 'POST')) throw new ConnectionError('対応しない操作です。', 405);
      if (action !== 'status' && !isLocalRuntimeRequest(request, port)) throw new ConnectionError('このNoah画面から操作してください。', 403);
      const context = await getAgent(request, match[1]);
      if (!context?.agent || context.agent.id !== match[1]) throw new ConnectionError('Agentが見つかりません。', 404);
      let input;
      if (action !== 'status') {
        if (!context.ownerScope || request.headers['x-rock-owner-scope'] !== context.ownerScope) throw new ConnectionError('アカウントが変わりました。画面を開き直してください。', 409);
        if (!request.headers['content-type']?.startsWith('application/json')) throw new ConnectionError('JSONで送信してください。', 415);
        let bytes = 0; const chunks = [];
        for await (const chunk of request) { bytes += chunk.length; if (bytes > 32768) throw new ConnectionError('入力が大きすぎます。', 413); chunks.push(chunk); }
        try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ConnectionError('JSONを確認してください。', 400); }
        if (!input || typeof input !== 'object' || Array.isArray(input) || (!['run', 'startOperation'].includes(action) && Object.keys(input).length)) throw new ConnectionError('起動コマンドや環境設定は指定できません。', 400);
      }
      if (action === 'cloud' && !connectCloud) throw new ConnectionError('クラウド接続は未設定です。', 503);
      const result = action === 'cloud' ? await connectCloud(context) : await manager[action](context, input);
      send(result.supported === false && action !== 'status' ? 422 : 200, result);
    } catch (error) { send(error instanceof ConnectionError ? error.status : 503, { error: error instanceof ConnectionError ? error.message : '接続ホストを確認できません。もう一度お試しください。' }); }
  };
}

export function createNoahConnectionsPlugin() {
  return { name: 'noah-connections', configureServer(server) {
    const manager = createNoahConnectionManager({ directory: path.join(server.config.root, 'work/runtime-state/noah-connections'), adapters: noahConnectionAdapters(server.config.root) });
    server.middlewares.use((request, response, next) => {
      const address = server.httpServer?.address(), port = typeof address === 'object' ? address?.port : server.config.server.port;
      const getAgent = async (incoming, id) => {
        // Delegate ownership to the existing account API; never trust a browser
        // supplied owner ID, upload content, target URL or execution command.
        const request = createNoahLocalRequest(incoming);
        const revalidate = async () => {
          const result = await request(`/api/noah/agents/${id}`, { timeoutMs: 5000 });
          if (!result.ok) throw new ConnectionError(result.status === 404 ? 'Agentが見つかりません。' : 'Agentの所有者を確認できません。', [401, 403, 404].includes(result.status) ? result.status : 503);
          return result.json();
        };
        return { ...await revalidate(), revalidate };
      };
      const connectCloud = context => connectNoahCloud(context, path.join(server.config.root, 'work/runtime-state/noah-cloud-bridge.json'));
      void noahConnectionMiddleware({ manager, port, getAgent, connectCloud })(request, response, next);
    });
    server.httpServer?.once('close', () => { void manager.close(); });
  } };
}
