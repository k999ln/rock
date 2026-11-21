// つなぐ・道具の一覧・頼む の試験で使う世界: 台帳・接続先（合成のサーバー）・表（本番と同じ migration）・入口（API の関数）。通信はしない。
// 一覧に載せるのは、巡回の握手を実際に通した物だけ（表を直に書いて「載せた事」にしない）。
import { createIntakeApi } from '../../../lib/noah-intake-api.ts';
import { createNoahAskApi } from '../../../lib/noah-ask.ts';
import { createNoahConnectApi } from '../../../lib/noah-connect.ts';
import { createNoahConnectPlanApi } from '../../../lib/noah-connect-plan-api.ts';
import { parseNoahFlags } from '../../../lib/noah-flags.ts';
import { createNoahShelfApi } from '../../../lib/noah-shelf-api.ts';
import { createNoahTrialApi } from '../../../lib/noah-trial-api.ts';
import { parseNoahShelfFlags } from '../../../lib/noah-shelf.ts';
import { ownerScopeFor } from '../../../lib/owner-intent.ts';
import { fixture, entry, page } from './intake.mjs';
import { network } from './mcp-server.mjs';

export const ORIGIN = 'https://noah.test';
export const REGISTRY = 'registry.modelcontextprotocol.io';
/** 一覧と、接続・依頼を、誰にでも開けた状態。 */
export const OPEN = { NOAH_INTAKE_PUBLIC: 'true', NOAH_ASK_FORM: 'true' };
export const familyId = (i) => `mcp-registry:test.provider/agent-${i}`;
export const hostOf = (i) => `agent-${i}.example.com`;
/** 接続の操作 ID（client が作る UUID）。 */
export const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
/** 相手が受けた要求の名前の並び（握手は initialize・notifications/initialized・tools/list）。 */
export const rpcs = (server) => server.log.map((request) => request.rpc ?? request.method);
export const handshakes = (server) => server.log.filter((request) => request.rpc === 'initialize').length;

/**
 * servers は { host: mcpServer(...) | (url, init) => Response }。records は、台帳が返す記録（既定は、servers の host ごとに 1 件）。
 * 作った後、台帳を 1 回読み、巡回の握手を済ませてある（握手が通った物が、一覧に載っている）。相手が受けた要求の記録は、そこで空にする。
 * options.patrol が false なら握手をせず、options.sync が false なら台帳も読まない（表は空のまま）。
 */
export async function world(t, servers, options = {}) {
  const state = { records: options.records ?? Object.keys(servers).map((name) => entry(Number(/^agent-(\d+)\./.exec(name)?.[1] ?? 0))) };
  const net = network({
    [REGISTRY]: async () => page(state.records),
    ...Object.fromEntries(Object.entries(servers).map(([name, server]) => [name, typeof server === 'function' ? server : server.fetch])),
  });
  const f = fixture(t, net.fetch, options.extra ?? {});
  const patrol = async () => {
    let total = 0;
    for (let round = 0; round < 20; round++) {
      const counts = await f.store.probeDue(f.time() + 25_000);
      total += counts.probes;
      if (!counts.probes) break;
    }
    return total;
  };
  /** 台帳を読み直す（記録を変えた後）。名寄せは 1 日 1 回なので、要る時は時計を進めてから呼ぶ。 */
  const sync = async (records) => { if (records) state.records = records; return f.store.sync(); };
  const clear = () => { net.hosts.length = 0; for (const server of Object.values(servers)) if (typeof server !== 'function') server.log.length = 0; };
  // options.sync が false の時は、台帳も読まない（取り込みを、巡回の合図から始める試験のため）。
  if (options.sync !== false) {
    await sync();
    if (options.patrol !== false) await patrol();
  }
  clear();

  /** その人として、入口を呼ぶ。user が null なら、未サインイン。 */
  const as = (user, config = {}) => {
    const deps = {
      ...f.deps, flags: parseNoahFlags(config.env ?? options.env ?? OPEN), reviewers: config.reviewers ?? options.reviewers ?? [],
      authenticate: async () => { if (!user) throw Error('UNAUTHORIZED'); return user; },
      ...(config.waitUntil ? { waitUntil: config.waitUntil } : {}),
      ...(config.planLimits ?? options.planLimits ? { planLimits: config.planLimits ?? options.planLimits } : {}),
    };
    const api = createNoahConnectApi(deps), planApi = createNoahConnectPlanApi(deps), askApi = createNoahAskApi(deps);
    const send = async (handler, method, path, body, headers) => {
      const base = method === 'GET' ? {} : { Origin: ORIGIN, 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': user ? await ownerScopeFor(user) : '' };
      const response = await handler(new Request(ORIGIN + path, { method, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }), headers: { ...base, ...headers } }));
      return { status: response.status, body: await response.json(), headers: response.headers };
    };
    const plan = (agent) => send(planApi, 'GET', `/api/noah/connect-plan?agent=${encodeURIComponent(agent)}`);
    return {
      deps, api, planApi, askApi, send, plan,
      /** 計画を読んでから、つなぐ（画面と同じ順）。planSha256 を渡した時は、読まずに、その値で送る。 */
      connect: async (agent, id, planSha256, headers) => send(api.collection, 'POST', '/api/noah/connect', { id, agentId: agent, planSha256: planSha256 ?? (await plan(agent)).body.planSha256 }, headers),
      raw: (body, headers, method = 'POST') => send(api.collection, method, '/api/noah/connect', body, headers),
      list: () => send(api.collection, 'GET', '/api/noah/connect'),
      get: (id) => send((request) => api.item(request, id), 'GET', `/api/noah/connect/${id}`),
      act: (id, action, revision, headers) => send((request) => api.item(request, id), 'POST', `/api/noah/connect/${id}`, { action, revision }, headers),
      tools: (id, tool) => send((request) => api.tools(request, id), 'GET', `/api/noah/connect/${id}/tools${tool ? `?tool=${encodeURIComponent(tool)}` : ''}`),
      /** 頼む。body は `{ id, connectionId, form: { tool, toolSha256, input, confirm? }, screen? }`。 */
      ask: (body, headers, method = 'POST') => send(askApi.collection, method, '/api/noah/ask', body, headers),
      asks: (connection) => send(askApi.collection, 'GET', `/api/noah/ask${connection ? `?connection=${connection}` : ''}`),
      /** その Agent への依頼（切った接続の分も含む）。 */
      asksOf: (agent) => send(askApi.collection, 'GET', `/api/noah/ask?agent=${encodeURIComponent(agent)}`),
      askGet: (id) => send((request) => askApi.item(request, id), 'GET', `/api/noah/ask/${id}`),
      askStop: (id, revision, headers) => send((request) => askApi.item(request, id), 'POST', `/api/noah/ask/${id}`, { action: 'stop', revision }, headers),
    };
  };
  /**
   * 画面の試験（tests/fixtures/noah/screen.mjs）へ渡す fetch。画面が送った要求を、本物の入口（一覧・計画・接続）へ通す。
   * session.user が、今サインインしている人（null なら未サインイン）。途中で変えると、サインインした後の画面を試せる。
   * ブラウザと同じく、書き込みの要求には Origin を付ける。知らない道は 404。
   */
  const browser = (session, config = {}) => async (request) => {
    const { deps, api, planApi, askApi } = as(session.user, config);
    const url = new URL(request.url, ORIGIN), path = url.pathname;
    const route = path === '/api/noah/intake' ? createIntakeApi(deps)
      : path === '/api/noah/connect-plan' ? planApi
      : path === '/api/noah/connect' ? api.collection
      : /^\/api\/noah\/connect\/[^/]+\/tools$/.test(path) ? (incoming) => api.tools(incoming, path.split('/')[4])
      : /^\/api\/noah\/connect\/[^/]+$/.test(path) ? (incoming) => api.item(incoming, path.split('/')[4])
      : path === '/api/noah/ask' ? askApi.collection
      : /^\/api\/noah\/ask\/[^/]+$/.test(path) ? (incoming) => askApi.item(incoming, path.split('/')[4])
      : path === '/api/noah/shelf' ? createNoahShelfApi({ ...deps, shelfFlags: parseNoahShelfFlags(config.env ?? options.env ?? OPEN) })
      : path === '/api/noah/trial' ? createNoahTrialApi({ ...deps, shelfFlags: parseNoahShelfFlags(config.env ?? options.env ?? OPEN) })
      : null;
    if (!route) return { status: 404, body: { error: '見つかりません。' } };
    const response = await route(new Request(url, {
      method: request.method, headers: { ...request.headers, ...(request.method === 'GET' ? {} : { Origin: ORIGIN }) },
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
    }));
    return { status: response.status, body: await response.json() };
  };
  const rows = (where = '1=1', ...args) => f.sql.prepare(`SELECT * FROM noah_connections WHERE ${where} ORDER BY created_at,id`).all(...args);
  /** 依頼の行（古い順）と、その Work（成果の正本）。 */
  const asked = (where = '1=1', ...args) => f.sql.prepare(`SELECT * FROM noah_asks WHERE ${where} ORDER BY created_at,id`).all(...args);
  const work = (id) => { const row = f.sql.prepare('SELECT payload,revision FROM work_jobs WHERE id=?').get(id); return row ? JSON.parse(row.payload) : null; };
  const listed = async () => (await f.store.list(null, new URLSearchParams())).items.map((item) => item.id).sort((a, b) => a.localeCompare(b));
  return { f, net, servers, as, browser, patrol, sync, clear, rows, asked, work, listed, check: (i) => f.check(i), family: (i) => f.sql.prepare('SELECT * FROM noah_intake_families WHERE id=?').get(familyId(i)) };
}
