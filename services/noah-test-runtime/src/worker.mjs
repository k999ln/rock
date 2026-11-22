import html from './index.html';
import { AGENT_ID, OWNER_SCOPE, UUID, HttpError, exactKeys, newState, sha256, start, tick, view, validateStart } from './protocol.mjs';

const COOKIE = '__Host-noah-test-session';
const SESSION_SECONDS = 30 * 24 * 60 * 60;
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Strict-Transport-Security': 'max-age=31536000', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' };
const json = (data, status = 200, extra = {}) => Response.json(data, { status, headers: { ...headers, ...extra } });
const cookie = (value, age = SESSION_SECONDS) => `${COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${age}`;
const randomToken = () => [...crypto.getRandomValues(new Uint8Array(32))].map(v => v.toString(16).padStart(2, '0')).join('');

async function body(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(415, 'JSONで送信してください。');
  const reader = request.body?.getReader(); let length = 0; const chunks = [];
  if (!reader) throw new HttpError(400, '入力がありません。');
  while (true) {
    const part = await reader.read(); if (part.done) break;
    length += part.value.byteLength;
    if (length > 20000) { await reader.cancel(); throw new HttpError(413, '入力が大きすぎます。'); }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new HttpError(400, 'JSONを確認してください。'); }
}
function stub(env) { return env.OPERATIONS.get(env.OPERATIONS.idFromName(`${OWNER_SCOPE}:${AGENT_ID}:v1`)); }
async function dispatch(env, action, input = {}, sessionHash = '') {
  return stub(env).fetch(new Request('https://internal/command', { method: 'POST', body: JSON.stringify({ action, input, sessionHash }) }));
}
const worker = {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new HttpError(400, 'HTTPSが必要です。');
      if (request.method === 'GET' && (url.pathname === '/' || url.pathname === `/noah/agents/${AGENT_ID}`)) {
        const nonce = randomToken();
        return new Response(html.replaceAll('NOAH_CSP_NONCE', nonce), { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` } });
      }
      if (request.method === 'GET' && url.pathname === '/health') return json({ service: 'noah-test-runtime', version: 1 });
      if (request.method === 'POST' && url.pathname === '/api/pair') {
        const supplied = request.headers.get('authorization') || '';
        if (!env.NOAH_BRIDGE_SECRET || supplied.length > 256 || await sha256(supplied) !== await sha256(`Bearer ${env.NOAH_BRIDGE_SECRET}`)) throw new HttpError(401, '接続の認証が必要です。');
        const input = await body(request); exactKeys(input, ['ownerScope', 'agentId']);
        if (input.ownerScope !== OWNER_SCOPE || input.agentId !== AGENT_ID) throw new HttpError(403, 'このテスト環境の所有者ではありません。');
        const code = randomToken(), result = await dispatch(env, 'pair', { hash: await sha256(code) });
        if (!result.ok) return result;
        return json({ url: `${url.origin}/noah/agents/${AGENT_ID}#connect=${code}`, expiresAt: (await result.json()).expiresAt });
      }
      const routes = { '/auth/exchange': 'exchange', '/auth/logout': 'logout', '/api/operation': 'status', '/api/operation/start': 'start', '/api/operation/stop': 'stop' };
      const action = routes[url.pathname];
      if (!action) throw new HttpError(404, '見つかりません。');
      if (request.method !== (action === 'status' ? 'GET' : 'POST')) throw new HttpError(405, '対応しない操作です。');
      if (request.headers.get('sec-fetch-site') === 'cross-site' || (action !== 'status' && request.headers.get('origin') !== url.origin)) throw new HttpError(403, 'このNoah画面から操作してください。');
      const input = action === 'status' ? {} : await body(request);
      if (action === 'exchange') {
        exactKeys(input, ['code']);
        if (typeof input.code !== 'string' || !/^[a-f0-9]{64}$/.test(input.code)) throw new HttpError(401, '接続コードを確認してください。');
        const token = randomToken();
        const response = await dispatch(env, action, { hash: await sha256(input.code), sessionHash: await sha256(token) });
        if (!response.ok) return response;
        return json({ connected: true }, 200, { 'Set-Cookie': cookie(token) });
      }
      const token = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
      if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new HttpError(401, 'この端末をNoahから接続してください。');
      const response = await dispatch(env, action, input, await sha256(token));
      if (action === 'logout' && response.ok) return json({ disconnected: true }, 200, { 'Set-Cookie': cookie('', 0) });
      return response;
    } catch (error) { return json({ error: error instanceof HttpError ? error.message : 'クラウドの応答を確認できません。状態を再確認してください。' }, error instanceof HttpError ? error.status : 503); }
  },
  async scheduled(_event, env) {
    // A cloud-only watchdog repairs a missing alarm; it never starts stopped work.
    const result = await dispatch(env, 'reconcile');
    if (!result.ok) throw new Error('Noah alarm reconciliation failed');
  },
};
export default worker;

export class NoahTestOperation {
  constructor(ctx) { this.ctx = ctx; }
  async load(tx, withResults = false) {
    const state = await tx.get('state') || newState();
    state.starts = await tx.get('starts') || {};
    if (withResults) for (const run of state.runs) run.result = await tx.get(`result:${run.id}`);
    return state;
  }
  async save(tx, state, previousIds = []) {
    // Each result is bounded independently; 20 Unicode inputs cannot overflow
    // the storage API's 128 KiB per-value limit. Start fingerprints have no text.
    for (const run of state.runs) if (run.result) { await tx.put(`result:${run.id}`, run.result); delete run.result; }
    for (const id of previousIds) if (!state.runs.some(v => v.id === id)) await tx.delete(`result:${id}`);
    const { starts, ...record } = state;
    await tx.put('state', record); await tx.put('starts', starts);
  }
  async fetch(request) {
    try {
      const { action, input, sessionHash } = await request.json();
      if (action === 'start') validateStart(input);
      const fingerprint = action === 'start' ? await sha256(JSON.stringify([input.text, input.intervalSeconds])) : '';
      const result = await this.ctx.storage.transaction(async tx => {
        const now = Date.now();
        if (action === 'reconcile') {
          const state = await tx.get('state');
          if (state?.operation?.state === 'running' && !(await tx.getAlarm())) await tx.setAlarm(Math.max(now + 1, state.operation.nextRunAt));
          return { ok: true };
        }
        const auth = await tx.get('auth') || { pairs: [], sessions: [] };
        auth.pairs = auth.pairs.filter(v => v.expiresAt > now);
        auth.sessions = auth.sessions.filter(v => v.expiresAt > now);
        if (action === 'pair') {
          if (auth.pairs.length >= 8) throw new HttpError(429, '接続待ちが多いため、5分後にお試しください。');
          const expiresAt = now + 300000;
          auth.pairs.push({ hash: input.hash, expiresAt }); await tx.put('auth', auth); return { expiresAt };
        }
        if (action === 'exchange') {
          const pair = auth.pairs.find(v => v.hash === input.hash);
          if (!pair) throw new HttpError(401, '接続コードが期限切れ、または使用済みです。Noahから接続し直してください。');
          auth.pairs = auth.pairs.filter(v => v !== pair);
          auth.sessions.push({ hash: input.sessionHash, expiresAt: now + SESSION_SECONDS * 1000 });
          auth.sessions = auth.sessions.slice(-8); await tx.put('auth', auth); return { connected: true };
        }
        if (!auth.sessions.some(v => v.hash === sessionHash)) throw new HttpError(401, '認証が切れました。Noahから接続し直してください。');
        if (action === 'logout') {
          exactKeys(input, []); auth.sessions = auth.sessions.filter(v => v.hash !== sessionHash);
          await tx.put('auth', auth); return { disconnected: true };
        }
        const state = await this.load(tx);
        if (action === 'start') {
          if (start(state, input, now, fingerprint)) { await this.save(tx, state); await tx.setAlarm(state.operation.nextRunAt); }
        } else if (action === 'stop') {
          exactKeys(input, input?.cancelStartId === undefined ? [] : ['cancelStartId']);
          if (input.cancelStartId !== undefined) {
            if (!UUID.test(input.cancelStartId)) throw new HttpError(400, '開始IDを確認してください。');
            // Stop can arrive before a timed-out start request. Tombstone that
            // intent so a delayed HTTP delivery cannot restart after stopping.
            if (!Object.hasOwn(state.starts, input.cancelStartId) && Object.keys(state.starts).length < 1000) state.starts[input.cancelStartId] = 'canceled';
          }
          if (state.operation?.state === 'running') { state.operation.state = 'stopped'; state.operation.stoppedAt = now; state.operation.nextRunAt = null; }
          await this.save(tx, state); await tx.deleteAlarm();
        } else if (action !== 'status') throw new HttpError(404, '見つかりません。');
        for (const run of state.runs) run.result = await tx.get(`result:${run.id}`);
        return view(state, now);
      });
      return json(result);
    } catch (error) { return json({ error: error instanceof HttpError ? error.message : '保存を確認できません。状態を再確認してください。' }, error instanceof HttpError ? error.status : 503); }
  }
  async alarm() {
    // Pure deterministic work + result + next alarm are one transaction. No HTTP,
    // model call, payment or arbitrary code may be added to this retryable block.
    await this.ctx.storage.transaction(async tx => {
      const state = await this.load(tx);
      if (state.operation?.state !== 'running') { await tx.deleteAlarm(); return; }
      const previousIds = state.runs.map(v => v.id);
      if (tick(state, Date.now())) await this.save(tx, state, previousIds);
      await tx.setAlarm(state.operation.nextRunAt);
    });
  }
}
