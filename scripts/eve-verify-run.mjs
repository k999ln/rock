#!/usr/bin/env node
// 能力を確かめる（task 130 段 3。本人の回答 2026-11-24 13:54「全部送ってよい」）。
// Noah の公開の一覧から、能力の語で当たった候補を取り、MCP の公式台帳で接続先を引き、道具の一覧を読む。
// 読むだけの道具を 1 つ選び（lib/eve-verify.ts の eveVerifyToolChoice）、見本の仕事を 1 回だけ頼み、Jev の判定（eveCheckAccept）で見る。
// 送信・購入・電話・申込・登録・投稿などの道具は呼ばない。有料の候補は呼ばない。失敗しても呼び直さない。
//
// 使い方: node --experimental-strip-types scripts/eve-verify-run.mjs [--send] [--origin https://avoado.si] [--out data/eve-verifications/2026-11-24.json]
//   --send が無い時は、選んだ道具と入力を書き出すだけで、見本の仕事は送らない（道具の一覧を読む所までは行う）。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { noahAgentsFor } from '../lib/noah-business.ts';
import { EVE_VERIFY_TASKS, eveMcpOutput, eveMergeVerified, eveVerifyCapability, eveVerifyToolChoice } from '../lib/eve-verify.ts';
import { eveStableJson } from '../lib/eve-glue.ts';

const UA = 'NoahBot/1 (eve-verify; +https://avoado.si/noah/help#bot)';
const PROTOCOL = '2025-06-18';
const sha = (text) => createHash('sha256').update(text).digest('hex');

async function intake(origin) {
  const out = [];
  let cursor = null;
  for (let page = 0; page < 200; page++) {
    const url = new URL('/api/noah/intake', origin);
    if (cursor) url.searchParams.set('cursor', cursor);
    const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw Error(`intake_http_${response.status}`);
    const data = await response.json();
    for (const item of data.items ?? []) if (typeof item?.id === 'string') out.push(item);
    cursor = data.nextCursor ?? null;
    if (!cursor) break;
  }
  return out;
}

/** MCP の公式台帳から、その名前の今の版の、Streamable HTTP の接続先を引く。 */
async function endpoint(name) {
  const url = new URL('https://registry.modelcontextprotocol.io/v0/servers');
  url.search = new URLSearchParams({ search: name, limit: '30' }).toString();
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw Error(`registry_http_${response.status}`);
  const data = await response.json();
  const rows = (data.servers ?? []).filter((s) => (s.server ?? s).name === name);
  const latest = rows.find((s) => s._meta?.['io.modelcontextprotocol.registry/official']?.isLatest) ?? rows.at(-1);
  if (!latest) return null;
  const server = latest.server ?? latest;
  const remote = (server.remotes ?? []).find((r) => r.type === 'streamable-http' && typeof r.url === 'string' && r.url.startsWith('https://'));
  return remote ? { url: remote.url, version: String(server.version ?? ''), needsHeaders: (remote.headers ?? []).some((h) => h.isRequired) } : null;
}

/** 最小の MCP の呼び出し（Streamable HTTP。JSON か SSE の返事）。 */
function mcp(url) {
  let session = null;
  let id = 0;
  async function send(method, params, notify = false) {
    const body = notify ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id: ++id, method, params };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'User-Agent': UA, 'MCP-Protocol-Version': PROTOCOL, ...(session ? { 'Mcp-Session-Id': session } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
      redirect: 'error',
    });
    session = response.headers.get('mcp-session-id') ?? session;
    if (response.status === 401 || response.status === 403) { await response.body?.cancel(); throw Error('サインインが要ります'); }
    if (!response.ok) { await response.body?.cancel(); throw Error(`http_${response.status}`); }
    if (notify) { await response.body?.cancel(); return null; }
    const text = await response.text();
    let message = null;
    if ((response.headers.get('content-type') ?? '').includes('text/event-stream')) {
      for (const line of text.split('\n')) {
        if (!line.startsWith('data:')) continue;
        try { const m = JSON.parse(line.slice(5).trim()); if (m?.id === body.id) message = m; } catch { /* 次の行 */ }
      }
    } else message = JSON.parse(text);
    if (!message) throw Error('返事が読めません');
    if (message.error) throw Error(`rpc ${message.error.code}: ${String(message.error.message).slice(0, 160)}`);
    return message.result;
  }
  return {
    async open() {
      await send('initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'eve-verify', version: '1' } });
      await send('notifications/initialized', {}, true);
    },
    async tools() {
      const all = [];
      let cursor;
      for (let page = 0; page < 10; page++) {
        const r = await send('tools/list', cursor ? { cursor } : {});
        all.push(...(r?.tools ?? []));
        cursor = r?.nextCursor;
        if (!cursor) break;
      }
      return all;
    },
    call: (name, args) => send('tools/call', { name, arguments: args }),
  };
}

const { values } = parseArgs({ options: { send: { type: 'boolean', default: false }, origin: { type: 'string', default: 'https://avoado.si' }, out: { type: 'string', default: `data/eve-verifications/${new Date().toISOString().slice(0, 10)}.json` } } });
const root = resolve(import.meta.dirname, '..');
const agents = await intake(values.origin);
const record = { schema: 'eve-verifications/1', at: new Date().toISOString(), origin: values.origin, sent: values.send, runnable: agents.length, note: '読むだけの道具だけを、見本で 1 回だけ呼んだ記録。相手の返事の本文は残さず、hash と判定の理由だけを残す。', candidates: [] };
const results = [];
for (const task of EVE_VERIFY_TASKS) {
  const found = noahAgentsFor(task.capability, agents.map((a) => ({ id: a.id, name: String(a.name ?? ''), summary: String(a.summary ?? '') })));
  for (const candidate of found) {
    const item = agents.find((a) => a.id === candidate.id);
    const row = { capability: task.capability, ref: candidate.id, name: candidate.name, host: item?.host ?? null, status: 'skipped', reason: '', endpoint: null, registryVersion: null, tool: null, argKeys: [], toolsHash: null, verification: null };
    record.candidates.push(row);
    try {
      if (item?.connect?.price?.model && item.connect.price.model !== 'free') { row.reason = `有料の候補なので呼びません（${item.connect.price.model}）。`; continue; }
      if (!candidate.id.startsWith('mcp-registry:')) { row.reason = 'MCP の公式台帳の物ではないので、接続先を引けません。'; continue; }
      const remote = await endpoint(candidate.id.slice('mcp-registry:'.length));
      if (!remote) { row.reason = '公式台帳に、Streamable HTTP の接続先がありません。'; continue; }
      row.endpoint = remote.url;
      row.registryVersion = remote.version;
      if (remote.needsHeaders) { row.reason = '鍵（ヘッダー）が要る接続先なので呼びません。'; continue; }
      const client = mcp(remote.url);
      await client.open();
      const tools = await client.tools();
      row.toolsHash = sha(eveStableJson(tools.map((t) => ({ name: t.name, inputSchema: t.inputSchema ?? null, annotations: t.annotations ?? null }))));
      const choice = eveVerifyToolChoice(task, tools);
      if (!choice.tool) { row.reason = choice.reason; continue; }
      row.tool = choice.tool.name;
      row.argKeys = Object.keys(choice.args);
      const ref = { ref: candidate.id, version: sha(eveStableJson({ endpoint: remote.url, version: remote.version, tool: { name: choice.tool.name, inputSchema: choice.tool.inputSchema ?? null } })), tool: choice.tool.name, args: choice.args };
      if (!values.send) { row.status = 'planned'; row.reason = '送る前の一覧です（--send で送ります）。'; continue; }
      const [verification] = await eveVerifyCapability(task, [ref], async () => ({ output: eveMcpOutput(await client.call(choice.tool.name, choice.args)) }));
      row.status = 'called';
      row.verification = verification;
      row.reason = verification.reason;
      results.push(verification);
    } catch (error) {
      row.reason = `接続できませんでした: ${error instanceof Error ? error.message : String(error)}`.slice(0, 300);
    }
  }
}
const outPath = resolve(root, values.out);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(record, null, 2) + '\n');
if (values.send) {
  const capPath = resolve(root, 'data/noah-business-capabilities.json');
  const merged = eveMergeVerified(JSON.parse(readFileSync(capPath, 'utf8')), results);
  writeFileSync(capPath, JSON.stringify(merged, null, 2) + '\n');
}
const count = (s) => record.candidates.filter((c) => c.status === s).length;
console.log(JSON.stringify({ runnable: agents.length, candidates: record.candidates.length, planned: count('planned'), called: count('called'), passed: results.filter((r) => r.ok).length, skipped: count('skipped'), out: values.out }));
