/**
 * 接続（Passport）: 取り込んだ系列（相手のサーバーで動く Agent）へ、1 回の操作でつなぐ・やり直す・切る。つないだ後の、道具の一覧。
 *
 * ローンチの範囲（docs/noah/spec-74-one-click-connect.md の 11 章）:
 * - つなげるのは、一覧に載せている系列だけ（鍵の要る物・量産・取り下げた物へ、画面を通さない要求でつながせない）。
 * - 接続は、要求 1 回の中で握手まで終え、結果を返す。握手は lib/noah-user-handshake.ts（接続先の枠・8 秒・401 と 429 の扱い）。
 * - 同じ操作 ID の再送は、今の行をそのまま返す（握手をやり直さない）。同じ本人・同じ系列の、切っていない接続は 1 件。
 * - 行の更新は、全部 `WHERE id=? AND revision=?`（古い読み取りで上書きしない）。状態は nextNoahConnectionState でだけ進める。
 * - 切った時は、その接続の、終わっていない依頼を止める（lib/noah-ask-store.ts）。
 * - 家の端末を同じボタンでつなぐ道・相手の許可の続き・有料は、出した後に足す。今の `/api/noah/launch`・`/api/noah/instances` は変えない。
 * ここは、本人の端末では何も動かさない。相手へ送るのは、握手（初期化・通知・道具の一覧）だけ。道具は呼ばない。
 * 道具の一覧の決まりは docs/noah/spec-87-tool-agent.md の 11.3。
 */
import { NoahAgentError } from './noah-agent-upload.ts';
import { createNoahBrowserQuota, NOAH_BROWSER_QUOTA_MESSAGE } from './noah-browser-quota.ts';
import { boundedNoahBody } from './noah-agent-api.ts';
import { stopNoahAsksOfConnection } from './noah-ask-store.ts';
import { nextNoahConnectionState, type NoahConnectionEvent, type NoahConnectionState } from './noah-connect-plan.ts';
import { canonicalJson, diffNoahConnect, parseNoahConnect, sha256Hex, type NoahConnect } from './noah-connect-requirements.ts';
import { NOAH_INTAKE_PERMISSIONS, noahPlaceLabel, noahProviderTarget, planNoahSubject, readNoahSubject } from './noah-connect-source.ts';
import { noahAllowed, type NoahFlags } from './noah-flags.ts';
import { noahConnectGate, noahToolForm, noahToolMenu, type NoahConfirmedTool } from './noah-form.ts';
import { intakeStatement } from './noah-intake-db.ts';
import { NOAH_LISTING_SQL } from './noah-intake-listing.ts';
import type { IntakeDependencies } from './noah-intake-sync.ts';
import { NOAH_CARD_OF_FAMILY, NOAH_LIVE_CARDS, NOAH_SAME_PACKAGE, noahPlanActive, noahPlanOf, type NoahPlanLimits } from './noah-plan.ts';
import { NOAH_PLAN_CARDS, noahPlanConnectGate } from './noah-shelf.ts';
import { createNoahUserHandshake, type NoahUserHandshake, type NoahUserHandshakeTarget } from './noah-user-handshake.ts';
import { ownerScopeFor, OWNER_SCOPE_HEADER } from './owner-intent.ts';

export type NoahConnectDependencies = IntakeDependencies & {
  flags: NoahFlags;
  authorizeAction?: (owner:string,target:string,action:string,digest:string,confirmed:boolean)=>Promise<void>;
  /** つなげる数を、料金ごとのカードの数にする（task 113。切り替え NOAH_PLAN_LIMITS と、本人の料金の読み方）。無ければ、今の上限のまま。 */
  planLimits?: NoahPlanLimits;
  /** 応答を返した後に続ける仕事を預ける（Workers の waitUntil）。無ければ、その場で待つ。握手のセッションを閉じる要求に使う。 */
  waitUntil?: (promise: Promise<unknown>) => void;
};
export type NoahConnectApiDependencies = NoahConnectDependencies & { authenticate: (request: Request) => Promise<string>; reviewers: string[] };

/** 数値は候補。 */
export const NOAH_CONNECT_LIMITS = {
  /** 接続の要求の本文。 */
  bodyBytes: 4_000,
  /** 失敗の後、やり直せるまで（続けて押して、相手へ握手を送り続けない）。 */
  retryAfterMs: 5_000,
  /** 道具の一覧を、同じ接続で続けて開けるまで（同じ接続先へ、続けて握手しない）。 */
  toolsEveryMs: 5_000,
  /** 道具の一覧で、入力欄の定義を付ける道具の数（並びの先頭から）。 */
  toolForms: 100,
  /** 道具 1 つを読んだ時に返す、説明の長さ。 */
  toolDescriptionChars: 4_000,
  /** 本人の、切っていない接続の一覧に出す数。 */
  listed: 50,
};

/** 画面に出す文。 */
export const NOAH_CONNECT_MESSAGES = {
  closed: '今は、新しい接続を受け付けていません。',
  toolsClosed: '今は、新しい依頼を受け付けていません。',
  missingAgent: 'Agentが見つかりません。',
  missing: '接続が見つかりません。',
  unlisted: 'この Agent は、今はつなげません。',
  changedRequest: '同じ操作IDの内容は変更できません。',
  changedPlan: '条件が変わりました。もう一度確かめてください。',
  newerVersion: '新しい版があります。つながっているものの一覧で確かめてください。',
  stale: '内容が更新されました。再読込してください。',
  notNow: '今は、その操作はできません。',
  wait: '少し待ってから試してください。',
  toolsWait: '少し待ってから開いてください。',
  notConnected: '接続を確かめてください。',
  withdrawn: 'この Agent は、取り下げられました。使えません。',
  unusable: 'この Agent は、今は使えません。',
  reconsent: 'この Agent の接続先や条件が変わりました。切って、つなぎ直してください。',
  noTools: 'この Agent には、今、使える道具がありません。時間をおいて試してください。',
  interrupted: 'つなぐ途中で止まりました。もう一度試してください。',
  missingTool: '道具が見つかりません。',
};

type Row = {
  id: string; owner_id: string; family_key: string; agent_id: string; digest: string; request_sha256: string;
  connect_json: string; connect_sha256: string; plan_sha256: string; tools_sha256: string | null; confirmed_tools_json: string;
  place: 'provider' | 'home' | 'cloud' | 'pocket'; state: NoahConnectionState; error: string | null; revision: number;
  created_at: number; updated_at: number; connected_at: number | null; last_used_at: number | null; disconnected_at: number | null;
  /** 系列の代表の候補の名前。系列が無くなっていれば null。 */
  agent_name: string | null;
  target_url: string | null;
};
// 名前は、今の系列の代表から読む（接続の行には持たない）。送り先は、本人が同意した時の接続要件から読む。
const SELECT = (columns: string) => `SELECT ${columns},c.name AS agent_name,json_extract(n.connect_json,'$.target.url') AS target_url
 FROM noah_connections n LEFT JOIN noah_intake_families f ON f.id=n.family_key LEFT JOIN noah_intake_candidates c ON c.id=f.representative_id`;
const COLUMNS = 'n.id,n.owner_id,n.family_key,n.agent_id,n.digest,n.request_sha256,n.connect_sha256,n.plan_sha256,n.tools_sha256,n.confirmed_tools_json,n.place,n.state,n.error,n.revision,n.created_at,n.updated_at,n.connected_at,n.last_used_at,n.disconnected_at';
const ONE = `${SELECT(`${COLUMNS},n.connect_json`)} WHERE n.id=? AND n.owner_id=?`;
const LIVE = `${SELECT(`${COLUMNS},n.connect_json`)} WHERE n.owner_id=? AND n.family_key=? AND n.disconnected_at IS NULL`;
// 一覧は、接続要件の本文を読まない（1 件が 16KB まである）。
const MINE = `${SELECT(`${COLUMNS},'' AS connect_json`)} WHERE n.owner_id=? AND n.disconnected_at IS NULL ORDER BY n.updated_at DESC,n.id LIMIT ?`;

const hostOf = (url: string | null) => {
  try { return url ? new URL(url).hostname.toLowerCase() : null; } catch { return null; }
};
/** 接続 1 件の、応答の形（spec-74 の 4.2）。本人の ID と、接続要件の本文は出さない。 */
function view(row: Row) {
  return {
    id: row.id, state: row.state, revision: row.revision, agentId: row.agent_id, name: row.agent_name ?? row.agent_id, digest: row.digest,
    place: row.place, placeLabel: noahPlaceLabel(row.place, hostOf(row.target_url)), deviceId: null,
    ...(row.error ? { error: row.error } : {}),
    ...(row.connected_at !== null ? { connectedAt: row.connected_at } : {}),
    ...(row.last_used_at !== null ? { lastUsedAt: row.last_used_at } : {}),
  };
}
export type NoahConnectionView = ReturnType<typeof view>;
export type NoahConnectReply = { status: number; body: Record<string, unknown> };
const reply = (status: number, body: Record<string, unknown>): NoahConnectReply => ({ status, body });
/** 断る時の応答。今の接続を添える時は、connection に入れる（その行の error と、この応答の error を、混ぜない）。 */
const failed = (status: number, error: string, extra: Record<string, unknown> = {}) => reply(status, { error, ...extra });
const refused = (status: number, error: string, row: Row, extra: Record<string, unknown> = {}) => failed(status, error, { connection: view(row), ...extra });

/** 状態を、出来事の並びで進める。決まっていない組み合わせは 409。 */
function advance(state: NoahConnectionState, ...events: NoahConnectionEvent[]): NoahConnectionState {
  let current = state;
  for (const event of events) {
    const next = nextNoahConnectionState(current, event);
    if (!next) throw new NoahAgentError(NOAH_CONNECT_MESSAGES.notNow, 409);
    current = next;
  }
  return current;
}
/** 握手の手前まで（利用権は、今は全部無料。置き場所の準備は、相手のサーバーには無い）。 */
const PREPARE: NoahConnectionEvent[] = ['entitle_start', 'entitle_ok', 'prepare_ok'];

function confirmedTools(raw: string): NoahConfirmedTool[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item): item is NoahConfirmedTool => !!item && typeof item === 'object' && typeof (item as NoahConfirmedTool).name === 'string' && typeof (item as NoahConfirmedTool).sha256 === 'string') : [];
  } catch {
    return [];
  }
}

export function createNoahConnectService(deps: NoahConnectDependencies) {
  const { db, flags } = deps, now = deps.now ?? Date.now;
  const prepare = (sql: string, ...args: (string | number | null)[]) => db.prepare(sql).bind(...args);
  const { handshake } = createNoahUserHandshake({ ...deps, hostHandshakes: flags.askLimits.hostHandshakes });
  // ブラウザだけの本人を全員まとめた、1 日の新しい接続の上限（task 129 の D1）。
  const browserQuota = createNoahBrowserQuota(db, now);
  const readOne = (owner: string, id: string) => prepare(ONE, id, owner).first<Row>();
  /** セッションを閉じる要求は、本人を待たせない（結果と状態を書き終えた後に送る。届かなくても、結果は変わらない）。 */
  const afterwards = async (work: Promise<unknown>) => { if (deps.waitUntil) deps.waitUntil(work); else await work; };

  /**
   * 握手して、その結果で接続を進める（probing → connected か failed）。row は、probing に進めた後の行。
   * 途中で切られていた（revision が変わった）時は、書かずに、今の行を返す。
   */
  async function probe(row: Row, target: NoahUserHandshakeTarget): Promise<Row> {
    let result: NoahUserHandshake | null = null, error: string = NOAH_CONNECT_MESSAGES.interrupted;
    try {
      result = await handshake(target,{owner:row.owner_id});
      if (!result.ok) error = result.message;
      // 道具が 1 つも無い接続先は、頼める事が無い。握手の表には書かない（外すかどうかは、巡回が決める）。
      else if (result.handshake.tools.length < 1) error = NOAH_CONNECT_MESSAGES.noTools;
    } catch { /* 表を読み書きできなかった。下で、失敗として残す（本人は、やり直せる）。 */ }
    const at = now();
    const next: Row = result?.ok && result.handshake.tools.length > 0
      ? { ...row, state: advance('probing', 'probe_ok'), tools_sha256: result.handshake.toolsSha256, connected_at: at, error: null, revision: row.revision + 1, updated_at: at }
      : { ...row, state: advance('probing', 'probe_failed'), error, revision: row.revision + 1, updated_at: at };
    const written = next.state === 'connected'
      ? await prepare("UPDATE noah_connections SET state=?,tools_sha256=?,probe_ms=?,connected_at=?,error=NULL,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND state='probing'",
          next.state, next.tools_sha256, result?.ok ? result.ms : null, at, at, row.id, row.revision).run()
      : await prepare("UPDATE noah_connections SET state=?,error=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND state='probing'", next.state, next.error, at, row.id, row.revision).run();
    // 握手は、道具の一覧を読んだ所で終わり。セッションを使う相手には、閉じる要求を送る（結果を書いた後）。
    if (result?.ok) await afterwards(result.close());
    // 握手の間に切られていた時は、書かれていない。今の行を返す。
    return written.meta.changes === 1 ? next : (await readOne(row.owner_id, row.id)) ?? row;
  }

  /** `POST /api/noah/connect`。spec-74 の 11.3。 */
  async function connect(owner: string, reviewer: boolean, input: { id: string; agentId: string; planSha256: string; packageId?: string | null }): Promise<NoahConnectReply> {
    if (!noahAllowed(flags, 'ask', reviewer)) return failed(503, NOAH_CONNECT_MESSAGES.closed);
    const requestSha256 = await sha256Hex(canonicalJson({ agentId: input.agentId, planSha256: input.planSha256 }));
    // 同じ操作 ID の再送は、今の行を返す（握手をやり直さない。1 回目が一覧や計画を変えた後でも、同じ応答になる）。
    const again = async () => {
      const row = await readOne(owner, input.id);
      return row ? (row.request_sha256 === requestSha256 ? reply(200, view(row)) : failed(409, NOAH_CONNECT_MESSAGES.changedRequest)) : null;
    };
    const repeated = await again();
    if (repeated) return repeated;

    const subject = await readNoahSubject(db, input.agentId);
    if (!subject) return failed(404, NOAH_CONNECT_MESSAGES.missingAgent);
    const { target } = subject;
    if (!subject.listing.listed || !target) return failed(422, NOAH_CONNECT_MESSAGES.unlisted);
    // 同じ系列の、切っていない接続（前に同意した接続要件も、ここから読む）。
    const existing = () => prepare(LIVE, owner, subject.familyId).first<Row>();
    const same = (row: Row) => (row.digest === subject.digest ? reply(200, view(row)) : failed(409, NOAH_CONNECT_MESSAGES.newerVersion));
    const live = await existing();
    const { plan, view: planned } = await planNoahSubject(deps, owner, { ...subject, target }, live?.connect_sha256 ?? null);
    if (planned.planSha256 !== input.planSha256) return failed(409, NOAH_CONNECT_MESSAGES.changedPlan, { plan: planned });
    if (plan.badge === 'blocked' || plan.cost.typed > 0) return failed(422, `準備が必要です。${plan.need ?? plan.reason ?? ''}`, { plan: planned });
    // あれば、新しい行を作らずに、それを返す。
    if (live) return same(live);

    // つなぐ前の上限。新しく行を作る時だけ数える。越えていれば、行を作らない。相手へ送らない。
    const at = now();
    const counts = await intakeStatement(db, NOAH_LISTING_SQL.connect_gate, { owner, minute_ago: at - 60_000, day_ago: at - 86_400_000 }).first<{ live: number; last_minute: number; last_day: number }>();
    // 料金ごとの数（切り替えが開いていて、料金の読み方がある時だけ）: 数えるのはカード。同じカードの中の 2 本目は、数を増やさない。
    const limits = deps.planLimits;
    const packageId = noahPlanActive(limits) && input.packageId && (await prepare(NOAH_CARD_OF_FAMILY, input.packageId, subject.familyId).first()) ? input.packageId : null;
    let gate = noahConnectGate({ live: counts?.live ?? 0, lastMinute: counts?.last_minute ?? 0, lastDay: counts?.last_day ?? 0 }, flags.askLimits);
    if (noahPlanActive(limits)) {
      const cards = (await prepare(NOAH_LIVE_CARDS, owner).first<{ live_cards: number }>())?.live_cards ?? 0;
      const same = packageId ? !!(await prepare(NOAH_SAME_PACKAGE, owner, packageId).first()) : false;
      gate = noahPlanConnectGate(await noahPlanOf(limits.source, owner), { liveCards: cards, lastMinute: counts?.last_minute ?? 0, lastDay: counts?.last_day ?? 0 }, same ? 'same_package' : 'new_card');
    }
    if (!gate.ok) return failed(gate.status, gate.message);
    if (!(await browserQuota.take(owner, 'connections'))) return failed(429, NOAH_BROWSER_QUOTA_MESSAGE);

    // 行を入れ、握手の手前まで進める（1 回の書き込み）。入らなかった時は、同じ操作か、同じ系列の別の操作が、先に入っている。
    const consent = JSON.stringify({ permissions: NOAH_INTAKE_PERMISSIONS, sendsTo: target.host, at });
    const [inserted, advanced] = await db.batch([
      prepare(`INSERT OR IGNORE INTO noah_connections(id,owner_id,family_key,agent_id,digest,request_sha256,connect_json,connect_sha256,plan_sha256,place,state,consent_json,price_json,cost_taps,cost_typed,revision,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,'provider','planned',?,?,?,?,1,?,?)`,
        input.id, owner, subject.familyId, subject.familyId, subject.digest, requestSha256, target.connectJson, target.connectSha256, planned.planSha256, consent, JSON.stringify(planned.price), plan.cost.taps, plan.cost.typed, at, at),
      prepare("UPDATE noah_connections SET state=?,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND request_sha256=? AND revision=1 AND state='planned'", advance('planned', ...PREPARE), at, input.id, owner, requestSha256),
      // カードの中でつないだ接続（同じ書き込みの中で。接続の行が入った時だけ）。
      ...(packageId ? [prepare('INSERT OR IGNORE INTO noah_package_connections(connection_id, package_id) SELECT ?, ? WHERE EXISTS (SELECT 1 FROM noah_connections WHERE id=? AND owner_id=? AND request_sha256=?)',
        input.id, packageId, input.id, owner, requestSha256)] : []),
    ]);
    if (inserted.meta.changes !== 1 || advanced.meta.changes !== 1) {
      const sameId = await again();
      if (sameId) return sameId;
      const sameFamily = await existing();
      return sameFamily ? same(sameFamily) : failed(409, NOAH_CONNECT_MESSAGES.changedRequest);
    }
    const row: Row = {
      id: input.id, owner_id: owner, family_key: subject.familyId, agent_id: subject.familyId, digest: subject.digest, request_sha256: requestSha256,
      connect_json: target.connectJson, connect_sha256: target.connectSha256, plan_sha256: planned.planSha256, tools_sha256: null, confirmed_tools_json: '[]',
      place: 'provider', state: advance('planned', ...PREPARE), error: null, revision: 2, created_at: at, updated_at: at, connected_at: null, last_used_at: null, disconnected_at: null,
      agent_name: subject.name, target_url: target.url,
    };
    return reply(200, view(await probe(row, { candidateId: subject.candidateId, connectSha256: target.connectSha256, url: target.url, host: target.host })));
  }

  /** 1 件。別の本人の ID は、無い物として扱う。 */
  async function get(owner: string, id: string): Promise<NoahConnectReply> {
    const row = await readOne(owner, id);
    return row ? reply(200, view(row)) : failed(404, NOAH_CONNECT_MESSAGES.missing);
  }

  /** 本人の、切っていない接続（新しい順）。 */
  async function list(owner: string): Promise<NoahConnectReply> {
    const rows = (await prepare(MINE, owner, NOAH_CONNECT_LIMITS.listed).all<Row>()).results;
    // 料金ごとの数を使っている時は、つないでいるカードの数と、上限を添える（「6 個のうち 4 個」）。
    const limits = deps.planLimits;
    if (!noahPlanActive(limits)) return reply(200, { connections: rows.map(view) });
    const plan = await noahPlanOf(limits.source, owner), live = (await prepare(NOAH_LIVE_CARDS, owner).first<{ live_cards: number }>())?.live_cards ?? 0;
    return reply(200, { connections: rows.map(view), cards: { live, limit: NOAH_PLAN_CARDS[plan], plan } });
  }

  /** `disconnect`: 切る。記録は残る。切った後は、同じ系列をつなぎ直せる。切り替えが閉じていても、切れる。 */
  async function disconnect(owner: string, id: string, revision: number): Promise<NoahConnectReply> {
    const row = await readOne(owner, id);
    if (!row) return failed(404, NOAH_CONNECT_MESSAGES.missing);
    if (row.revision !== revision) return refused(409, NOAH_CONNECT_MESSAGES.stale, row);
    const next = nextNoahConnectionState(row.state, 'disconnect');
    if (!next) return refused(409, NOAH_CONNECT_MESSAGES.notNow, row);
    const at = now();
    const written = await prepare('UPDATE noah_connections SET state=?,disconnected_at=?,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND revision=?', next, at, at, id, owner, revision).run();
    if (written.meta.changes === 1) {
      // その接続の、終わっていない依頼を止める（まだ始まっていない物は、その場で。進んでいる物は、止める事を頼む。届いた成果は、採らない）。
      await stopNoahAsksOfConnection(deps, owner, id);
      return reply(200, view({ ...row, state: next, disconnected_at: at, revision: revision + 1, updated_at: at }));
    }
    // 読んだ後に、別の操作が先に書いた。今の行を返す。
    const after = await readOne(owner, id);
    return after ? refused(409, NOAH_CONNECT_MESSAGES.stale, after) : failed(404, NOAH_CONNECT_MESSAGES.missing);
  }

  /** `retry`: 失敗した接続を、計画の確かめからやり直す。行は作らないので、つなぐ前の上限は見ない。 */
  async function retry(owner: string, reviewer: boolean, id: string, revision: number): Promise<NoahConnectReply> {
    if (!noahAllowed(flags, 'ask', reviewer)) return failed(503, NOAH_CONNECT_MESSAGES.closed);
    const row = await readOne(owner, id);
    if (!row) return failed(404, NOAH_CONNECT_MESSAGES.missing);
    if (row.revision !== revision) return refused(409, NOAH_CONNECT_MESSAGES.stale, row);
    if (row.state !== 'failed') return refused(409, NOAH_CONNECT_MESSAGES.notNow, row);
    const at = now();
    if (at - row.updated_at < NOAH_CONNECT_LIMITS.retryAfterMs) return refused(429, NOAH_CONNECT_MESSAGES.wait, row);

    const subject = await readNoahSubject(db, row.family_key);
    const target = subject?.target;
    if (!subject || !subject.listing.listed || !target) return refused(422, NOAH_CONNECT_MESSAGES.unlisted, row);
    const { plan, view: planned } = await planNoahSubject(deps, owner, { ...subject, target }, row.connect_sha256);
    if (plan.badge === 'blocked' || plan.cost.typed > 0) return refused(422, `準備が必要です。${plan.need ?? plan.reason ?? ''}`, row, { plan: planned });
    // 本人が同意した時から、接続先や条件が変わっていたら、黙って新しい相手へつながない（切って、つなぎ直す時に、新しい送り先を見せる）。
    if (row.connect_sha256 !== target.connectSha256 && reconsent(row.connect_json, target.connect)) return refused(409, NOAH_CONNECT_MESSAGES.reconsent, row);

    const state = advance('failed', 'retry', ...PREPARE);
    const written = await prepare("UPDATE noah_connections SET state=?,digest=?,connect_json=?,connect_sha256=?,plan_sha256=?,error=NULL,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND revision=? AND state='failed'",
      state, subject.digest, target.connectJson, target.connectSha256, planned.planSha256, at, id, owner, revision).run();
    if (written.meta.changes !== 1) {
      const after = await readOne(owner, id);
      return after ? refused(409, NOAH_CONNECT_MESSAGES.stale, after) : failed(404, NOAH_CONNECT_MESSAGES.missing);
    }
    const probing: Row = { ...row, state, digest: subject.digest, connect_json: target.connectJson, connect_sha256: target.connectSha256, plan_sha256: planned.planSha256,
      error: null, revision: revision + 1, updated_at: at, agent_name: subject.name, target_url: target.url };
    return reply(200, view(await probe(probing, { candidateId: subject.candidateId, connectSha256: target.connectSha256, url: target.url, host: target.host })));
  }

  /**
   * 使ってよい接続か（道具の一覧と、依頼が、相手へ送る前に確かめる）。使えない時は NoahAgentError（404・409）。
   * - 同じ本人の、置き場所が相手のサーバーの、`connected` の接続である事。
   * - その接続の候補が有効で、候補が今いる系列が取り下げられていない事。取り下げられていたら、接続を `blocked` にする。
   * - 本人が同意した時から、接続先や条件が変わっていない事。送り先は、同意した時の接続要件から読む（本人に見せた host の外へ送らない）。
   */
  async function usable(owner: string, id: string): Promise<{
    connection: NoahConnectionView; familyKey: string;
    /** つないだ時の版（候補の記録の hash）と、つないだ時に読んだ道具の定義の hash（無ければ空）。Work の記録に写す。 */
    digest: string; toolsSha256: string;
    confirmed: NoahConfirmedTool[]; target: NoahUserHandshakeTarget;
  }> {
    const row = await readOne(owner, id);
    if (!row || row.place !== 'provider') throw new NoahAgentError(NOAH_CONNECT_MESSAGES.missing, 404);
    if (row.state !== 'connected') throw new NoahAgentError(row.state === 'blocked' && row.error ? row.error : NOAH_CONNECT_MESSAGES.notConnected, 409);
    let consented: NoahConnect | null = null;
    try { consented = parseNoahConnect(JSON.parse(row.connect_json)); } catch { /* 読めない写しは、使えない物として扱う。 */ }
    const found = consented ? noahProviderTarget(consented) : null;
    const candidateId = consented?.candidateId;
    if (!consented || !found || !candidateId) throw new NoahAgentError(NOAH_CONNECT_MESSAGES.unusable, 409);
    const current = await prepare(`SELECT c.state,f.withdrawn_at,k.connect_json,k.connect_sha256 FROM noah_intake_candidates c
      LEFT JOIN noah_intake_families f ON f.id=c.family_id LEFT JOIN noah_intake_checks k ON k.candidate_id=c.id WHERE c.id=?`, candidateId)
      .first<{ state: string; withdrawn_at: number | null; connect_json: string | null; connect_sha256: string | null }>();
    if (!current || current.state === 'withdrawn' || current.withdrawn_at !== null) {
      // 出どころが外した記録・運営が取り下げた記録へ、送り続けない。
      const at = now();
      await prepare("UPDATE noah_connections SET state=?,error=?,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND revision=? AND state='connected'",
        advance('connected', 'revoked'), NOAH_CONNECT_MESSAGES.withdrawn, at, id, owner, row.revision).run();
      throw new NoahAgentError(NOAH_CONNECT_MESSAGES.withdrawn, 409);
    }
    if (current.state !== 'active' || !current.connect_json || !current.connect_sha256) throw new NoahAgentError(NOAH_CONNECT_MESSAGES.unusable, 409);
    if (current.connect_sha256 !== row.connect_sha256 && reconsent(row.connect_json, current.connect_json)) throw new NoahAgentError(NOAH_CONNECT_MESSAGES.reconsent, 409);
    // 握手の記録を書く時の照らし先は、今の接続要件の hash（取り込みが入れ替えた後の記録を、古い握手で書かない）。
    return { connection: view(row), familyKey: row.family_key, digest: row.digest, toolsSha256: row.tools_sha256 ?? '', confirmed: confirmedTools(row.confirmed_tools_json), target: { candidateId, connectSha256: current.connect_sha256, ...found } };
  }

  /** `GET /api/noah/connect/[id]/tools`: つないだ相手の道具の一覧（選ぶ画面）。道具の定義は保存しない。開くたびに、相手から読む。spec-87 の 11.3。 */
  async function tools(owner: string, reviewer: boolean, id: string, toolName: string | null): Promise<NoahConnectReply> {
    if (!noahAllowed(flags, 'ask', reviewer)) return failed(503, NOAH_CONNECT_MESSAGES.toolsClosed);
    const { confirmed, target } = await usable(owner, id);
    // 同じ接続で、続けて開かない（同じ接続先へ、続けて握手しない）。握手の前に時刻を書いて、同時の 2 回目も止める。
    const at = now();
    const claimed = await prepare("UPDATE noah_connections SET last_used_at=? WHERE id=? AND owner_id=? AND state='connected' AND (last_used_at IS NULL OR last_used_at<=?)", at, id, owner, at - NOAH_CONNECT_LIMITS.toolsEveryMs).run();
    if (claimed.meta.changes !== 1) return failed(429, NOAH_CONNECT_MESSAGES.toolsWait);
    const result = await handshake(target,{owner});
    if (!result.ok) return failed(result.code === 'host_busy' || result.code === 'rate_limited' ? 429 : result.code === 'auth_required' || result.code === 'payment_required' ? 409 : 502, result.message);
    try {
      const definitions = new Map(result.handshake.tools.map((tool) => [tool.name, tool]));
      const menu = await noahToolMenu(result.handshake.tools, confirmed);
      const head = { host: target.host, toolsSha256: result.handshake.toolsSha256 };
      if (toolName !== null) {
        const item = menu.find((entry) => entry.name === toolName), definition = definitions.get(toolName);
        if (!item || !definition) return failed(404, NOAH_CONNECT_MESSAGES.missingTool);
        return reply(200, { ...head, tools: [{ ...item, form: item.usable ? noahToolForm(definition) : null, description: Array.from(definition.description).slice(0, NOAH_CONNECT_LIMITS.toolDescriptionChars).join('') }] });
      }
      // 入力欄の定義は、並びの先頭から決まった数の、使える道具にだけ付ける。それより後ろは、?tool= で 1 つずつ読む。
      let forms = 0;
      return reply(200, { ...head, tools: menu.map((item) => {
        const definition = definitions.get(item.name);
        return { ...item, form: item.usable && definition && forms++ < NOAH_CONNECT_LIMITS.toolForms ? noahToolForm(definition) : null };
      }) });
    } finally {
      await afterwards(result.close());
    }
  }

  return { connect, get, list, disconnect, retry, usable, tools };
}

/** 本人が同意した接続要件（写し）と、今の接続要件が、同意し直しの要る所で違うか。読めない時は、違う物として扱う。 */
function reconsent(consentedJson: string, current: NoahConnect | string): boolean {
  try {
    return diffNoahConnect(parseNoahConnect(JSON.parse(consentedJson)), typeof current === 'string' ? parseNoahConnect(JSON.parse(current)) : current).reconsent;
  } catch {
    return true;
  }
}

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const plain = (value: unknown, min: number, max: number): value is string => typeof value === 'string' && value.length >= min && value.length <= max && !Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);

function failure(error: unknown) {
  if (error instanceof NoahAgentError) return json({ error: error.status === 413 ? '送信内容が大きすぎます。' : error.message }, error.status);
  if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: '保存先を開けませんでした。もう一度お試しください。' }, 401);
  return json({ error: '接続を確かめられません。少し待ってから再試行してください。' }, 503);
}

/**
 * 接続の入口。collection は `/api/noah/connect`、item は `/api/noah/connect/[id]`、tools は `/api/noah/connect/[id]/tools`。
 * どれも、サインイン済みの本人だけ。書き込みは、同じ Noah の画面から（Origin）、始めた時と同じ account で（ownerScope）、JSON で。
 */
export function createNoahConnectApi(deps: NoahConnectApiDependencies) {
  const service = createNoahConnectService(deps);
  type Context = { owner: string; reviewer: boolean; ownerScope: string; url: URL };
  const respond = async (request: Request, methods: string[], handle: (context: Context) => Promise<NoahConnectReply | Response>) => {
    try {
      if (!methods.includes(request.method)) return json({ error: '対応しない操作です。' }, 405);
      const owner = await deps.authenticate(request), url = new URL(request.url), ownerScope = await ownerScopeFor(owner);
      if (request.method !== 'GET') {
        if (request.headers.get('origin') !== url.origin) return json({ error: '同じNoahから操作してください。' }, 403);
        if (request.headers.get(OWNER_SCOPE_HEADER) !== ownerScope) return json({ error: 'アカウントが変わりました。再読込してください。' }, 409);
        if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSONで操作してください。' }, 415);
      }
      const result = await handle({ owner, reviewer: deps.reviewers.includes(owner), ownerScope, url });
      return result instanceof Response ? result : json({ ...result.body, ownerScope }, result.status);
    } catch (error) {
      return failure(error);
    }
  };
  const input = async (request: Request, keys: string[], optional: string[] = []) => {
    const bytes = await boundedNoahBody(request, NOAH_CONNECT_LIMITS.bodyBytes);
    let value: unknown;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw new NoahAgentError('入力形式を確認してください。'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new NoahAgentError('入力形式を確認してください。');
    const record = value as Record<string, unknown>, given = Object.keys(record);
    if (!keys.every((key) => given.includes(key)) || !given.every((key) => keys.includes(key) || optional.includes(key))) throw new NoahAgentError('入力形式を確認してください。');
    return record;
  };
  const missing = () => json({ error: NOAH_CONNECT_MESSAGES.missing }, 404);

  return {
    collection: (request: Request) => respond(request, ['GET', 'POST'], async ({ owner, reviewer }) => {
      if (request.method === 'GET') return service.list(owner);
      // packageId: 棚のカードから始めた接続（任意。つなげる数を、カードで数えるため）。
      const body = await input(request, ['id', 'agentId', 'planSha256'], ['packageId']);
      if (typeof body.id !== 'string' || !UUID.test(body.id) || !plain(body.agentId, 3, 400) || typeof body.planSha256 !== 'string' || !HEX64.test(body.planSha256)) throw new NoahAgentError('操作ID・Agent・計画を確認してください。');
      if (body.packageId !== undefined && (typeof body.packageId !== 'string' || !/^pkg:[a-z0-9][a-z0-9-]{1,62}$/u.test(body.packageId))) throw new NoahAgentError('カードの ID を確認してください。');
      return service.connect(owner, reviewer, { id: body.id, agentId: body.agentId, planSha256: body.planSha256, packageId: body.packageId ?? null });
    }),
    item: (request: Request, id: string) => respond(request, ['GET', 'POST'], async ({ owner, reviewer }) => {
      if (!UUID.test(id)) return missing();
      if (request.method === 'GET') return service.get(owner, id);
      const body = await input(request, ['action', 'revision']);
      if ((body.action !== 'disconnect' && body.action !== 'retry') || !Number.isSafeInteger(body.revision) || Number(body.revision) < 1) throw new NoahAgentError('操作と版を確認してください。');
      return body.action === 'disconnect' ? service.disconnect(owner, id, Number(body.revision)) : service.retry(owner, reviewer, id, Number(body.revision));
    }),
    tools: (request: Request, id: string) => respond(request, ['GET'], async ({ owner, reviewer, url }) => {
      if (!UUID.test(id)) return missing();
      const tool = url.searchParams.get('tool');
      if (tool !== null && !/^[A-Za-z0-9_.:/-]{1,128}$/.test(tool)) return json({ error: NOAH_CONNECT_MESSAGES.missingTool }, 404);
      return service.tools(owner, reviewer, id, tool);
    }),
  };
}
