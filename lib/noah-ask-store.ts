/**
 * 依頼（noah_asks）の行と、その終わりの書き方。頼む側（lib/noah-ask.ts）と、切る側（lib/noah-connect.ts）が共に使う。
 *
 * - 依頼と成果の本文は Work（work_jobs）にだけ置く。noah_asks は、進み具合と、照合に使う hash。
 * - 終わりは、Work と依頼の行を、1 回の書き込み（batch）で一緒に書く（片方だけが終わった形を、残さない）。
 * - 止めた後に遅れて届いた成功は、採らない（`finished_at IS NULL AND (stop_requested=0 OR 新しい状態='stopped')`）。
 * - 終わった依頼は、もう変えない。
 * 仕様: docs/noah/spec-87-tool-agent.md の 4.2・5.3・11.3・11.4。
 */
import type { IntakeDependencies } from './noah-intake-sync.ts';
import { finishNoahRemoteWork, type NoahRemoteOutcome } from './noah-remote-work.ts';
import { workStore } from './work-store.ts';

export type NoahAskState = 'queued' | 'running' | 'your_turn' | 'succeeded' | 'failed' | 'stopped' | 'limit' | 'unknown';
export type NoahAskRow = {
  id: string; owner_id: string; connection_id: string; work_id: string; request_sha256: string; mode: 'agent' | 'form';
  host: string | null; tool: string | null; tool_sha256: string | null; screen: 'narrow' | 'wide' | null;
  state: NoahAskState; stop_requested: 0 | 1; lease_until: number; error: string | null; revision: number;
  created_at: number; updated_at: number; finished_at: number | null;
};
export const NOAH_ASK_COLUMNS = 'id,owner_id,connection_id,work_id,request_sha256,mode,host,tool,tool_sha256,screen,state,stop_requested,lease_until,error,revision,created_at,updated_at,finished_at';

/** 画面に出す文（止めた時）。 */
export const NOAH_ASK_STOP_MESSAGES = {
  /** 相手へ送る前に止めた。 */
  stopped: '止めました。',
  /** 相手へ送った後に止めた（届いた成果は、採らない）。 */
  stoppedAfterCall: '止めました。相手のサーバーで実行されたかは分かりません。',
  cut: '接続を切ったので、止めました。',
};

/** 依頼 1 件の、応答の形（成果の文は、1 件を読む時にだけ足す）。本人の ID と、照合の hash は出さない。 */
export function noahAskView(row: NoahAskRow) {
  return {
    id: row.id, connectionId: row.connection_id, workId: row.work_id, state: row.state, mode: row.mode, revision: row.revision,
    tool: row.tool, host: row.host,
    /** 止める事を頼んである（進んでいる依頼は、次の区切りで止まる。止まった確認が返るまで「止めました」と出さない）。 */
    stopRequested: row.stop_requested === 1,
    ...(row.error ? { error: row.error } : {}),
    createdAt: row.created_at, updatedAt: row.updated_at,
    ...(row.finished_at !== null ? { finishedAt: row.finished_at } : {}),
  };
}
export type NoahAskView = ReturnType<typeof noahAskView>;

type Dependencies = Pick<IntakeDependencies, 'db' | 'now'>;
const clip = (value: string, chars: number) => Array.from(value).slice(0, chars).join('');

/**
 * 依頼の終わりを書く。Work（成果か理由）と、依頼の行を、1 回の batch で一緒に書く。
 * - `written`: 書いた。
 * - `stop_requested`: 止める事が頼まれていたので、書かなかった（呼ぶ側が、`stopped` で書き直す）。
 * - `already`: もう終わっていた・条件に合わなかった（`only` を付けた時に、その状態でなかった）。何も変えていない。
 */
export async function finishNoahAsk(
  deps: Dependencies, row: Pick<NoahAskRow, 'id' | 'owner_id' | 'work_id'>, state: 'succeeded' | 'failed' | 'stopped' | 'unknown', outcome: NoahRemoteOutcome,
  options: { only?: 'queued'; toolCalls?: number } = {},
): Promise<'written' | 'stop_requested' | 'already'> {
  const { db } = deps, now = deps.now ?? Date.now, jobs = workStore(db);
  const guard = `finished_at IS NULL AND (stop_requested=0 OR ?='stopped')${options.only ? " AND state='queued'" : ''}`;
  // 依頼の行の理由。成果が出た時と、相手へ送る前に止めた時（画面は「止めました。」とだけ出す）は、空。
  const error = outcome.state === 'returned' || (state === 'stopped' && outcome.error === NOAH_ASK_STOP_MESSAGES.stopped) ? null : clip(outcome.error, 300);
  // Work を、別の書き込みが先に進めていた時は、読み直して 1 回だけやり直す。
  for (let attempt = 0; attempt < 2; attempt++) {
    const at = now(), job = await jobs.get(row.owner_id, row.work_id);
    const next = job ? finishNoahRemoteWork(job, outcome, at) : null;
    const changed = job && next && next !== job;
    const statements = [
      ...(changed ? [db.prepare(`UPDATE work_jobs SET payload=?,revision=?,updated_at=? WHERE id=? AND user_id=? AND revision=? AND EXISTS (SELECT 1 FROM noah_asks WHERE id=? AND owner_id=? AND ${guard})`)
        .bind(JSON.stringify(next), next.revision, next.updatedAt, job.id, row.owner_id, job.revision, row.id, row.owner_id, state)] : []),
      // Work を書く時は、その書き込みが通った事（Work の版が、新しい版になっている事）を、同じ batch の中で確かめる。
      db.prepare(`UPDATE noah_asks SET state=?,error=?,tool_calls=?,finished_at=?,lease_until=0,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND ${guard}${changed ? ' AND EXISTS (SELECT 1 FROM work_jobs WHERE id=? AND user_id=? AND revision=?)' : ''}`)
        .bind(state, error, options.toolCalls ?? 0, at, at, row.id, row.owner_id, state,
          ...(changed ? [job.id, row.owner_id, next.revision] : [])),
    ];
    const results = await db.batch(statements);
    if (results.at(-1)?.meta.changes === 1) return 'written';
    const current = await db.prepare(`SELECT ${NOAH_ASK_COLUMNS} FROM noah_asks WHERE id=? AND owner_id=?`).bind(row.id, row.owner_id).first<NoahAskRow>();
    if (!current || current.finished_at !== null || (options.only && current.state !== 'queued')) return 'already';
    if (current.stop_requested === 1 && state !== 'stopped') return 'stop_requested';
  }
  return 'already';
}

/**
 * 接続を切った時: その接続の、終わっていない依頼を止める（`stop` と同じ扱い）。
 * まだ始まっていない依頼は、その場で止める（Work は `cancelled`）。進んでいる依頼は、止める事を頼む（相手で実行が始まっていれば止められない。届いた成果は、採らない）。
 */
export async function stopNoahAsksOfConnection(deps: Dependencies, owner: string, connectionId: string): Promise<void> {
  const { db } = deps, now = deps.now ?? Date.now;
  const open = (await db.prepare(`SELECT ${NOAH_ASK_COLUMNS} FROM noah_asks WHERE connection_id=? AND owner_id=? AND finished_at IS NULL`).bind(connectionId, owner).all<NoahAskRow>()).results;
  for (const row of open) {
    if (row.state === 'queued' && (await finishNoahAsk(deps, row, 'stopped', { state: 'cancelled', error: NOAH_ASK_STOP_MESSAGES.cut }, { only: 'queued' })) === 'written') continue;
    const at = now();
    await db.prepare('UPDATE noah_asks SET stop_requested=1,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND finished_at IS NULL AND stop_requested=0').bind(at, row.id, owner).run();
  }
}
