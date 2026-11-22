import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { refactorUploadProject } from './noah-upload-refactor.mjs';
import { InstallError, sha256 } from './noah-source-fetch.mjs';
import { REFACTOR_AGENT } from './noah-save-refactor.mjs';
import { LIMITS } from './noah-execution-recipes.mjs';
import { isLocalRuntimeHost, isLocalRuntimeRequest } from '../lib/sky-private-loopback.mjs';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HEX = /^[a-f0-9]{64}$/;
const MAX_BYTES = 10 * 1024 * 1024;
const ACTIVE = new Set(['queued', 'validating_original', 'preparing', 'refactoring', 'validating_candidate']);

export function createUploadProcessingManager({ root, installations, executions, process = refactorUploadProject, clock = Date.now }) {
  const rows = new Map(); let closing = false;
  const get = (scope, id) => { const r = rows.get(scope + '/' + id); if (!r || r.expiresAt < clock()) throw new InstallError('整理結果の有効期限が切れたか、ホストが再起動しました。再処理してください。', 404); return r; };
  const view = r => ({ id: r.id, state: r.state, message: r.message, originalSha256: r.originalSha256, sourceSha256: r.result?.report.sourceSha256,
    report: r.result ? { status: r.result.report.status, message: r.result.report.message, validation: r.result.report.validation } : null,
    workId: r.workId, expiresAt: r.expiresAt, ...(r.state === 'complete' ? { receipt: { id: r.id, token: r.token } } : {}) });
  const api = {
    status(scope, id) { return view(get(scope, id)); },
    async start(scope, input, work, revalidate) {
      if (!input || Object.keys(input).some(k => !['id', 'name', 'base64', 'rightsConfirmed'].includes(k)) || !UUID.test(input.id) || input.rightsConfirmed !== true || typeof input.name !== 'string' || !/^[^/\\.][^/\\]{0,119}$/.test(input.name) || Array.from(input.name).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) || typeof input.base64 !== 'string' || input.base64.length > Math.ceil(MAX_BYTES / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.base64)) throw new InstallError('原本・ファイル名・保存権利を確認してください。', 400);
      const bytes = Buffer.from(input.base64, 'base64');
      if (bytes.length < 4 || bytes.length > MAX_BYTES) throw new InstallError('原本は4バイト以上、10MiBまでです。', 413);
      const key = scope + '/' + input.id, originalSha256 = sha256(bytes), old = rows.get(key);
      if (old && old.expiresAt >= clock()) {
        if (old.originalSha256 !== originalSha256 || old.name !== input.name) throw new InstallError('同じ処理IDの原本が変わっています。', 409);
        if (!['failed', 'cancelled'].includes(old.state)) return view(old);
        rows.delete(key);
      }
      for (const [k, row] of rows) if (!ACTIVE.has(row.state) && row.expiresAt < clock()) rows.delete(k);
      if (closing || [...rows.values()].some(r => ACTIVE.has(r.state))) throw new InstallError('別の登録コードを検証中です。完了後に再試行してください。', 429);
      if (rows.size >= 8 || [...rows.values()].reduce((n, r) => n + r.bytes, 0) + bytes.length * 2 > 64 * 1024 * 1024) throw new InstallError('整理結果の保持上限に達しました。期限後に再試行してください。', 429);
      const row = { id: input.id, name: input.name, originalSha256, bytes: bytes.length * 2, token: randomBytes(32).toString('hex'), state: 'queued', expiresAt: clock() + 30 * 60 * 1000, controller: new AbortController(), message: '固定テストと原本を確認しています。' };
      rows.set(key, row);
      const signal = AbortSignal.any([row.controller.signal, AbortSignal.timeout(10 * 60 * 1000)]);
      const current = async () => { signal.throwIfAborted(); await revalidate(); signal.throwIfAborted(); };
      row.task = (async () => {
        try {
          await current();
          row.result = await process({ root, name: row.name, bytes, signal, onStage: stage => { row.state = stage; },
            propose: async project => {
              const prompt = `Create the file /workspace/refactored.json using Aider's required whole-file editing format: the filename on its own line followed by a fenced code block containing the entire file. You MUST produce a file edit, not merely print JSON in the chat. Inside this file, write a JSON object {"files":[{"name":"original relative path","content":"complete revised source"}]}. Include only changed source files. Refactor the supplied project for clarity and remove duplication while preserving exports and behavior. Do not change tests, configuration, license or provenance. Editable files: ${JSON.stringify(project.editable)}\nOriginal project and fixed tests:\n${JSON.stringify(project.files)}`;
              if (Buffer.byteLength(prompt) > LIMITS.inputBytes) throw new InstallError('この実行器の入力上限を超えています。原本を保持しました。大きいプロジェクトの分割処理は未対応です。', 422);
              await current(); row.state = 'preparing';
              await installations.connect(scope, REFACTOR_AGENT, current);
              while (true) {
                await current(); const state = await installations.status(scope, REFACTOR_AGENT);
                if (state.state === 'connected' && !state.busy) break;
                if (!state.busy) throw new InstallError(state.message || '整理Agentを準備できません。', 503);
                await delay(750, undefined, { signal });
              }
              row.state = 'refactoring'; row.workId = randomUUID();
              await executions.start(scope, { id: row.workId, agentId: REFACTOR_AGENT, prompt }, work, current);
              while (true) {
                await current(); const { job } = await work('get', { id: row.workId });
                const execution = executions.view(scope, job).noahExecution;
                if (!['queued', 'running'].includes(execution.state)) {
                  if (execution.state !== 'returned' || execution.result?.exitCode !== 0) throw new InstallError(execution.error || '整理Agentが結果を返しませんでした。', 422);
                  const file = execution.result.files.find(f => f.name === 'refactored.json');
                  if (!file) throw new InstallError('整理Agentの修正ファイルがありません。', 422);
                  const result = Buffer.from(file.base64, 'base64');
                  if (result.length !== file.bytes || sha256(result) !== file.sha256) throw new InstallError('修正ファイルの内容を照合できません。', 422);
                  let value; try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(result)); } catch { throw new InstallError('整理AgentのJSONを確認できません。', 422); }
                  return { value, evidence: { workId: job.id, agentId: REFACTOR_AGENT, image: execution.image, model: execution.model, version: execution.version } };
                }
                await delay(750, undefined, { signal });
              }
            },
          });
          await current(); row.state = 'complete'; row.message = row.result.report.message;
        } catch {
          if (row.workId) await executions.stop(scope, row.workId, work).catch(() => {});
          row.result = null; row.state = signal.aborted ? 'cancelled' : 'failed'; row.message = signal.aborted ? 'コードの整理を停止しました。原本は変更していません。' : '整理を完了できませんでした。原本を変更せず再試行できます。';
        }
      })();
      return view(row);
    },
    async stop(scope, id) { const row = get(scope, id); if (ACTIVE.has(row.state)) { row.controller.abort(); await row.task; } return view(row); },
    receipt(scope, id, token) {
      const r = get(scope, id);
      if (r.state !== 'complete' || !HEX.test(token || '') || !timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(r.token, 'hex'))) throw new InstallError('整理結果の確認情報が一致しません。', 403);
      return { id, ownerScope: scope, name: r.name, originalSha256: r.originalSha256, base64: Buffer.from(r.result.bytes).toString('base64'), report: r.result.report };
    },
    async close() { closing = true; for (const r of rows.values()) r.controller.abort(); await Promise.all([...rows.values()].map(r => r.task)); rows.clear(); },
  };
  return api;
}

export function uploadProcessingMiddleware({ manager, port, getOwner, workFor }) {
  return async (request, response, next) => {
    const pathname = request.url?.split('?')[0] || '';
    if (!pathname.startsWith('/__noah/upload-refactor')) return next();
    const send = (status, value) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(value)); };
    try {
      if (!isLocalRuntimeHost(request, port) || request.headers['sec-fetch-site'] === 'cross-site') throw new InstallError('このMacのNoahから操作してください。', 403);
      const match = /^\/__noah\/upload-refactor(?:\/([a-f0-9-]{36})(?:\/(stop|receipt))?)?$/.exec(pathname);
      if (!match || match[1] && !UUID.test(match[1])) throw new InstallError('整理処理が見つかりません。', 404);
      const mutate = request.method === 'POST';
      if (!['GET', 'POST'].includes(request.method) || !mutate && match[2] || mutate && match[1] && !match[2]) throw new InstallError('対応しない操作です。', 405);
      if (mutate && !isLocalRuntimeRequest(request, port)) throw new InstallError('同じNoah画面から操作してください。', 403);
      const owner = await getOwner(request), scope = owner.ownerScope;
      if (!owner.localHostOwner || !/^owner-v1:[a-f0-9]{64}$/.test(scope)) throw new InstallError('このMacの本人として接続してください。', 403);
      let value;
      if (!mutate) value = match[1] ? { processing: manager.status(scope, match[1]) } : { available: true, languages: ['JavaScript', 'TypeScript', 'Python'], fixedTests: true };
      else {
        if (request.headers['x-rock-owner-scope'] !== scope) throw new InstallError('アカウントが変わりました。', 409);
        if (!request.headers['content-type']?.startsWith('application/json')) throw new InstallError('JSONで指定してください。', 415);
        let size = 0; const chunks = []; for await (const chunk of request) { size += chunk.length; if (size > (match[2] ? 2048 : 14 * 1024 * 1024)) throw new InstallError('入力が大きすぎます。', 413); chunks.push(Buffer.from(chunk)); }
        let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new InstallError('JSONを確認してください。', 400); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InstallError('JSONオブジェクトを指定してください。', 400);
        if (match[2] === 'receipt') {
          if (Object.keys(body).some(k => k !== 'token')) throw new InstallError('確認情報だけを指定してください。', 400);
          value = manager.receipt(scope, match[1], body.token);
        } else if (match[2] === 'stop') {
          if (Object.keys(body).length) throw new InstallError('停止に追加設定は不要です。', 400);
          value = { processing: await manager.stop(scope, match[1]) };
        } else value = { processing: await manager.start(scope, body, workFor(request, scope), async () => { const now = await getOwner(request); if (!now.localHostOwner || now.ownerScope !== scope) throw new InstallError('本人が変わりました。', 403); }) };
      }
      send(mutate && !match[2] ? 202 : 200, { ...value, ownerScope: scope });
    } catch (e) { send(e instanceof InstallError ? e.status : 503, { error: e instanceof InstallError ? e.message : 'コードの整理状況を確認できません。' }); }
  };
}
