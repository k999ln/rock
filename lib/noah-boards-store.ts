/**
 * ピンタレスト風の一覧の保存（task 115）: ボード・保存・フォロー・「表示しない」・数えた実績と、一覧の並べ方の読み出し。
 * 並べ方の式は lib/noah-pins.ts（学習なし・乱数なし）。カードの中身は、一覧と同じ関数（lib/noah-intake-store.ts の noahReadyItems）で作る。
 * 本人の保存・フォロー・「表示しない」は、その本人の行。全員の合計（noah_pin_stats）には、本人の ID を入れない。
 * 仕様: docs/noah/spec-115-pin-grid.md の 4〜6 章。
 */
import type { IntakeDb } from './noah-intake-db.ts';
import { NoahAgentError } from './noah-agent-upload.ts';
import { noahReadyItems, type NoahReadyListItem } from './noah-intake-store.ts';
import {
  NOAH_BOARD_LIMITS, NOAH_PIN_RANK, noahComposePins, noahPinCursorDecode, noahPinCursorEncode, noahPinHot, noahPinShape, noahPinTopic, noahPinVotes, noahPixieScores,
  type NoahPinCandidate, type NoahPinCursor, type NoahPinSources, type NoahPinTopic, type NoahPixieEdge,
} from './noah-pins.ts';

export type BoardsDependencies = { db: IntakeDb; now?: () => number; uuid?: () => string; decoratePins?: (pins: NoahPin[]) => Promise<NoahPin[]> };
export type NoahBoard = { id: string; name: string; visibility: 'private' | 'public'; pins: number; followers: number; revision: number; mine: boolean; following: boolean; covers: { id: string; name: string; topic: NoahPinTopic }[] };
export type NoahPin = NoahReadyListItem & { topic: NoahPinTopic; shape: 0 | 1 | 2; savedIn: string[] };

type BoardRow = { id: string; owner_id: string; name: string; visibility: 'private' | 'public'; pins: number; followers: number; revision: number; created_at: number; updated_at: number };
const BOARD_COLUMNS = 'id,owner_id,name,visibility,pins,followers,revision,created_at,updated_at';
const LISTED = 'f.listed = 1 AND f.withdrawn_at IS NULL AND f.hidden_at IS NULL';
const marks = (n: number) => Array.from({ length: n }, () => '?').join(',');
const chunk = <T>(values: readonly T[], size = 90) => Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
const ninetyDays = 90 * 86_400_000;

export function createNoahBoardsStore(deps: BoardsDependencies) {
  const { db } = deps, now = deps.now ?? Date.now, uuid = deps.uuid ?? (() => crypto.randomUUID());
  const prepare = (sql: string, ...args: (string | number | null)[]) => db.prepare(sql).bind(...args);

  // --- 数えた実績 -----------------------------------------------------------

  /** 1 つの Agent の実績を数え直し、票と hot を書く（保存・外す・表示しない、の後）。成果が返った人の数は、1 日 1 回の数え直しの値のまま。 */
  async function recount(familyId: string) {
    const [saved, hidden, current, anchor] = await db.batch([
      prepare('SELECT COUNT(DISTINCT owner_id) AS n FROM noah_board_pins WHERE family_id = ?', familyId),
      prepare('SELECT COUNT(*) AS n FROM noah_pin_hidden WHERE family_id = ?', familyId),
      prepare('SELECT succeeded FROM noah_pin_stats WHERE family_id = ?', familyId),
      prepare('SELECT COALESCE(k.l1_at, f.updated_at) AS at FROM noah_intake_families f LEFT JOIN noah_intake_checks k ON k.candidate_id = f.representative_id WHERE f.id = ?', familyId),
    ]);
    const savers = Number((saved.results[0] as { n?: number } | undefined)?.n ?? 0), hides = Number((hidden.results[0] as { n?: number } | undefined)?.n ?? 0);
    const succeeded = Number((current.results[0] as { succeeded?: number } | undefined)?.succeeded ?? 0), at = Number((anchor.results[0] as { at?: number } | undefined)?.at ?? now());
    const votes = noahPinVotes({ savers, succeeded, hides });
    await prepare(`INSERT INTO noah_pin_stats(family_id, savers, succeeded, hides, votes, hot, anchor_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(family_id) DO UPDATE SET savers = excluded.savers, hides = excluded.hides, votes = excluded.votes, hot = excluded.hot, updated_at = excluded.updated_at
      WHERE noah_pin_stats.savers IS NOT excluded.savers OR noah_pin_stats.hides IS NOT excluded.hides OR noah_pin_stats.votes IS NOT excluded.votes`,
    familyId, savers, succeeded, hides, votes, noahPinHot(votes, at), at, now()).run();
  }

  /**
   * 成果が返った人の数を、UTC の 1 日に 1 回だけ数え直す（直近 90 日。依頼の表から、系列ごとに頼んだ人の数）。
   * その日の 1 回目だけが行う（印の行を、日付が変わった時だけ書き換えられた要求が行う）。一覧を読む要求の後（waitUntil）で呼ぶ。
   */
  async function rollupIfDue() {
    const day = new Date(now()).toISOString().slice(0, 10);
    const claimed = await prepare(`INSERT INTO noah_pin_rollups(id, day, started_at) VALUES('succeeded', ?, ?)
      ON CONFLICT(id) DO UPDATE SET day = excluded.day, started_at = excluded.started_at WHERE noah_pin_rollups.day <> excluded.day RETURNING day`, day, now()).first<{ day: string }>();
    if (!claimed) return { counted: 0 };
    const rows = (await prepare(`SELECT c.family_key AS family_id, COUNT(DISTINCT a.owner_id) AS people FROM noah_asks a JOIN noah_connections c ON c.id = a.connection_id
      WHERE a.state = 'succeeded' AND a.finished_at >= ? GROUP BY c.family_key`, now() - ninetyDays).all<{ family_id: string; people: number }>()).results;
    const stale = (await prepare('SELECT family_id FROM noah_pin_stats WHERE succeeded > 0').all<{ family_id: string }>()).results.map((row) => row.family_id);
    const people = new Map(rows.map((row) => [row.family_id, Number(row.people)]));
    const ids = [...new Set([...people.keys(), ...stale])];
    const facts = new Map<string, { savers: number; hides: number; at: number }>();
    for (const part of chunk(ids)) {
      const found = (await prepare(`SELECT f.id, COALESCE(k.l1_at, f.updated_at) AS at, COALESCE(s.savers, 0) AS savers, COALESCE(s.hides, 0) AS hides FROM noah_intake_families f
        LEFT JOIN noah_intake_checks k ON k.candidate_id = f.representative_id LEFT JOIN noah_pin_stats s ON s.family_id = f.id WHERE f.id IN (${marks(part.length)})`, ...part).all<{ id: string; at: number; savers: number; hides: number }>()).results;
      for (const row of found) facts.set(row.id, { savers: Number(row.savers), hides: Number(row.hides), at: Number(row.at) });
    }
    const statements = [...facts].map(([id, fact]) => {
      const succeeded = people.get(id) ?? 0, votes = noahPinVotes({ savers: fact.savers, succeeded, hides: fact.hides });
      return prepare(`INSERT INTO noah_pin_stats(family_id, savers, succeeded, hides, votes, hot, anchor_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(family_id) DO UPDATE SET succeeded = excluded.succeeded, votes = excluded.votes, hot = excluded.hot, updated_at = excluded.updated_at
        WHERE noah_pin_stats.succeeded IS NOT excluded.succeeded`, id, fact.savers, succeeded, fact.hides, votes, noahPinHot(votes, fact.at), fact.at, now());
    });
    for (const part of chunk(statements, 40)) await db.batch(part);
    return { counted: statements.length };
  }

  // --- カード（ピン） ---------------------------------------------------------

  /** 系列の ID の並びから、ピンを作る（並びはそのまま。載せていない物は落ちる）。savedIn は、その本人のボードのうち、その Agent を保存している物。 */
  async function pins(ids: readonly string[], owner: string | null): Promise<NoahPin[]> {
    const items = await noahReadyItems(db, ids, owner !== null);
    const saved = new Map<string, string[]>();
    if (owner && items.length) {
      for (const part of chunk(items.map((item) => item.id), 80)) {
        for (const row of (await prepare(`SELECT family_id, board_id FROM noah_board_pins WHERE owner_id = ? AND family_id IN (${marks(part.length)})`, owner, ...part).all<{ family_id: string; board_id: string }>()).results) {
          saved.set(row.family_id, [...(saved.get(row.family_id) ?? []), row.board_id]);
        }
      }
    }
    const result=items.map((item) => ({ ...item, topic: noahPinTopic(item.name, item.summary), shape: noahPinShape(item.id), savedIn: saved.get(item.id) ?? [] }));
    return deps.decoratePins ? deps.decoratePins(result) : result;
  }
  const candidate = (pin: NoahPin): NoahPinCandidate => ({ id: pin.id, provider: pin.provider, topic: pin.topic });

  /**
   * 一覧の 1 頁。出所ごとに読み、lib/noah-pins.ts の noahComposePins で混ぜる。本人の「表示しない」は外す。
   * 本人へのおすすめ（フォローしたボードに新しく入った物と、Pixie）は、最初の頁だけ。続きの頁は、印（cursor）の位置から読む。
   */
  async function feed(owner: string | null, cursorText: string | null) {
    const cursor: NoahPinCursor | null = cursorText ? noahPinCursorDecode(cursorText) : null;
    if (cursorText && !cursor) throw new NoahAgentError('ページの指定を確認してください。');
    const first = !cursor, size = NOAH_PIN_RANK.pageSize, want = size + 10;
    const state: NoahPinCursor = cursor ?? { popular: null, ran: null, fresh: null, done: [], shown: [] };
    const hidden = new Set(owner ? (await prepare('SELECT family_id FROM noah_pin_hidden WHERE owner_id = ? LIMIT 2000', owner).all<{ family_id: string }>()).results.map((row) => row.family_id) : []);
    const read = async <T extends { id: string }>(key: 'popular' | 'ran' | 'fresh', sql: string, args: (string | number)[]) => (state.done.includes(key) ? [] : (await prepare(sql, ...args).all<T>()).results);
    const [popularRows, ranRows, freshRows] = await Promise.all([
      read<{ id: string; hot: number }>('popular', `SELECT s.family_id AS id, s.hot FROM noah_pin_stats s JOIN noah_intake_families f ON f.id = s.family_id
        WHERE s.votes > 0 AND ${LISTED} AND (s.hot < ? OR (s.hot = ? AND s.family_id > ?)) ORDER BY s.hot DESC, s.family_id LIMIT ?`,
      [state.popular?.[0] ?? Number.MAX_VALUE, state.popular?.[0] ?? Number.MAX_VALUE, state.popular?.[1] ?? '', want]),
      read<{ id: string; l2_at: number }>('ran', `SELECT f.id, f.l2_at FROM noah_intake_families f LEFT JOIN noah_pin_stats s ON s.family_id = f.id
        WHERE f.level = 2 AND ${LISTED} AND COALESCE(s.votes, 0) <= 0 AND (f.l2_at < ? OR (f.l2_at = ? AND f.id > ?)) ORDER BY f.l2_at DESC, f.id LIMIT ?`,
      [state.ran?.[0] ?? Number.MAX_SAFE_INTEGER, state.ran?.[0] ?? Number.MAX_SAFE_INTEGER, state.ran?.[1] ?? '', want]),
      // まだ実績の無い物は、新しく握手が通った順。押すだけで試せる物は 3 日分新しく扱う（task 121「新しく使いやすい物が上」。NOAH_PIN_RANK.freshOneTapMs）。
      read<{ id: string; fresh: number }>('fresh', `SELECT id, fresh FROM (SELECT f.id, COALESCE(k.l1_at, f.updated_at) + f.one_tap * ${NOAH_PIN_RANK.freshOneTapMs} AS fresh FROM noah_intake_families f
        LEFT JOIN noah_intake_checks k ON k.candidate_id = f.representative_id LEFT JOIN noah_pin_stats s ON s.family_id = f.id
        WHERE f.level = 1 AND ${LISTED} AND COALESCE(s.votes, 0) <= 0) WHERE fresh < ? OR (fresh = ? AND id > ?) ORDER BY fresh DESC, id LIMIT ?`,
      [state.fresh?.[0] ?? Number.MAX_SAFE_INTEGER, state.fresh?.[0] ?? Number.MAX_SAFE_INTEGER, state.fresh?.[1] ?? '', want]),
    ]);
    const personalIds = first && owner ? await personal(owner) : [];
    const all = await pins([...new Set([...personalIds, ...popularRows.map((r) => r.id), ...ranRows.map((r) => r.id), ...freshRows.map((r) => r.id)])], owner);
    const byId = new Map(all.map((pin) => [pin.id, pin]));
    const of = (ids: string[]) => ids.flatMap((id) => { const pin = byId.get(id); return pin && !hidden.has(id) ? [candidate(pin)] : []; });
    const sources: NoahPinSources = { personal: of(personalIds), popular: of(popularRows.map((r) => r.id)), ran: of(ranRows.map((r) => r.id)), fresh: of(freshRows.map((r) => r.id)) };
    const chosen = noahComposePins(sources, size, new Set(state.shown));
    const taken = new Set(chosen.map((item) => item.id));
    // 印: 出所ごとに、前から続けて出した所まで進める。飛ばして先に出した物は shown に入れ、後の頁で重ねて出さない。
    const next: NoahPinCursor = { popular: state.popular, ran: state.ran, fresh: state.fresh, done: [...state.done], shown: [] };
    const advance = <T extends { id: string }>(key: 'popular' | 'ran' | 'fresh', rows: T[], value: (row: T) => number) => {
      let index = 0;
      while (index < rows.length && (taken.has(rows[index].id) || hidden.has(rows[index].id) || !byId.has(rows[index].id) || state.shown.includes(rows[index].id))) index++;
      if (index > 0) next[key] = [value(rows[index - 1]), rows[index - 1].id];
      if (index === rows.length && rows.length < want && !next.done.includes(key)) next.done.push(key);
      for (const row of rows.slice(index)) if (taken.has(row.id)) next.shown.push(row.id);
    };
    advance('popular', popularRows, (row) => row.hot);
    advance('ran', ranRows, (row) => row.l2_at);
    advance('fresh', freshRows, (row) => row.fresh);
    for (const id of personalIds) if (taken.has(id)) next.shown.push(id);
    for (const id of state.shown) if (!next.shown.includes(id)) next.shown.push(id);
    next.shown = next.shown.slice(0, 30);
    const finished = next.done.length === 3;
    return { items: chosen.map((item) => byId.get(item.id)!), nextCursor: finished || chosen.length === 0 ? null : noahPinCursorEncode(next) };
  }

  /** 本人へのおすすめの候補: フォローした公開ボードに新しく入った物（15 件まで）と、本人の保存から Pixie で行き着く物（15 件まで）。 */
  async function personal(owner: string): Promise<string[]> {
    const followed = (await prepare(`SELECT p.family_id AS id, MAX(p.created_at) AS at FROM noah_board_follows w JOIN noah_board_pins p ON p.board_id = w.board_id
      JOIN noah_boards b ON b.id = w.board_id WHERE w.follower_id = ? AND b.visibility = 'public' GROUP BY p.family_id ORDER BY at DESC LIMIT 15`, owner).all<{ id: string }>()).results.map((row) => row.id);
    const queries = (await prepare('SELECT family_id, MAX(created_at) AS saved_at FROM noah_board_pins WHERE owner_id = ? GROUP BY family_id ORDER BY saved_at DESC LIMIT ?', owner, NOAH_PIN_RANK.personalQueries)
      .all<{ family_id: string; saved_at: number }>()).results.map((row) => ({ familyId: row.family_id, savedAt: Number(row.saved_at) }));
    const mine = new Set((await prepare('SELECT DISTINCT family_id FROM noah_board_pins WHERE owner_id = ? LIMIT 2000', owner).all<{ family_id: string }>()).results.map((row) => row.family_id));
    const walked = queries.length ? noahPixieScores(queries, await edges(queries.map((query) => query.familyId), owner), now(), mine).slice(0, 15).map((row) => row.familyId) : [];
    return [...new Set([...followed.filter((id) => !mine.has(id)), ...walked])];
  }
  /** Pixie の 1 往復: 起点の Agent を含む、他の人のボードと、そのボードの Agent。読む行は 5,000 まで。 */
  async function edges(from: readonly string[], except: string | null): Promise<NoahPixieEdge[]> {
    const out: NoahPixieEdge[] = [];
    for (const part of chunk(from, 80)) {
      const rows = (await prepare(`SELECT q.family_id AS from_id, p.family_id AS to_id, p.board_id, b.pins AS board_size, b.owner_id FROM noah_board_pins q
        JOIN noah_board_pins p ON p.board_id = q.board_id JOIN noah_boards b ON b.id = q.board_id
        WHERE q.family_id IN (${marks(part.length)}) AND q.owner_id IS NOT ? LIMIT 5000`, ...part, except).all<{ from_id: string; to_id: string; board_id: string; board_size: number; owner_id: string }>()).results;
      for (const row of rows) out.push({ from: row.from_id, to: row.to_id, boardId: row.board_id, boardSize: Number(row.board_size), owner: row.owner_id });
    }
    return out;
  }
  /** 「これも使われています」: その Agent を保存した他の人のボードから、Pixie で行き着く物。5 人より少ない人の保存からは出さない。 */
  async function related(familyId: string, owner: string | null) {
    const scored = noahPixieScores([{ familyId, savedAt: now() }], await edges([familyId], owner), now());
    return pins(scored.slice(0, NOAH_PIN_RANK.related).map((row) => row.familyId), owner);
  }

  /**
   * ボードのおすすめ（本人の指示「どのボードに保存したかでおすすめが変わるように」）: そのボードの新しい保存 20 件を起点に、
   * 他の人のボードを経て Pixie で行き着く物。ボードに入っている物と、見る人が「表示しない」にした物は出さない。
   * 5 人より少ない人の保存からは出さない（noahPixieScores の決まり）。持ち主か、公開のボードだけ。
   */
  async function boardPicks(id: string, viewer: string | null) {
    const row = await prepare(`SELECT ${BOARD_COLUMNS} FROM noah_boards WHERE id = ?`, id).first<BoardRow>();
    if (!row || (row.visibility !== 'public' && row.owner_id !== viewer)) throw new NoahAgentError('ボードが見つかりません。', 404);
    const queries = (await prepare('SELECT family_id, created_at FROM noah_board_pins WHERE board_id = ? ORDER BY created_at DESC LIMIT ?', id, NOAH_PIN_RANK.personalQueries)
      .all<{ family_id: string; created_at: number }>()).results.map((pin) => ({ familyId: pin.family_id, savedAt: Number(pin.created_at) }));
    if (!queries.length) return [];
    const inBoard = new Set((await prepare('SELECT family_id FROM noah_board_pins WHERE board_id = ? LIMIT ?', id, NOAH_BOARD_LIMITS.pinsPerBoard)
      .all<{ family_id: string }>()).results.map((pin) => pin.family_id));
    const hidden = viewer ? new Set((await prepare('SELECT family_id FROM noah_pin_hidden WHERE owner_id = ? LIMIT 2000', viewer)
      .all<{ family_id: string }>()).results.map((pin) => pin.family_id)) : new Set<string>();
    const scored = noahPixieScores(queries, await edges(queries.map((query) => query.familyId), row.owner_id), now(), new Set([...inBoard, ...hidden]));
    return pins(scored.slice(0, NOAH_PIN_RANK.related).map((pick) => pick.familyId), viewer);
  }

  // --- ボード ---------------------------------------------------------------

  const boardOf = (row: BoardRow, viewer: string | null, following: boolean, covers: NoahBoard['covers']): NoahBoard => ({
    id: row.id, name: row.name, visibility: row.visibility, pins: row.pins, followers: row.followers, revision: row.revision, mine: viewer === row.owner_id, following, covers,
  });
  /** ボードの表紙（新しく保存した 4 件の名前と分野）。 */
  async function coversOf(ids: readonly string[]) {
    const out = new Map<string, NoahBoard['covers']>();
    for (const id of ids) {
      const rows = (await prepare(`SELECT p.family_id AS id, c.name, c.summary FROM noah_board_pins p JOIN noah_intake_families f ON f.id = p.family_id
        JOIN noah_intake_candidates c ON c.id = f.representative_id WHERE p.board_id = ? ORDER BY p.created_at DESC LIMIT 4`, id).all<{ id: string; name: string; summary: string }>()).results;
      out.set(id, rows.map((row) => ({ id: row.id, name: row.name, topic: noahPinTopic(row.name, row.summary) })));
    }
    return out;
  }
  /** 本人のボードと、フォローしている公開ボード。 */
  async function boards(owner: string) {
    const mine = (await prepare(`SELECT ${BOARD_COLUMNS} FROM noah_boards WHERE owner_id = ? ORDER BY updated_at DESC LIMIT ?`, owner, NOAH_BOARD_LIMITS.boardsPerOwner).all<BoardRow>()).results;
    const followed = (await prepare(`SELECT b.${BOARD_COLUMNS.split(',').join(',b.')} FROM noah_board_follows w JOIN noah_boards b ON b.id = w.board_id
      WHERE w.follower_id = ? AND b.visibility = 'public' ORDER BY w.created_at DESC LIMIT 100`, owner).all<BoardRow>()).results;
    const covers = await coversOf([...mine, ...followed].map((row) => row.id));
    return { mine: mine.map((row) => boardOf(row, owner, false, covers.get(row.id) ?? [])), following: followed.map((row) => boardOf(row, owner, true, covers.get(row.id) ?? [])) };
  }
  /** 1 つのボードと、その Agent（新しく保存した順・30 件ずつ）。持ち主か、公開のボードだけ。 */
  async function board(id: string, viewer: string | null, cursor: string | null) {
    const row = await prepare(`SELECT ${BOARD_COLUMNS} FROM noah_boards WHERE id = ?`, id).first<BoardRow>();
    if (!row || (row.visibility !== 'public' && row.owner_id !== viewer)) throw new NoahAgentError('ボードが見つかりません。', 404);
    const match = cursor ? /^(0|[1-9]\d{0,15}):([\x21-\x7e]{3,400})$/u.exec(cursor) : null;
    if (cursor && !match) throw new NoahAgentError('ページの指定を確認してください。');
    const before = match ? Number(match[1]) : Number.MAX_SAFE_INTEGER, after = match?.[2] ?? '';
    const rows = (await prepare(`SELECT family_id, created_at FROM noah_board_pins WHERE board_id = ? AND (created_at < ? OR (created_at = ? AND family_id > ?)) ORDER BY created_at DESC, family_id LIMIT 31`,
      id, before, before, after).all<{ family_id: string; created_at: number }>()).results;
    const following = viewer && viewer !== row.owner_id ? !!(await prepare('SELECT 1 AS ok FROM noah_board_follows WHERE board_id = ? AND follower_id = ?', id, viewer).first()) : false;
    const page = rows.slice(0, 30), last = page.at(-1);
    return { board: boardOf(row, viewer, following, []), items: await pins(page.map((r) => r.family_id), viewer), nextCursor: rows.length > 30 && last ? `${last.created_at}:${last.family_id}` : null };
  }
  async function own(owner: string, id: string, revision?: number) {
    const row = await prepare(`SELECT ${BOARD_COLUMNS} FROM noah_boards WHERE id = ?`, id).first<BoardRow>();
    if (!row || row.owner_id !== owner) throw new NoahAgentError('ボードが見つかりません。', 404);
    if (revision !== undefined && row.revision !== revision) throw new NoahAgentError('内容が更新されました。再読込してください。', 409);
    return row;
  }
  async function create(owner: string, name: string, visibility: 'private' | 'public') {
    const count = await prepare('SELECT COUNT(*) AS n FROM noah_boards WHERE owner_id = ?', owner).first<{ n: number }>();
    if (Number(count?.n ?? 0) >= NOAH_BOARD_LIMITS.boardsPerOwner) throw new NoahAgentError(`ボードは ${NOAH_BOARD_LIMITS.boardsPerOwner} 個までです。`, 409);
    const id = uuid(), at = now();
    await prepare(`INSERT INTO noah_boards(${BOARD_COLUMNS}) VALUES(?, ?, ?, ?, 0, 0, 1, ?, ?)`, id, owner, name, visibility, at, at).run();
    return { id, revision: 1 };
  }
  async function update(owner: string, id: string, revision: number, change: { name?: string; visibility?: 'private' | 'public' }) {
    const row = await own(owner, id, revision);
    const result = await prepare('UPDATE noah_boards SET name = ?, visibility = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND revision = ?',
      change.name ?? row.name, change.visibility ?? row.visibility, now(), id, revision).run();
    if (result.meta.changes !== 1) throw new NoahAgentError('内容が更新されました。再読込してください。', 409);
    // 非公開にしたら、他の人のフォローは外す（非公開のボードを、他の人の一覧に出さない）。
    if (change.visibility === 'private' && row.visibility === 'public') await db.batch([prepare('DELETE FROM noah_board_follows WHERE board_id = ?', id), prepare('UPDATE noah_boards SET followers = 0 WHERE id = ?', id)]);
    return { id, revision: revision + 1 };
  }
  /** ボードを消す。中の保存とフォローも消し、保存した人の数を数え直す。 */
  async function remove(owner: string, id: string, revision: number) {
    await own(owner, id, revision);
    const families = (await prepare('SELECT family_id FROM noah_board_pins WHERE board_id = ?', id).all<{ family_id: string }>()).results.map((row) => row.family_id);
    await db.batch([prepare('DELETE FROM noah_board_pins WHERE board_id = ?', id), prepare('DELETE FROM noah_board_follows WHERE board_id = ?', id), prepare('DELETE FROM noah_boards WHERE id = ? AND revision = ?', id, revision)]);
    for (const family of families) await recount(family);
    return { id, removed: true };
  }
  /** 保存。載せている Agent だけ。同じボードに 2 回目は、何もしない。 */
  async function save(owner: string, boardId: string, familyId: string) {
    const row = await own(owner, boardId);
    const listed = await prepare(`SELECT 1 AS ok FROM noah_intake_families f WHERE f.id = ? AND ${LISTED}`, familyId).first();
    if (!listed) throw new NoahAgentError('Agentが見つかりません。', 404);
    if (row.pins >= NOAH_BOARD_LIMITS.pinsPerBoard) throw new NoahAgentError(`1 つのボードに保存できるのは ${NOAH_BOARD_LIMITS.pinsPerBoard} 件までです。`, 409);
    const inserted = await prepare('INSERT OR IGNORE INTO noah_board_pins(board_id, family_id, owner_id, created_at) VALUES(?, ?, ?, ?)', boardId, familyId, owner, now()).run();
    if (inserted.meta.changes === 1) {
      await prepare('UPDATE noah_boards SET pins = pins + 1, updated_at = ?, revision = revision + 1 WHERE id = ?', now(), boardId).run();
      await recount(familyId);
    }
    return { boardId, familyId, saved: true };
  }
  async function unsave(owner: string, boardId: string, familyId: string) {
    await own(owner, boardId);
    const removed = await prepare('DELETE FROM noah_board_pins WHERE board_id = ? AND family_id = ?', boardId, familyId).run();
    if (removed.meta.changes === 1) {
      await prepare('UPDATE noah_boards SET pins = MAX(pins - 1, 0), updated_at = ?, revision = revision + 1 WHERE id = ?', now(), boardId).run();
      await recount(familyId);
    }
    return { boardId, familyId, saved: false };
  }
  /** フォロー。他の人の公開ボードだけ。 */
  async function follow(viewer: string, boardId: string, on: boolean) {
    const row = await prepare(`SELECT ${BOARD_COLUMNS} FROM noah_boards WHERE id = ?`, boardId).first<BoardRow>();
    if (!row || row.visibility !== 'public' || row.owner_id === viewer) throw new NoahAgentError('ボードが見つかりません。', 404);
    if (on) {
      const count = await prepare('SELECT COUNT(*) AS n FROM noah_board_follows WHERE follower_id = ?', viewer).first<{ n: number }>();
      if (Number(count?.n ?? 0) >= NOAH_BOARD_LIMITS.followsPerOwner) throw new NoahAgentError(`フォローできるボードは ${NOAH_BOARD_LIMITS.followsPerOwner} 個までです。`, 409);
      const added = await prepare('INSERT OR IGNORE INTO noah_board_follows(board_id, follower_id, created_at) VALUES(?, ?, ?)', boardId, viewer, now()).run();
      if (added.meta.changes === 1) await prepare('UPDATE noah_boards SET followers = followers + 1 WHERE id = ?', boardId).run();
    } else {
      const removed = await prepare('DELETE FROM noah_board_follows WHERE board_id = ? AND follower_id = ?', boardId, viewer).run();
      if (removed.meta.changes === 1) await prepare('UPDATE noah_boards SET followers = MAX(followers - 1, 0) WHERE id = ?', boardId).run();
    }
    return { boardId, following: on };
  }
  /** 「表示しない」。その本人の一覧から外し、全員の合計の hides に足す（並びで強く下げる）。戻すと、外れる。 */
  async function hide(owner: string, familyId: string, on: boolean) {
    const exists = await prepare('SELECT 1 AS ok FROM noah_intake_families WHERE id = ?', familyId).first();
    if (!exists) throw new NoahAgentError('Agentが見つかりません。', 404);
    const changed = on
      ? await prepare('INSERT OR IGNORE INTO noah_pin_hidden(owner_id, family_id, created_at) VALUES(?, ?, ?)', owner, familyId, now()).run()
      : await prepare('DELETE FROM noah_pin_hidden WHERE owner_id = ? AND family_id = ?', owner, familyId).run();
    if (changed.meta.changes === 1) await recount(familyId);
    return { familyId, hidden: on };
  }

  return { feed, personal, related, boardPicks, pins, boards, board, create, update, remove, save, unsave, follow, hide, recount, rollupIfDue };
}
