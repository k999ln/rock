#!/usr/bin/env node
// 公開の API を、知らない人（Cookie なし）とブラウザだけの本人（Cookie あり）の 2 通りで、GET だけで呼ぶ。読むだけ。書き込む API は呼ばない。
// 使い方: node scripts/noah-public-probe.mjs https://avoado.si [出力.json]
// 見る事: 200 を返す API に、他人の物・運営の物・設定の中身が無いか。500 番台が無いか。
// task 128（docs/noah/ux-audit-2026-11-22.md の 4 章）。
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const base = (process.argv[2] || 'https://avoado.si').replace(/\/$/, '');
const out = process.argv[3] || '';
const root = new URL('../', import.meta.url).pathname;
// GET でも動く物（合図・Webhook・戻り先）は呼ばない。
const skip = /tick|webhook|callback|cron|scheduled/i;

function routes(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...routes(path));
    else if (name === 'route.ts') {
      const source = readFileSync(path, 'utf8');
      const methods = new Set([...source.matchAll(/^export[^\n]*\b(GET|POST|PUT|PATCH|DELETE)\b/gm)].map((m) => m[1]));
      if (methods.has('GET')) found.push('/' + relative(join(root, 'app'), dir).split('\\').join('/'));
    }
  }
  return found;
}
const fill = (path) => path.replace(/\[\[\.\.\.[^\]]+\]\]/g, 'status').replace(/\[\.\.\.[^\]]+\]/g, 'x')
  .replace(/\[orderId\]/g, '00000000-0000-4000-8000-000000000000').replace(/\[[^\]]+\]/g, 'probe-id');

const session = await fetch(`${base}/api/noah/session`, { method: 'POST', headers: { origin: base } });
const cookie = (session.headers.get('set-cookie') || '').split(';')[0];
const results = [];
for (const route of routes(join(root, 'app/api')).sort()) {
  if (skip.test(route)) { results.push({ route, skipped: true }); continue; }
  for (const [who, headers] of [['anon', {}], ['browser', cookie ? { cookie } : {}]]) {
    let status = -1, size = 0, keys = '';
    try {
      const response = await fetch(base + fill(route), { headers, redirect: 'manual', signal: AbortSignal.timeout(20_000) });
      status = response.status;
      const body = await response.text(); size = body.length;
      try { const json = JSON.parse(body); keys = Array.isArray(json) ? `array(${json.length})` : Object.keys(json).slice(0, 10).join(','); } catch { keys = body.slice(0, 60).replace(/\s+/g, ' '); }
    } catch (error) { keys = String(error).slice(0, 80); }
    results.push({ route, who, status, size, keys });
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
}
if (out) writeFileSync(out, JSON.stringify(results, null, 1));
const counts = {};
for (const r of results) if (!r.skipped) counts[r.status] = (counts[r.status] || 0) + 1;
console.log(`cookie issued: ${!!cookie}; status counts: ${JSON.stringify(counts)}`);
for (const r of results.filter((r) => !r.skipped && (r.status === 200 || r.status >= 500 || r.status === -1)))
  console.log(`${r.who.padEnd(7)} ${String(r.status).padEnd(4)} ${r.route.padEnd(52)} ${String(r.size).padStart(7)}B ${r.keys}`);
