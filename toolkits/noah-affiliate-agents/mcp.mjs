import { TOPICS, CHANNELS, runAction, validateCatalog } from './core.mjs';

const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const text = description => ({ type: 'string', description });
const choices = values => ({ type: 'string', enum: values });
const definitions = {
  consult: { name: 'consult', description: 'Web・PCの困りごとを整理し、媒体掲載を確認済みの候補と無料の対処手順を返します。',
    inputSchema: object({ topic: choices(TOPICS), channel: choices(CHANNELS), budgetYen: { type: 'integer', minimum: 0 }, budgetPeriod: choices(['once', 'month']) }, ['topic', 'channel']) },
  audit: { name: 'audit', description: '本人用台帳の提携・掲載条件・期限・価格未確認を点検します。保存・外部送信は行いません。', inputSchema: object({}) },
  draft: { name: 'draft', description: '確認済み案件の紹介原稿を下書きします。未確認案件は構成だけ返します。', inputSchema: object({ offerId: text('案件ID'), channel: choices(CHANNELS) }) },
  analyze: { name: 'analyze', description: '個人情報を含まない実績JSONを集計し、保留・承認・否認を分けて返します。', inputSchema: object({ summaryJson: text('periodStart、periodEnd、rowsを持つJSON。READMEの集計例を使用してください。') }) },
};
const roles = { consult: ['consult'], operations: ['audit', 'draft', 'analyze'] };
export function toolDefinitions(role) {
  return (roles[role] || []).map(key => ({ ...definitions[key], annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }));
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const error = (id, code, message) => json({ jsonrpc: '2.0', id, error: { code, message } });
const MAX = 65536;
async function bodyJson(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('body');
  let size = 0;
  const parts = [];
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break;
      size += value.length; if (size > MAX) { await reader.cancel(); throw new Error('limit'); } parts.push(value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let start = 0;
  for (const p of parts) { bytes.set(p, start); start += p.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
async function authorized(request, secret) {
  if (typeof secret !== 'string' || secret.length < 32) return false;
  const supplied = request.headers.get('authorization') || '';
  if (supplied.length > 1024) return false;
  const digest = async s => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([digest(supplied), digest(`Bearer ${secret}`)]);
  let mismatch = 0; for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}

// Deploy this adapter with a provider-owned catalog. No user argument can set it.
export async function handleMcp(request, env = {}, now = Date.now()) {
  const url = new URL(request.url), role = url.pathname === '/consult/mcp' ? 'consult' : url.pathname === '/operations/mcp' ? 'operations' : null;
  if (!role) return json({ error: 'not_found' }, 404);
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin && origin !== env.NOAH_ORIGIN) return json({ error: 'origin_denied' }, 403);
  if (role === 'operations' && !await authorized(request, env.OPERATIONS_TOKEN)) return json({ error: 'auth_required' }, 401);
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return json({ error: 'json_required' }, 415);
  if (Number(request.headers.get('content-length')) > MAX) return json({ error: 'too_large' }, 413);
  let rpc;
  try { rpc = await bodyJson(request); } catch { return error(null, -32700, 'JSONの形式または容量を確認してください。'); }
  if (!rpc || typeof rpc !== 'object' || Array.isArray(rpc) || rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string' ||
    (rpc.id !== undefined && typeof rpc.id !== 'string' && !(typeof rpc.id === 'number' && Number.isFinite(rpc.id)))) return error(null, -32600, 'Invalid request');
  if (rpc.id === undefined) return new Response(null, { status: 202 });
  const result = value => json({ jsonrpc: '2.0', id: rpc.id, result: value });
  if (rpc.method === 'initialize') {
    const protocol = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'].includes(rpc.params?.protocolVersion) ? rpc.params.protocolVersion : '2025-03-26';
    return result({ protocolVersion: protocol, capabilities: { tools: {} }, serverInfo: { name: `noah-affiliate-${role}`, version: '1.0.0' } });
  }
  if (rpc.method === 'ping') return result({});
  if (rpc.method === 'tools/list') return result({ tools: toolDefinitions(role) });
  if (rpc.method !== 'tools/call') return error(rpc.id, -32601, 'Method not found');
  if (!roles[role].includes(rpc.params?.name)) return error(rpc.id, -32602, 'この接続では使えない道具です。');
  try {
    const raw = env.CATALOG_JSON;
    // Worker secrets have a 5 KB value limit; use a conservative byte ceiling.
    if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > 5000) throw new Error('台帳が未設定です。');
    const catalog = validateCatalog(JSON.parse(raw));
    const args = rpc.params.arguments;
    if (!args || typeof args !== 'object' || Array.isArray(args) || Object.hasOwn(args, 'action')) throw new Error('道具の入力形式を確認してください。');
    let input = { ...args, action: rpc.params.name };
    if (rpc.params.name === 'analyze') {
      if (Object.keys(args).length !== 1 || typeof args.summaryJson !== 'string') throw new Error('集計JSONを指定してください。');
      const parsed = JSON.parse(args.summaryJson);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.hasOwn(parsed, 'action')) throw new Error('集計の形式を確認してください。');
      input = { ...parsed, action: 'analyze' };
    }
    const output = runAction(role, input, catalog, now);
    return result({ content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], isError: false });
  } catch {
    // Never echo input or provider catalog/secret contents into a public response.
    return result({ content: [{ type: 'text', text: '入力または案件台帳を確認してください。処理は完了していません。' }], isError: true });
  }
}
const worker = { fetch(request, env) { return handleMcp(request, env); } };
export default worker;
