// 本番の受入（書き込みあり。2026-11-23、本人「好きにしていいよ」）。知らない人のブラウザ 1 つで、
// 接続 → 読むだけの道具を 1 回頼む → 接続を切る、ボードを作って消す、登録情報に試験の名前を入れて消す、
// 受取口座はブラウザだけの本人では断られる事、を確かめる。試験の値は合成だけ。最後に作った物は消す。
import { randomUUID } from 'node:crypto';
const BASE = process.argv[2] ?? 'https://avoado.si';
const out = { base: BASE, at: new Date().toISOString(), steps: [] };
let cookie = '';
const log = (step, ok, detail = {}) => { out.steps.push({ step, ok, ...detail }); };
async function call(path, { method = 'GET', body, scope } = {}) {
  const headers = { Origin: BASE, Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1 Noah-acceptance' };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (scope) headers['X-Rock-Owner-Scope'] = scope;
  const r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(60_000) });
  const set = r.headers.get('set-cookie'); if (set && set.startsWith('__Host-noah_access=')) cookie = set.split(';')[0];
  let data = null; try { data = await r.json(); } catch { /* not json */ }
  return { status: r.status, data };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 途中で止まっても後始末できるように、試験の保存先の Cookie を手元の file にだけ残す（チャット・Git には出さない）。
import { writeFileSync } from 'node:fs';
const keep = () => { if (cookie) writeFileSync(new URL('./accept-cookie.txt', import.meta.url), cookie + '\n', { mode: 0o600 }); };
try {
  const session = await call('/api/noah/session', { method: 'POST' });
  log('session', session.status === 200 && session.data?.created === true, { status: session.status });
  keep();
  const profile = await call('/api/noah/profile');
  const scope = profile.data?.ownerScope;
  log('profile-read', profile.status === 200 && profile.data?.browserOwned === true, { status: profile.status });
  // 日本語で探す（直す前は 0 件）。
  for (const q of ['画像', '翻訳', '要約']) {
    const r = await call(`/api/noah/discover?q=${encodeURIComponent(q)}`);
    log(`search ${q}`, r.status === 200 && r.data.total > 0, { total: r.data?.total });
  }
  // ホームの Noah 自身の案内の印。
  const home = await call('/api/noah/discover?source=noah&firstJobs=1');
  const ads = (home.data?.items ?? []).filter((i) => i.provider === 'Noah' && i.external);
  log('noah-ad-notice', ads.length > 0 && ads.every((i) => i.notice === 'noah-ad'), { count: ads.length, notices: ads.map((i) => i.notice ?? null) });
  // 接続して、読むだけの道具を 1 回頼む。
  const candidates = (home.data?.items ?? []).filter((i) => i.oneTap && !i.external).slice(0, 6);
  let asked = null;
  for (const item of candidates) {
    const plan = await call(`/api/noah/connect-plan?agent=${encodeURIComponent(item.id)}`);
    if (plan.status !== 200 || plan.data?.cost?.taps !== 0) { log(`plan ${item.name}`, false, { status: plan.status, badge: plan.data?.badge }); continue; }
    const connectionId = randomUUID();
    const connected = await call('/api/noah/connect', { method: 'POST', scope, body: { id: connectionId, agentId: item.id, planSha256: plan.data.planSha256 } });
    log(`connect ${item.name}`, connected.status === 200 && connected.data?.state === 'connected', { status: connected.status, state: connected.data?.state, error: connected.data?.error });
    if (connected.data?.state !== 'connected') continue;
    const tools = await call(`/api/noah/connect/${connectionId}/tools`);
    const tool = (tools.data?.tools ?? []).find((t) => t.usable && t.readOnly && t.required === 0);
    log(`tools ${item.name}`, tools.status === 200 && !!tool, { status: tools.status, count: tools.data?.tools?.length, chosen: tool?.name, error: tools.data?.error });
    if (tool) {
      const askId = randomUUID();
      const accepted = await call('/api/noah/ask', { method: 'POST', scope, body: { id: askId, connectionId, form: { tool: tool.name, toolSha256: tool.sha256, input: {} }, screen: 'narrow' } });
      log(`ask ${item.name}`, accepted.status === 202, { status: accepted.status, error: accepted.data?.error });
      if (accepted.status === 202) {
        let state = null, detail = null;
        for (let i = 0; i < 30; i++) {
          await sleep(3000);
          detail = await call(`/api/noah/ask/${askId}`);
          state = detail.data?.state;
          if (['succeeded', 'failed', 'needs_user', 'stopped'].includes(state)) break;
        }
        const text = detail?.data?.result?.text ?? '';
        log(`result ${item.name}`, state === 'succeeded', { state, chars: text.length, sample: text.slice(0, 80), error: detail?.data?.error ?? detail?.data?.end?.message });
        asked = { item: item.name, tool: tool.name, state };
      }
    }
    const current = await call(`/api/noah/connect/${connectionId}`);
    const cut = await call(`/api/noah/connect/${connectionId}`, { method: 'POST', scope, body: { action: 'disconnect', revision: current.data?.revision } });
    log(`disconnect ${item.name}`, cut.status === 200, { status: cut.status, state: cut.data?.state });
    if (asked?.state === 'succeeded') break;
  }
  out.asked = asked;
  // ボードを作って消す。
  const board = await call('/api/noah/boards', { method: 'POST', scope, body: { action: 'create', name: '受入の試験', visibility: 'private' } });
  const created = board.data?.board ?? board.data;
  log('board-create', board.status === 200 && !!created?.id, { status: board.status, error: board.data?.error });
  if (created?.id) {
    const removed = await call('/api/noah/boards', { method: 'POST', scope, body: { action: 'remove', id: created.id, revision: created.revision } });
    log('board-remove', removed.status === 200, { status: removed.status, error: removed.data?.error });
  }
  // 登録情報: 試験の表示名を入れて消す。受取口座は、ブラウザだけの本人では断られる（Q3）。
  const p0 = await call('/api/noah/profile');
  const saved = await call('/api/noah/profile', { method: 'POST', scope, body: { action: 'fields', revision: p0.data.revision, consentVersion: '2026-11-22.1', reuse: true, fields: { displayName: '受入の試験' } } });
  log('profile-save', saved.status === 200 && saved.data?.fields?.displayName === '受入の試験', { status: saved.status, error: saved.data?.error });
  const bank = await call('/api/noah/profile', { method: 'POST', scope, body: { action: 'fields', revision: saved.data?.revision, consentVersion: '2026-11-22.1', reuse: true, fields: { displayName: '受入の試験', bankNumber: '0000000' } } });
  log('profile-bank-refused', bank.status === 403, { status: bank.status, error: bank.data?.error });
  const p1 = await call('/api/noah/profile');
  const cleared = await call('/api/noah/profile', { method: 'POST', scope, body: { action: 'clear', revision: p1.data?.revision } });
  log('profile-clear', cleared.status === 200 && Object.keys(cleared.data?.fields ?? {}).length === 0, { status: cleared.status });
} catch (error) {
  log('error', false, { message: String(error?.message ?? error) });
}
out.passed = out.steps.filter((s) => s.ok).length; out.failed = out.steps.filter((s) => !s.ok).map((s) => s.step);
console.log(JSON.stringify(out, null, 1));
