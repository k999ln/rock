// 「まだ誰も動かしていない」Agent（一覧の接続の札が unverified）を、1 つずつ動かして確かめる（task 129 の D6）。書き込みあり。
// scripts/noah-prod-check.mjs の unverified から呼ぶ（--write の時だけ）。本人の許可（2026-11-27）「D6 の確かめで、外の道具を呼んでよい」。
// 決まり:
// - ブラウザだけの本人として、知らない人と同じ API で行う（計画 → つなぐ → 道具の一覧 → 頼む → 成果を待つ → 切る）。
// - 呼ぶのは、読み取りだけと宣言され、入力の要らない道具を 1 つだけ、1 回。読み取りだけと宣言していない道具・入力の要る道具は呼ばない。
// - Noah の上限を守る（つなぐのは 6.5 秒おき、1 人 95 回まで。越えたら、2 つ目のブラウザだけの本人で行う）。
// - 頼んで成果が返った物は、Noah の決まりどおり「動いた」（L2）になる（lib/noah-ask.ts の markRan）。
import { randomUUID } from 'node:crypto';

const AUTH = /許可が要る|unauthori[sz]ed|api[ _-]?key|apikey|\b401\b|\b403\b|forbidden|token|sign ?in|login|subscription|credits?|quota/i;

/** 1 件の記録を、表の分け方にする。 */
export function noahUnverifiedKind(row) {
  if (row.result === 'works') return 'works';
  if (row.result === 'needs-key') return 'needs-key';
  if (['tool-failed', 'ask-failed', 'ask-needs_user'].includes(row.result) && AUTH.test(String(row.error ?? ''))) return 'needs-key';
  if (row.result === 'needs-input') return 'needs-input';
  if (row.result === 'no-read-only-tool') return 'no-read-only-tool';
  if (['connect-failed', 'tools-error', 'plan-error'].includes(row.result)) return 'broken-connect';
  if (['tool-failed', 'ask-failed'].includes(row.result)) return 'broken-tool';
  return 'other';
}

export async function noahProdUnverified({ origin, limit = Infinity, log = () => undefined }) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const person = () => {
    const p = { cookie: '', scope: null, connects: 0 };
    p.call = async (path, { method = 'GET', body } = {}) => {
      const headers = { Origin: origin, Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 Noah-prod-check' };
      if (p.cookie) headers.Cookie = p.cookie;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (p.scope && method !== 'GET') headers['X-Rock-Owner-Scope'] = p.scope;
      const response = await fetch(origin + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual', signal: AbortSignal.timeout(90_000) });
      const set = response.headers.get('set-cookie');
      if (set?.startsWith('__Host-noah_access=')) p.cookie = set.split(';')[0];
      let data = null;
      try { data = await response.json(); } catch { /* not json */ }
      return { status: response.status, data };
    };
    p.start = async () => { await p.call('/api/noah/session', { method: 'POST' }); p.scope = (await p.call('/api/noah/profile')).data?.ownerScope ?? null; return p; };
    return p;
  };
  // 一覧を全部読む（20 件ずつ）。
  const families = [];
  for (let cursor = '', page = 0; page < 60; page++) {
    const listed = await fetch(`${origin}/api/noah/intake${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
    if (!listed.ok) break;
    const data = await listed.json();
    families.push(...(data.items ?? []));
    cursor = data.next ?? data.cursor ?? data.nextCursor ?? '';
    if (!cursor) break;
    await sleep(300);
  }
  const targets = families.filter((family) => family.connect?.badge === 'unverified').slice(0, limit);
  let current = await person().start();
  let people = 1, lastConnect = 0;
  const rows = [];
  for (const family of targets) {
    if (current.connects >= 95) { current = await person().start(); people++; }
    const row = { id: family.id, name: family.name ?? null };
    try {
      const plan = await current.call(`/api/noah/connect-plan?agent=${encodeURIComponent(family.id)}`);
      if (plan.status !== 200) { row.result = 'plan-error'; row.error = plan.data?.error ?? null; }
      else if ((plan.data?.cost?.taps ?? 0) > 0 || (plan.data?.cost?.typed ?? 0) > 0) row.result = 'needs-key';
      else {
        const wait = 6500 - (Date.now() - lastConnect);
        if (wait > 0) await sleep(wait);
        lastConnect = Date.now();
        const connectionId = randomUUID();
        const connected = await current.call('/api/noah/connect', { method: 'POST', body: { id: connectionId, agentId: family.id, planSha256: plan.data.planSha256 } });
        current.connects++;
        if (connected.data?.state !== 'connected') { row.result = 'connect-failed'; row.error = connected.data?.error ?? null; }
        else {
          const tools = await current.call(`/api/noah/connect/${connectionId}/tools`);
          const list = tools.data?.tools ?? [];
          const tool = list.find((one) => one.usable && one.readOnly && one.required === 0 && !one.needsConfirm);
          if (tools.status !== 200) { row.result = 'tools-error'; row.error = tools.data?.error ?? null; }
          else if (!tool) row.result = list.some((one) => one.readOnly) ? 'needs-input' : 'no-read-only-tool';
          else {
            row.tool = tool.name;
            const askId = randomUUID();
            const accepted = await current.call('/api/noah/ask', { method: 'POST', body: { id: askId, connectionId, form: { tool: tool.name, toolSha256: tool.sha256, input: {} }, screen: null } });
            if (accepted.status !== 202) { row.result = 'ask-refused'; row.error = accepted.data?.error ?? null; }
            else {
              let state = null, detail = null;
              for (let i = 0; i < 25 && !['succeeded', 'failed', 'needs_user', 'stopped'].includes(state); i++) {
                await sleep(2500);
                detail = await current.call(`/api/noah/ask/${askId}`);
                state = detail.data?.state ?? null;
              }
              row.chars = (detail?.data?.result?.text ?? '').length;
              row.error = detail?.data?.error ?? detail?.data?.end?.message ?? null;
              row.result = state === 'succeeded' ? 'works' : state === 'failed' ? 'tool-failed' : `ask-${state ?? 'timeout'}`;
            }
          }
          const now = await current.call(`/api/noah/connect/${connectionId}`);
          await current.call(`/api/noah/connect/${connectionId}`, { method: 'POST', body: { action: 'disconnect', revision: now.data?.revision } });
        }
      }
    } catch (error) {
      row.result = 'script-error';
      row.error = String(error?.message ?? error).slice(0, 200);
    }
    row.kind = noahUnverifiedKind(row);
    rows.push(row);
    log(`${rows.length}/${targets.length} ${row.kind} ${family.id}`);
  }
  const counts = {};
  for (const row of rows) counts[row.kind] = (counts[row.kind] ?? 0) + 1;
  return { ok: rows.every((row) => row.kind !== 'other'), listed: families.length, unverified: targets.length, people, counts, rows };
}
