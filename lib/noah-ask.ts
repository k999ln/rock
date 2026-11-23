import { createNoahProviderRuntime, providerWorkView, type ProviderDependencies } from './noah-provider-runtime.ts';
import { isNoahManagedWork, noahManagedWorkView, listNoahManagedWork } from './noah-managed-work.ts';
/**
 * 頼む（入力欄から、つないだ相手の道具を 1 回呼ぶ）。受け付け・実行・読む・止める。
 *
 * ローンチの範囲（docs/noah/spec-87-tool-agent.md の 11 章）:
 * - 受け付けた応答（202）を返した後、同じ実行の中で続ける（`waitUntil`）。本人が画面を閉じても進む。
 * - 握手は 8 秒、道具の呼び出しは 20 秒まで。**道具は 1 回だけ呼ぶ。失敗しても呼び直さない**（相手で実行されたかどうかが、分からないため）。
 * - 呼ぶ前に、その道具の定義が、本人が入力欄を開いた時と同じ事を確かめる（本人が見ていない定義で呼ばない）。
 * - 読み取りだけと宣言されていない道具は、最初の 1 回、本人が画面で確かめてから（`confirm: true`）。確かめた記録は、名前と定義の hash の組。
 * - 入力欄に無い項目は、道具へ渡さない。送るのは、道具の名前と入力だけ。本人の名前・account・端末の情報は送らない。
 *   送り先は、接続の時に見せた host だけ（別の host への転送には従わない）。
 * - 依頼と成果の本文は Work にだけ置く。相手のサーバーが返した内容を、Noah は確かめていない（Work は `review` のまま）。
 * - 同じ操作 ID の再送は、今の状態を返す（もう 1 回呼ばない）。止めた後に届いた成果は、採らない。
 * 「1 文で頼む」（モデル・専用の Worker・「あなたの番」）は、出した後に足す。
 */
import { noahDelivery, noahExpectsImage } from './noah-output-receipt.ts';
import { NoahAgentError } from './noah-agent-upload.ts';
import { createNoahBrowserQuota, NOAH_BROWSER_QUOTA_MESSAGE } from './noah-browser-quota.ts';
import { boundedNoahBody } from './noah-agent-api.ts';
import { finishGoneNoahAsk, finishNoahAsk, noahAskRunGone, noahAskView, NOAH_ASK_COLUMNS, NOAH_ASK_END_MESSAGES, NOAH_ASK_STOP_MESSAGES, type NoahAskRow } from './noah-ask-store.ts';
import { createNoahConnectService, type NoahConnectApiDependencies, type NoahConnectDependencies } from './noah-connect.ts';
import { noahAllowed } from './noah-flags.ts';
import { checkNoahToolArgs, noahAskGate, noahFormArgs, noahFormRequestSha256, noahFormSummary, noahResultText, noahToolForm, noahToolSha256, NOAH_HOST_BUSY, type NoahConfirmedTool } from './noah-form.ts';
import { intakeStatement } from './noah-intake-db.ts';
import { NOAH_LISTING_SQL } from './noah-intake-listing.ts';
import { NOAH_CHECK_COLUMNS, NOAH_PROBE_FAMILY, noahCheckState, noahFamilyWrites, type NoahCheckRow, type NoahProbeFamily } from './noah-intake-probe.ts';
import { NoahMouthError, noahMcpCall, type NoahHandshake, type NoahToolDef } from './noah-mouth-mcp-remote.ts';
import { createNoahRemoteWork, startNoahRemoteWork, type NoahRemoteOutcome } from './noah-remote-work.ts';
import { createNoahUserHandshake, type NoahUserHandshakeTarget } from './noah-user-handshake.ts';
import { ownerScopeFor, OWNER_SCOPE_HEADER } from './owner-intent.ts';
import { workStore } from './work-store.ts';

export type NoahAskDependencies = NoahConnectDependencies;
export type NoahAskApiDependencies = NoahConnectApiDependencies & Pick<ProviderDependencies, 'providerDirectory'> & {
  cloudApi?: (request: Request) => Promise<Response>;
};

/** 数値は候補。 */
export const NOAH_ASK_RUN_LIMITS = {
  /** 依頼の要求の本文。 */
  bodyBytes: 16_000,
  /** 道具の呼び出しの待ち（応答を返した後に続けられる時間に、握手の 8 秒と合わせて収める）。 */
  callMs: 20_000,
  /** 実行の場が持つ時間。これを過ぎても `running` の依頼は、巡回の合図が「結果不明」にする（spec-88 の 9.5）。 */
  leaseMs: 30_000,
  /** 一覧に出す数。 */
  listed: 50,
  /** 道具が返した「できなかった」の文を、理由として残す長さ。 */
  errorChars: 240,
  /** 相手が、決まった形のエラーで返した文を、理由に添える長さ。 */
  rpcErrorChars: 200,
};

/** 画面に出す文。 */
export const NOAH_ASK_MESSAGES = {
  closed: '今は、新しい依頼を受け付けていません。',
  missing: '依頼が見つかりません。',
  changedRequest: '同じ操作IDの内容は変更できません。',
  promptOnly: '1 文で頼む機能は、まだ使えません。入力欄から使えます。',
  full: '進んでいる依頼が多すぎます。終わるまで待ってください。',
  stale: '内容が更新されました。再読込してください。',
  finished: 'この依頼は、もう終わっています。',
  toolChanged: 'この道具の内容が変わりました。入力欄を開き直してください。',
  toolUnusable: 'この道具は、入力欄では使えません。',
  argsMismatch: '入力の形が、道具の定義と合いません。',
  needsConfirm: 'この道具は、最初の 1 回、内容を確かめてから使います。',
  refusedCall: '相手のサーバーが、この依頼を断りました。',
  rejectedInput: '相手のサーバーが、この入力を受け付けませんでした。',
  tooLarge: '成果が大きすぎて、受け取れませんでした。相手のサーバーでは、実行されています。',
  unknown: NOAH_ASK_END_MESSAGES.unknown,
  interrupted: NOAH_ASK_END_MESSAGES.interrupted,
  toolFailed: '道具が、できなかったと返しました。',
};

export type NoahAskReply = { status: number; body: Record<string, unknown> };
const reply = (status: number, body: Record<string, unknown>): NoahAskReply => ({ status, body });
const failed = (status: number, error: string, extra: Record<string, unknown> = {}) => reply(status, { error, ...extra });
const clip = (value: string, chars: number) => Array.from(value).slice(0, chars).join('');
const ONE = `SELECT ${NOAH_ASK_COLUMNS} FROM noah_asks WHERE id=? AND owner_id=?`;

export function createNoahAskService(deps: NoahAskDependencies) {
  const { db, flags } = deps, now = deps.now ?? Date.now, jobs = workStore(db);
  const prepare = (sql: string, ...args: (string | number | null)[]) => db.prepare(sql).bind(...args);
  const connections = createNoahConnectService(deps);
  const hands = createNoahUserHandshake({ ...deps, hostHandshakes: flags.askLimits.hostHandshakes });
  // ブラウザだけの本人を全員まとめた、1 日の依頼の上限（task 129 の D1）。
  const browserQuota = createNoahBrowserQuota(db, now);
  const readOne = (owner: string, id: string) => prepare(ONE, id, owner).first<NoahAskRow>();
  /** 応答の後に回してよい仕事（握手のセッションを閉じる要求）。 */
  const afterwards = async (work: Promise<unknown>) => { if (deps.waitUntil) deps.waitUntil(work); else await work; };

  /** 依頼 1 件の応答。終わって成果がある依頼は、Work から成果の文を読んで添える（正本は Work）。 */
  async function detail(row: NoahAskRow): Promise<Record<string, unknown>> {
    const view = noahAskView(row);
    if (row.state !== 'succeeded') return view;
    const remote = (await jobs.get(row.owner_id, row.work_id))?.noahRemote;
    return remote?.result ? { ...view, delivery:noahDelivery(row.host,row.tool,remote.result), result: {...remote.result,delivery:noahDelivery(row.host,row.tool,remote.result)}, ...(remote.note ? { note: remote.note } : {}) } : view;
  }

  /** `POST /api/noah/ask`。受け付けて、202 と、応答の後に続ける仕事（run）を返す。spec-87 の 11.3。 */
  async function ask(owner: string, reviewer: boolean, input: {
    id: string; connectionId: string; tool: string; toolSha256: string; input: Record<string, unknown>; confirm: boolean; screen: 'narrow' | 'wide' | null;
  }): Promise<NoahAskReply & { run?: () => Promise<void> }> {
    const requestSha256 = await noahFormRequestSha256({ connectionId: input.connectionId, tool: input.tool, toolSha256: input.toolSha256, args: input.input });
    // 同じ操作 ID の再送は、最初に、今の状態で答える（接続や切り替えが、その後で変わっていても、同じ依頼の今を返す。もう 1 回は呼ばない）。
    const replayed = async (): Promise<NoahAskReply | null> => {
      const same = await prepare(`SELECT ${NOAH_ASK_COLUMNS} FROM noah_asks WHERE id=?`, input.id).first<NoahAskRow>();
      if (!same) return null;
      // 別の本人が使った ID も、同じ文で断る（その人の行を返さない）。
      return same.owner_id === owner && same.request_sha256 === requestSha256 ? reply(200, await detail(same)) : failed(409, NOAH_ASK_MESSAGES.changedRequest);
    };
    const again = await replayed();
    if (again) return again;
    if (!noahAllowed(flags, 'ask', reviewer)) return failed(503, NOAH_ASK_MESSAGES.closed);
    // 使ってよい接続か（つながっている・取り下げられていない・同意した時から接続先が変わっていない）。使えなければ 404・409（NoahAgentError）。
    const { connection, familyKey, digest, toolsSha256, target } = await connections.usable(owner, input.connectionId);

    await deps.authorizeAction?.(owner, familyKey, input.tool, input.toolSha256, input.confirm);

    // 頼む前の上限。越えていれば、Work も行も作らない。相手へも送らない。
    const at = now();
    const counts = await intakeStatement(db, NOAH_LISTING_SQL.gate, { owner, host: target.host, minute_ago: at - 60_000, day_ago: at - 86_400_000 })
      .first<{ open: number; last_minute: number; last_day: number; host_last_minute: number }>();
    const gate = noahAskGate({ open: counts?.open ?? 0, lastMinute: counts?.last_minute ?? 0, lastDay: counts?.last_day ?? 0, hostLastMinute: counts?.host_last_minute ?? 0 }, flags.askLimits);
    if (!gate.ok) return failed(gate.status, gate.message);
    if (!(await browserQuota.take(owner, 'asks'))) return failed(429, NOAH_BROWSER_QUOTA_MESSAGE);
    // この依頼の握手の分の、接続先の枠（接続・道具の一覧と同じ枠）。
    if (!(await hands.take(target.host))) return failed(429, NOAH_HOST_BUSY);

    // Work と依頼の行を、1 回の書き込みで一緒に入れる（片方だけが残らない）。終わっていない依頼が上限に居れば、どちらも入らない。
    const workId = crypto.randomUUID();
    const job = createNoahRemoteWork(workId, {
      connectionId: input.connectionId, familyKey, digest, agentName: connection.name, host: target.host,
      tool: input.tool, toolSha256: input.toolSha256, toolsSha256, args: input.input, inputSha256: requestSha256,
    }, at);
    const results = await db.batch([
      prepare(`INSERT INTO work_jobs (id,user_id,payload,revision,updated_at) SELECT ?,?,?,?,?
        WHERE (SELECT COUNT(*) FROM noah_asks WHERE owner_id=? AND finished_at IS NULL) < ? AND NOT EXISTS (SELECT 1 FROM noah_asks WHERE id=?)`,
        job.id, owner, JSON.stringify(job), job.revision, job.updatedAt, owner, flags.askLimits.open, input.id),
      prepare(`INSERT OR IGNORE INTO noah_asks (id,owner_id,connection_id,work_id,request_sha256,mode,host,tool,tool_sha256,screen,state,revision,created_at,updated_at)
        SELECT ?,?,?,?,?,'form',?,?,?,?,'queued',1,?,? WHERE EXISTS (SELECT 1 FROM work_jobs WHERE id=? AND user_id=?)`,
        input.id, owner, input.connectionId, workId, requestSha256, target.host, input.tool, input.toolSha256, input.screen, at, at, workId, owner),
    ]);
    if (results[1]?.meta.changes !== 1) {
      // 同じ操作 ID の要求が、同時に先に入った時は、その行で答える。そうでなければ、終わっていない依頼が多い。
      return (await replayed()) ?? failed(409, NOAH_ASK_MESSAGES.full);
    }
    return { ...reply(202, { id: input.id, workId, state: 'queued', mode: 'form', revision: 1 }), run: () => run(owner, input.id, input.input, input.confirm) };
  }

  /** 握手の表を「動いた」にして、系列へ写す（spec-88 の 9.2）。誰の実行かも、依頼の中身も、書かない。 */
  async function markRan(target: NoahUserHandshakeTarget, handshake: NoahHandshake) {
    const at = now(), summary = noahFormSummary(handshake.tools);
    // すでに「動いた」の物を、もう一度動かしても、時刻は進めない。巡回が握手した時刻と、巡回の予定は、書き換えない。
    const written = await prepare(`UPDATE noah_intake_checks SET l2_at = CASE WHEN level = 2 THEN l2_at ELSE ? END, level=2, result='ok', tools_sha256=?, tool_count=?, read_only=?,
      form_tools=?, one_tap_tools=?, l1_at=COALESCE(l1_at, ?), failures=0, first_failure_at=NULL WHERE candidate_id=? AND connect_sha256=?`,
      at, handshake.toolsSha256, handshake.tools.length, handshake.allReadOnly ? 1 : 0, summary.formTools, summary.oneTapTools, at, target.candidateId, target.connectSha256).run();
    if (written.meta.changes !== 1) return;
    const row = await prepare(`SELECT ${NOAH_CHECK_COLUMNS} FROM noah_intake_checks WHERE candidate_id=?`, target.candidateId).first<NoahCheckRow>();
    const family = row ? await prepare(`${NOAH_PROBE_FAMILY}(?)`, target.candidateId).first<NoahProbeFamily>() : null;
    if (!row || !family) return;
    const copies = noahFamilyWrites(db, family, target.candidateId, { state: noahCheckState(row), toolsChanged: false, hide: false, unhide: false, hostWaitUntil: null }, at);
    if (copies.length) await db.batch(copies);
  }

  /** 読み取りだけでない道具を、本人が確かめた記録（名前と、その時の定義の hash の組）を足す。同じ名前の古い組は、置き換える。 */
  async function confirm(owner: string, connectionId: string, pair: NoahConfirmedTool): Promise<boolean> {
    // 別の依頼が同時に足していた時は、読み直して 1 回だけやり直す（接続の版は進めない: 画面が持っている版で、切れるままにする）。
    for (let attempt = 0; attempt < 2; attempt++) {
      const row = await prepare("SELECT confirmed_tools_json FROM noah_connections WHERE id=? AND owner_id=? AND state='connected'", connectionId, owner).first<{ confirmed_tools_json: string }>();
      if (!row) return false;
      let list: NoahConfirmedTool[] = [];
      try { const value: unknown = JSON.parse(row.confirmed_tools_json); if (Array.isArray(value)) list = value as NoahConfirmedTool[]; } catch { /* 読めない記録は、空として扱う。 */ }
      const next = JSON.stringify([...list.filter((item) => item && item.name !== pair.name), pair]);
      const written = await prepare("UPDATE noah_connections SET confirmed_tools_json=? WHERE id=? AND owner_id=? AND state='connected' AND confirmed_tools_json=?", next, connectionId, owner, row.confirmed_tools_json).run();
      if (written.meta.changes === 1) return true;
    }
    return false;
  }

  /** 道具の呼び出しが失敗した時の、依頼の結果（spec-87 の 11.4 の表の「呼び出しの時」）。 */
  async function callFailure(target: NoahUserHandshakeTarget, error: unknown): Promise<{ state: 'failed' | 'unknown'; error: string }> {
    // 401・402・429 は、握手の時と同じ後始末（一覧から外す・相手が言った時刻まで待つ）。
    const code = await hands.settle(target, error).catch(() => 'unreachable' as const);
    const detail = error instanceof NoahMouthError ? error.detail : {};
    if (code === 'auth_required') return { state: 'failed', error: 'この Agent は、相手の許可が要るようになりました。まだ対応していません。' };
    if (code === 'payment_required') return { state: 'failed', error: 'この Agent は、呼ぶたびの支払いが要るようになりました。まだ対応していません。' };
    if (code === 'forbidden') return { state: 'failed', error: NOAH_ASK_MESSAGES.refusedCall };
    if (code === 'rate_limited') return { state: 'failed', error: '相手のサーバーが混んでいます。少し待ってから試してください。' };
    if (code === 'too_large') return { state: 'failed', error: NOAH_ASK_MESSAGES.tooLarge };
    if (code === 'blocked') return { state: 'failed', error: 'この接続先にはつなげません。' };
    if (code === 'incompatible' && detail.rpc && typeof detail.rpc === 'object') {
      // 相手が、決まった形のエラーで返した（入力を受け付けなかった）。相手の文は、文字として、先頭だけを添える。
      const said = (detail.rpc as { message?: unknown }).message;
      return { state: 'failed', error: `${NOAH_ASK_MESSAGES.rejectedInput}${typeof said === 'string' && said.trim() ? ` ${clip(said.trim(), NOAH_ASK_RUN_LIMITS.rpcErrorChars)}` : ''}` };
    }
    // 送った後に、応答が無い・読めない: 実行されたかどうかが、分からない。
    return { state: 'unknown', error: NOAH_ASK_MESSAGES.unknown };
  }

  /**
   * 実行（応答を返した後に続ける）。spec-87 の 11.4。何回呼ばれても、進めるのは 1 回だけ（`queued` の行を取れた時だけ）。
   * `input` は、本人が入力欄に入れた値。`confirm` は、読み取りだけでない道具を、本人が画面で確かめた印。
   */
  async function run(owner: string, id: string, input: Record<string, unknown>, confirmed: boolean): Promise<void> {
    const at = now();
    const row = await prepare(`UPDATE noah_asks SET state='running',lease_until=?,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND state='queued' AND stop_requested=0 RETURNING ${NOAH_ASK_COLUMNS}`,
      at + NOAH_ASK_RUN_LIMITS.leaseMs, at, id, owner).first<NoahAskRow>();
    if (!row || !row.tool || !row.tool_sha256) return;
    let sent = false;
    /** 終わりを書く。止める事が頼まれていて書けなかった時は、「止めた」で書き直す。その状態で書けた時だけ、true を返す。 */
    const finish = async (state: 'succeeded' | 'failed' | 'stopped' | 'unknown', outcome: NoahRemoteOutcome): Promise<boolean> => {
      const calls = sent ? 1 : 0;
      const done = await finishNoahAsk(deps, row, state, outcome, { toolCalls: calls });
      if (done !== 'stop_requested') return done === 'written';
      const message = sent ? NOAH_ASK_STOP_MESSAGES.stoppedAfterCall : NOAH_ASK_STOP_MESSAGES.stopped;
      await finishNoahAsk(deps, row, 'stopped', { state: 'cancelled', error: message, used: sent ? [row.tool!] : [] }, { toolCalls: calls });
      return false;
    };
    /** 終わりを書くだけ（書けたかどうかを、使わない所）。 */
    const end = async (state: 'failed' | 'stopped' | 'unknown', outcome: NoahRemoteOutcome): Promise<void> => { await finish(state, outcome); };
    const fail = (error: string) => end('failed', { state: 'failed', error });
    let close: (() => Promise<void>) | null = null;
    try {
      const job = await jobs.get(owner, row.work_id);
      if (job) { const started = startNoahRemoteWork(job, at); if (started !== job) await jobs.update(owner, started, job.revision); }

      // 握手（8 秒。枠は、受け付けた時に取ってある）。
      const { target } = await connections.usable(owner, row.connection_id);
      const shaken = await hands.handshake(target, { slotTaken: true, owner });
      if (!shaken.ok) return await fail(shaken.message);
      close = shaken.close;
      // 道具を名前で探す。本人が入力欄を開いた時と、定義が同じ時だけ呼ぶ。
      const tool: NoahToolDef | undefined = shaken.handshake.tools.find((item) => item.name === row.tool);
      const toolSha256 = tool ? await noahToolSha256(tool) : null;
      if (!tool || toolSha256 !== row.tool_sha256) return await fail(NOAH_ASK_MESSAGES.toolChanged);
      // 握手の間に、取り下げられた物・接続先が変わった物・切られた接続を、呼ばない。
      const again = await connections.usable(owner, row.connection_id);
      const form = noahToolForm(tool);
      if (!form.usable) return await fail(NOAH_ASK_MESSAGES.toolUnusable);
      const args = noahFormArgs(form, input);
      if (!args.ok) return await fail(args.message);
      if (checkNoahToolArgs(tool.inputSchema, args.args) !== null) return await fail(NOAH_ASK_MESSAGES.argsMismatch);
      // 読み取りだけと宣言されていない道具は、最初の 1 回、本人が画面で確かめてから。確かめた後に定義が変わっていたら、確かめ直す。
      if (!tool.readOnly && !again.confirmed.some((item) => item.name === tool.name && item.sha256 === toolSha256)) {
        if (!confirmed) return await fail(NOAH_ASK_MESSAGES.needsConfirm);
        if (!(await confirm(owner, row.connection_id, { name: tool.name, sha256: toolSha256 }))) return await fail(NOAH_ASK_MESSAGES.interrupted);
      }
      await deps.authorizeAction?.(owner, again.familyKey, tool.name, toolSha256!, confirmed);
      // 呼ぶ直前に、「相手へ送る」の印（tool_calls=1）を付ける。止める事が頼まれていれば、付かない（呼ばない）。
      // 印を付けてから呼ぶので、実行の場が途中で落ちても、後始末（lib/noah-sweep.ts）が、「送っていない」と「送ったかもしれない」を分けられる。
      // 版（revision）は進めない: 画面が持っている版で、「止める」がそのまま通る。
      const marked = await prepare('UPDATE noah_asks SET tool_calls=1 WHERE id=? AND owner_id=? AND finished_at IS NULL AND stop_requested=0', id, owner).run();
      if (marked.meta.changes !== 1) {
        const current = await readOne(owner, id);
        if (!current || current.finished_at !== null) return;
        return await end('stopped', { state: 'cancelled', error: NOAH_ASK_STOP_MESSAGES.stopped });
      }

      // 道具を 1 回呼ぶ。失敗しても、呼び直さない。
      sent = true;
      let called: Awaited<ReturnType<typeof noahMcpCall>>;
      try {
        called = await noahMcpCall(shaken.handshake.session, tool.name, args.args, shaken.ctx, NOAH_ASK_RUN_LIMITS.callMs);
      } catch (error) {
        const outcome = await callFailure(again.target, error);
        return await end(outcome.state, { state: outcome.state, error: outcome.error, used: [tool.name] });
      }
      const text = noahResultText(called);
      if (!called.ok) {
        // 道具が「できなかった」と返した。理由は、相手の文の先頭（文字として出す）。
        return await end('failed', { state: 'failed', error: clip(text.text.trim() || NOAH_ASK_MESSAGES.toolFailed, NOAH_ASK_RUN_LIMITS.errorChars), used: [tool.name] });
      }
      // 成果を書けた時だけ（止められた依頼・後始末が先に終わらせた依頼では、書けない）: 使った時刻を書き、その系列を「動いた」にする。
      if (await finish('succeeded', { state: 'returned', result: text, note: `${again.target.host} の ${tool.name} が返した内容です。費用 0。`, used: [tool.name] })) {
        const used = now();
        await prepare("UPDATE noah_connections SET last_used_at=? WHERE id=? AND owner_id=? AND state='connected'", used, row.connection_id, owner).run();
        await markRan(again.target, shaken.handshake);
      }
    } catch (error) {
      // 使えない接続（切られた・取り下げられた・接続先が変わった）は、その文で終える。それ以外の途中の失敗は、送った後なら「結果不明」。
      const message = error instanceof NoahAgentError ? error.message : null;
      await (sent
        ? end('unknown', { state: 'unknown', error: NOAH_ASK_MESSAGES.unknown, used: row.tool ? [row.tool] : [] })
        : fail(message ?? NOAH_ASK_MESSAGES.interrupted)).catch(() => undefined);
    } finally {
      // 握手のセッションを閉じる（成果と状態を書き終えた後。届かなくても、依頼の結果は変わらない）。
      if (close) await afterwards(close().catch(() => undefined));
    }
  }

  /** `GET /api/noah/ask/[id]`。成果の文は、この 1 件の方にだけ付ける。 */
  async function get(owner: string, id: string): Promise<NoahAskReply> {
    const row = await readOne(owner, id);
    return row ? reply(200, await detail(row)) : failed(404, NOAH_ASK_MESSAGES.missing);
  }

  /**
   * `GET /api/noah/ask[?connection=|?agent=]`。本人の新しい 50 件（成果の文は持たない）。
   * `agent`（系列の ID）を渡すと、その Agent への依頼を、**切った接続の分も含めて**返す（詳細の画面の「仕事」。切った後も、成果を読めるように）。
   */
  async function list(owner: string, connectionId: string | null, agentId: string | null = null): Promise<NoahAskReply> {
    // 行ごとに、その依頼の Agent（接続の系列）を添える（「実行中」「成果データ」の画面は、Agent をまたいで並べるので、行から詳細へ戻れるように）。
    const columns = `${NOAH_ASK_COLUMNS},(SELECT family_key FROM noah_connections WHERE noah_connections.id=noah_asks.connection_id) AS family_key`;
    const rows = (await (connectionId
      ? prepare(`SELECT ${columns} FROM noah_asks WHERE owner_id=? AND connection_id=? ORDER BY updated_at DESC,id DESC LIMIT ?`, owner, connectionId, NOAH_ASK_RUN_LIMITS.listed)
      : agentId
        ? prepare(`SELECT ${columns} FROM noah_asks WHERE owner_id=? AND connection_id IN (SELECT id FROM noah_connections WHERE owner_id=? AND family_key=?) ORDER BY updated_at DESC,id DESC LIMIT ?`, owner, owner, agentId, NOAH_ASK_RUN_LIMITS.listed)
        : prepare(`SELECT ${columns} FROM noah_asks WHERE owner_id=? ORDER BY updated_at DESC,id DESC LIMIT ?`, owner, NOAH_ASK_RUN_LIMITS.listed)).all<NoahAskRow>()).results;
    return reply(200, { asks: await Promise.all(rows.map(async row=>{
      const view=noahAskView(row);
      if(row.state!=='succeeded'||!noahExpectsImage(row.host,row.tool))return view;
      const result=(await jobs.get(row.owner_id,row.work_id))?.noahRemote?.result;
      return {...view,delivery:noahDelivery(row.host,row.tool,result)};
    })) });
  }

  /**
   * `stop`: まだ始まっていない依頼は、その場で止める。進んでいる依頼は、止める事を頼む
   * （相手で実行が始まっていれば、止められない。届いた成果は、採らない）。実行の場が無くなっている依頼は、その場で止める。
   * 切り替えが閉じていても、止められる。
   */
  async function stop(owner: string, id: string, revision: number): Promise<NoahAskReply> {
    const row = await readOne(owner, id);
    if (!row) return failed(404, NOAH_ASK_MESSAGES.missing);
    if (row.revision !== revision) return failed(409, NOAH_ASK_MESSAGES.stale, { ask: noahAskView(row) });
    if (row.finished_at !== null) return failed(409, NOAH_ASK_MESSAGES.finished, { ask: noahAskView(row) });
    if (row.state === 'queued') await finishNoahAsk(deps, row, 'stopped', { state: 'cancelled', error: NOAH_ASK_STOP_MESSAGES.stopped }, { only: 'queued' });
    // 進んでいる依頼の、実行の場が、もう無い時（lease を過ぎた）: 止める事を頼んでも、聞く相手が居ない。その場で止める（巡回の後始末を、待たない）。
    else if (noahAskRunGone(row, now())) await finishGoneNoahAsk(deps, row, true);
    const at = now();
    // 実行の場が、同時に取っていた時も含めて: 終わっていなければ、止める事を頼む。
    await prepare('UPDATE noah_asks SET stop_requested=1,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND finished_at IS NULL AND stop_requested=0', at, id, owner).run();
    const after = await readOne(owner, id);
    return after ? reply(200, await detail(after)) : failed(404, NOAH_ASK_MESSAGES.missing);
  }

  return { ask, run, get, list, stop };
}

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const TOOL_NAME = /^[A-Za-z0-9_.:/-]{1,128}$/;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function failure(error: unknown) {
  if (error instanceof NoahAgentError) return json({ error: error.status === 413 ? '送信内容が大きすぎます。' : error.message }, error.status);
  if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: '保存先を開けませんでした。もう一度お試しください。' }, 401);
  return json({ error: '依頼を確かめられません。少し待ってから再試行してください。' }, 503);
}

/**
 * 依頼の入口。collection は `/api/noah/ask`、item は `/api/noah/ask/[id]`。
 * どれも、サインイン済みの本人だけ。書き込みは、同じ Noah の画面から（Origin）、始めた時と同じ account で（ownerScope）、JSON で。
 */
export function createNoahAskApi(deps: NoahAskApiDependencies) {
  const service = createNoahAskService(deps), provider = createNoahProviderRuntime(deps);
  type Context = { owner: string; reviewer: boolean; url: URL };
  const respond = async (request: Request, methods: string[], handle: (context: Context) => Promise<NoahAskReply | Response>) => {
    try {
      if (!methods.includes(request.method)) return json({ error: '対応しない操作です。' }, 405);
      const owner = await deps.authenticate(request), url = new URL(request.url), ownerScope = await ownerScopeFor(owner);
      if (request.method !== 'GET') {
        if (request.headers.get('origin') !== url.origin) return json({ error: '同じNoahから操作してください。' }, 403);
        if (request.headers.get(OWNER_SCOPE_HEADER) !== ownerScope) return json({ error: 'アカウントが変わりました。再読込してください。' }, 409);
        if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSONで操作してください。' }, 415);
      }
      const result = await handle({ owner, reviewer: deps.reviewers.includes(owner), url });
      return result instanceof Response ? result : json({ ...result.body, ownerScope }, result.status);
    } catch (error) {
      return failure(error);
    }
  };
  const body = async (request: Request) => {
    const bytes = await boundedNoahBody(request, NOAH_ASK_RUN_LIMITS.bodyBytes);
    let value: unknown;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw new NoahAgentError('入力形式を確認してください。'); }
    if (!record(value)) throw new NoahAgentError('入力形式を確認してください。');
    return value;
  };
  const missing = () => json({ error: NOAH_ASK_MESSAGES.missing }, 404);

  return {
    collection: (request: Request) => respond(request, ['GET', 'POST'], async ({ owner, reviewer, url }) => {
      if (request.method === 'GET') {
        const connection = url.searchParams.get('connection'), agent = url.searchParams.get('agent');
        if (connection !== null && !UUID.test(connection)) return json({ asks: [] });
        // 系列の ID は、一覧・計画の入口と同じ長さの範囲だけを受ける（それ以外は、何も無い物として答える）。
        if (connection === null && agent !== null && (agent.length < 3 || agent.length > 400)) return json({ asks: [] });
        const listed=await service.list(owner, connection, connection === null ? agent : null);
        if(connection===null && deps.providerDirectory){const added=await provider.list(owner,agent);if(added.length)listed.body.asks=[...(listed.body.asks as {updatedAt:number}[]),...added].sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,50);}
        const managed = deps.cloudApi ? await listNoahManagedWork(deps.db, owner, connection, agent) : [];
        if (managed.length) listed.body.asks = [...(listed.body.asks as {updatedAt:number}[]), ...managed].sort((a,b) => b.updatedAt-a.updatedAt).slice(0,50);
        return listed;
      }
      const value = await body(request);
      // 1 文で頼む（prompt）は、まだ受けない。
      if ('prompt' in value) return json({ error: NOAH_ASK_MESSAGES.promptOnly }, 422);
      const form = value.form;
      if (Object.keys(value).some((key) => !['id', 'connectionId', 'form', 'screen'].includes(key)) || typeof value.id !== 'string' || !UUID.test(value.id)
        || typeof value.connectionId !== 'string' || !UUID.test(value.connectionId) || !record(form)
        || Object.keys(form).some((key) => !['tool', 'toolSha256', 'input', 'confirm'].includes(key))
        || typeof form.tool !== 'string' || !TOOL_NAME.test(form.tool) || typeof form.toolSha256 !== 'string' || !HEX64.test(form.toolSha256) || !record(form.input)
        || (form.confirm !== undefined && form.confirm !== true)) throw new NoahAgentError('操作ID・接続・道具・入力を確認してください。');
      const accepted = await service.ask(owner, reviewer, {
        id: value.id, connectionId: value.connectionId, tool: form.tool, toolSha256: form.toolSha256, input: form.input, confirm: form.confirm === true,
        // 頼んだ画面の幅の区分。「スマホで使われるか」を数えるためだけに持つ。他の値は入れない。
        screen: value.screen === 'narrow' || value.screen === 'wide' ? value.screen : null,
      });
      // 応答を返した後に、同じ実行の中で続ける。預ける先が無い時（試験）は、その場で終える。
      if (accepted.run) { const work = accepted.run(); if (deps.waitUntil) deps.waitUntil(work); else await work; }
      return reply(accepted.status, accepted.body);
    }),
    item: (request: Request, id: string) => respond(request, ['GET', 'POST'], async ({ owner }) => {
      if (!UUID.test(id)) return missing();
      const managed = deps.cloudApi ? await workStore(deps.db).get(owner, id) : null;
      if (isNoahManagedWork(managed)) {
        if (request.method === 'GET') return reply(200, noahManagedWorkView(managed, true) as unknown as Record<string,unknown>);
        const value = await body(request);
        if (Object.keys(value).length !== 2 || value.action !== 'stop' || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1) throw new NoahAgentError('操作と版を確認してください。');
        if (value.revision !== managed.revision) throw new NoahAgentError('仕事の状態が更新されました。読み直してください。', 409);
        if (!['queued', 'running'].includes(managed.noahRemote!.state)) return reply(200, noahManagedWorkView(managed, true) as unknown as Record<string,unknown>);
        if (!deps.cloudApi) throw new NoahAgentError('クラウドに接続できません。時間をおいて再試行してください。', 503);
        const stopped = await deps.cloudApi(new Request(new URL('/api/noah/cloud-agents', request.url), {
          method: 'POST', headers: request.headers,
          body: JSON.stringify({ action: 'stop', projectId: managed.noahRemote!.cloud!.projectId, jobId: id }),
        }));
        if (!stopped.ok) return stopped;
        await stopped.body?.cancel();
        const saved = await workStore(deps.db).get(owner, id);
        return isNoahManagedWork(saved) ? reply(200, noahManagedWorkView(saved, true) as unknown as Record<string,unknown>) : missing();
      }
      const providerJob=deps.providerDirectory?await provider.get(owner,id):null;
      if (request.method === 'GET') {
        if(providerJob){void provider.wake(owner,id);return reply(200,providerWorkView(providerJob,true) as unknown as Record<string,unknown>);}
        return service.get(owner, id);
      }
      const value = await body(request);
      if (Object.keys(value).length !== 2 || value.action !== 'stop' || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1) throw new NoahAgentError('操作と版を確認してください。');
      if(providerJob){const stopped=await provider.stop(owner,id,Number(value.revision));return stopped?reply(200,providerWorkView(stopped,true) as unknown as Record<string,unknown>):reply(404,{error:'依頼が見つかりません。'});}
      return service.stop(owner, id, Number(value.revision));
    }),
  };
}
