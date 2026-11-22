import {
  isLocalRuntimeHost,
  isLocalRuntimeRequest,
} from '../lib/sky-private-loopback.mjs';
import { getNoahModelManager } from './noah-model-manager.mjs';
import { noahModel } from '../lib/noah-model-catalog.mjs';
import { InstallError } from './noah-source-fetch.mjs';
export function modelMiddleware({
  root,
  port,
  getOwner,
  referencesFor,
  getManager = getNoahModelManager,
}) {
  return async (request, response, next) => {
    if (request.url?.split('?')[0] !== '/__noah/models') return next();
    const send = (status, data) => {
      response.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(JSON.stringify(data));
    };
    try {
      const mutate = request.method === 'POST';
      if (!['GET', 'POST'].includes(request.method))
        throw new InstallError('対応しない操作です。', 405);
      if (
        !isLocalRuntimeHost(request, port) ||
        request.headers['sec-fetch-site'] === 'cross-site' ||
        (mutate && !isLocalRuntimeRequest(request, port))
      )
        throw new InstallError('このMacのNoahから操作してください。', 403);
      const owner = await getOwner(request),
        scope = owner.ownerScope;
      if (!owner.localHostOwner || !/^owner-v1:[a-f0-9]{64}$/.test(scope))
        throw new InstallError('このMacの本人として接続してください。', 403);
      const references = referencesFor(request, scope),
        manager = await getManager(root);
      if (mutate) {
        if (request.headers['x-rock-owner-scope'] !== scope)
          throw new InstallError('アカウントが変わりました。', 409);
        if (!request.headers['content-type']?.startsWith('application/json'))
          throw new InstallError('JSONで指定してください。', 415);
        const chunks = [];
        let size = 0;
        for await (const c of request) {
          size += c.length;
          if (size > 1024) throw new InstallError('入力が大きすぎます。', 413);
          chunks.push(c);
        }
        let v;
        try {
          v = JSON.parse(Buffer.concat(chunks).toString());
        } catch {
          throw new InstallError('入力を確認してください。', 400);
        }
        if (
          !v ||
          Array.isArray(v) ||
          Object.keys(v).length !== 4 ||
          Object.keys(v).some(
            (k) => !['action', 'model', 'digest', 'accepted'].includes(k),
          ) ||
          !['prepare', 'remove'].includes(v.action) ||
          v.accepted !== true ||
          noahModel(v.model)?.digest !== v.digest
        )
          throw new InstallError(
            'モデルの版・容量・操作を確認してください。',
            400,
          );
        const current = await getOwner(request);
        if (current.ownerScope !== scope || !current.localHostOwner)
          throw new InstallError('本人の接続が変わりました。', 409);
        if (v.action === 'prepare') {
          void manager.prepare(v.model).catch(() => {});
          send(202, { ownerScope: scope, accepted: true });
          return;
        }
        await manager.remove(v.model, v.digest, references);
      }
      const models = await manager.list();
      for (const m of models) m.references = await references(m.id);
      send(200, { ownerScope: scope, models });
    } catch (e) {
      send(e instanceof InstallError ? e.status : 503, {
        error:
          e instanceof InstallError
            ? e.message
            : 'モデル管理に接続できません。Ollamaの起動と保存先を確認してください。',
      });
    }
  };
}
