/**
 * Noah 棚の保存と読み取り（task 110）。カードを置く・運営が動かして確かめる・外す・専門家の確かめ・棚の一覧・載せるかの見直し。
 *
 * 載せるかは、読むたびに、今の事実から計算する（lib/noah-shelf.ts の noahPackageListing）。表の listed・reason は、運営の画面と、
 * 数える問い合わせのための写しで、見直し（recheck）が書く。だから、系列が一覧から外れた・道具の定義が変わった時は、次に棚を読んだ時から出ない。
 *
 * ローンチの範囲（docs/noah/spec-110-shelf.md の 13 章）: 工程の先の事実を読むのは、取り込んだ系列（相手のサーバー）だけ。
 * 家の端末と Noah の中の道具の事実は task 112 で足す（それまでは「工程の先がありません」として載せない）。工程をつなぐカードも 112。
 *
 * 本人の ID は、運営が「動かして確かめた」かを見る時に、その審査者自身の依頼を読むためだけに使う。書くのは、カードと、その工程の行だけ。
 */
import type { IntakeDb } from './noah-intake-db.ts';
import { NoahAgentError } from './noah-agent-upload.ts';
import {
  NOAH_PACKAGE_LIMITS, NOAH_SHELVES, NOAH_TOPIC_LABELS, NoahShelfError, noahPackageListing, noahPackageSha256, noahPackageStepRows, parseNoahPackage, rankNoahShelf,
  type NoahPackage, type NoahPackageListing, type NoahPackageReason, type NoahShelfId, type NoahStepFact,
} from './noah-shelf.ts';
import { canonicalJson } from './noah-connect-requirements.ts';
import { NOAH_SHELF_REASON_TEXT, noahShelfTarget, type NoahShelfCard, type NoahShelfStateCard } from './noah-shelf-view.ts';

export { NOAH_SHELF_REASON_TEXT, NOAH_SHELF_TEXT, noahShelfTarget, type NoahShelfCard, type NoahShelfStateCard } from './noah-shelf-view.ts';

export type ShelfDependencies = { db: IntakeDb; now?: () => number };

/** 運営が「動かして確かめた」と言えるのは、その審査者自身の、成功した依頼が、この期間の中にある時だけ。 */
export const NOAH_SHELF_VERIFY_WINDOW_MS = 7 * 86_400_000;
/** 載せるかの見直しを、巡回の合図の中で行う間隔（合図は 1 分ごと。見直しは、カードの数だけ読む）。 */
export const NOAH_SHELF_RECHECK_MS = 10 * 60_000;
/** 棚のカードが使う系列を、握手で確かめ直す間隔（つないでいる人がいる系列と同じ。lib/noah-probe.ts の NOAH_CHECK_INTERVALS.connected）。 */
export const NOAH_SHELF_PROBE_MS = 24 * 3_600_000;
/** 1 つの文に結ぶ値の数（D1 は 100 まで）と、1 回の書き込みに入れる文の数。 */
const CHUNK = 90, BATCH = 40;

type CardRow = {
  id: string; shelf: NoahShelfId; topic: string; position: number; status: NoahPackage['status']; package_json: string; package_sha256: string;
  listed: number; reason: NoahPackageReason | null; reason_step: number | null; checked_at: number | null; created_at: number; updated_at: number; revision: number;
};
const CARD_COLUMNS = 'id,shelf,topic,position,status,package_json,package_sha256,listed,reason,reason_step,checked_at,created_at,updated_at,revision';
/** 系列の今の事実。listed は、一覧に載っていて、取り下げも隠しもしていない時。tools_sha256 は、その系列の代表の、道具の一覧全部の hash。 */
type FamilyFact = { id: string; listed: number; level: 0 | 1 | 2; withdrawn_at: number | null; hidden_at: number | null; form_tools: number | null; tools_sha256: string | null; checked_at: number | null };
const FAMILY_FACTS = `SELECT f.id,f.listed,f.level,f.withdrawn_at,f.hidden_at,k.form_tools,k.tools_sha256,k.checked_at
 FROM noah_intake_families f LEFT JOIN noah_intake_checks k ON k.candidate_id=f.representative_id WHERE f.id IN `;
const marks = (n: number) => `(${Array.from({ length: n }, () => '?').join(',')})`;
const chunks = <T>(values: T[]) => Array.from({ length: Math.ceil(values.length / CHUNK) }, (_, index) => values.slice(index * CHUNK, (index + 1) * CHUNK));
function shelfError(error: unknown): never {
  if (error instanceof NoahShelfError) throw new NoahAgentError(error.message, 400);
  throw error;
}

export function createNoahShelfStore(deps: ShelfDependencies) {
  const { db } = deps, now = deps.now ?? Date.now;
  const prepare = (sql: string, ...args: (string | number | null)[]) => db.prepare(sql).bind(...args);

  async function familyFacts(ids: string[]): Promise<Map<string, FamilyFact>> {
    const out = new Map<string, FamilyFact>();
    for (const part of chunks([...new Set(ids)])) for (const row of (await prepare(FAMILY_FACTS + marks(part.length), ...part).all<FamilyFact>()).results) out.set(row.id, row);
    return out;
  }
  const familyIds = (pkgs: NoahPackage[]) => pkgs.flatMap((pkg) => pkg.steps.flatMap((step) => (step.ref.kind === 'family' ? [step.ref.familyId] : [])));
  /** 工程ごとの事実。ローンチの範囲では、取り込んだ系列だけを読む（他の工程は null。本人の工程は、事実を見ない）。 */
  function factsOf(pkg: NoahPackage, families: Map<string, FamilyFact>): (NoahStepFact | null)[] {
    return pkg.steps.map((step) => {
      if (step.ref.kind !== 'family') return null;
      const row = families.get(step.ref.familyId);
      if (!row) return null;
      return { kind: 'family', listed: row.listed === 1 && row.withdrawn_at === null && row.hidden_at === null, level: row.level, formTool: (row.form_tools ?? 0) >= 1, toolSha256: row.tools_sha256 };
    });
  }
  const listingOf = (pkg: NoahPackage, families: Map<string, FamilyFact>): NoahPackageListing => noahPackageListing(pkg, factsOf(pkg, families), { chains: false, home: false });
  const parsed = (row: CardRow): NoahPackage | null => {
    try { return parseNoahPackage(JSON.parse(row.package_json)); } catch { return null; }
  };
  const cardRows = async (where: string, ...args: (string | number)[]) => (await prepare(`SELECT ${CARD_COLUMNS} FROM noah_packages ${where}`, ...args).all<CardRow>()).results;

  /** 棚の一覧（誰でも読める）。運営が確かめたカードを、今の事実で判定し直し、載る物だけを、棚ごとに並べる。 */
  async function list(): Promise<{ shelves: { id: NoahShelfId; name: string; cards: NoahShelfCard[] }[] }> {
    const rows = await cardRows("WHERE status='verified' ORDER BY shelf,position,id LIMIT ?", NOAH_SHELVES.length * NOAH_PACKAGE_LIMITS.cardsPerShelf);
    const pkgs = rows.flatMap((row) => { const pkg = parsed(row); return pkg ? [pkg] : []; });
    const families = await familyFacts(familyIds(pkgs));
    const shelves = NOAH_SHELVES.map((shelf) => {
      const live = pkgs.filter((pkg) => pkg.shelf === shelf.id).flatMap((pkg) => {
        const listing = listingOf(pkg, families);
        return listing.listed ? [{ pkg, listing }] : [];
      }).slice(0, NOAH_PACKAGE_LIMITS.cardsPerShelf);
      const ranked = rankNoahShelf(live.map(({ pkg }) => ({ pkg, evidence: null })), { byEvidence: false, personal: false });
      const byId = new Map(live.map((item) => [item.pkg.id, item]));
      const cards = ranked.flatMap((rank): NoahShelfCard[] => {
        const item = byId.get(rank.packageId);
        if (!item || !item.listing.listed) return [];
        const { pkg, listing } = item;
        // ローンチの範囲で載るのは、相手のサーバーの道具 1 つのカード（noahPackageListing を chains: false で呼んでいる）。その道具を開く。
        const remote = pkg.steps.find((step) => step.ref.kind === 'family')?.ref;
        if (!remote || remote.kind !== 'family') return [];
        return [{
          id: pkg.id, shelf: pkg.shelf, topic: pkg.topic, topicLabel: NOAH_TOPIC_LABELS[pkg.topic], title: pkg.title, promise: pkg.promise, give: pkg.give, get: pkg.get,
          priceHint: pkg.priceHint ?? null, advice: pkg.advice === 'health', runs: listing.runs, ownerSteps: listing.ownerSteps, ownerMinutes: listing.ownerMinutes,
          position: rank.position, why: rank.why, target: noahShelfTarget(remote.familyId, remote.tool, pkg.id, rank.position),
        }];
      });
      return { id: shelf.id, name: shelf.name, cards };
    });
    return { shelves };
  }

  /** 運営の画面（審査者だけ）: 全部のカードと、今の判定。表の写しが今の判定と違う時は、見直し（recheck）で揃う。 */
  async function state(): Promise<{ cards: NoahShelfStateCard[] }> {
    const rows = await cardRows('ORDER BY shelf,position,id LIMIT ?', NOAH_SHELVES.length * NOAH_PACKAGE_LIMITS.cardsPerShelf);
    const pkgs = rows.map(parsed);
    const families = await familyFacts(familyIds(pkgs.filter((pkg): pkg is NoahPackage => pkg !== null)));
    return {
      cards: rows.flatMap((row, index): NoahShelfStateCard[] => {
        const pkg = pkgs[index];
        if (!pkg) return [];
        const listing = listingOf(pkg, families);
        const reason = listing.listed ? null : listing.reason, reasonStep = listing.listed ? null : listing.step;
        return [{
          id: pkg.id, shelf: pkg.shelf, topic: pkg.topic, title: pkg.title, status: pkg.status, position: pkg.position, revision: row.revision,
          listed: listing.listed, reason, reasonStep, reasonText: reason ? NOAH_SHELF_REASON_TEXT[reason] : null,
          verifiedAt: pkg.verified?.at ?? null, runs: pkg.verified?.runs ?? null, reviewAt: pkg.review?.expertAt ?? null, advice: pkg.advice === 'health',
          checkedAt: row.checked_at, updatedAt: row.updated_at, package: pkg,
        }];
      }),
    };
  }

  /** カードの行と、その工程の行を、1 回の書き込みで置き換える。版が合う時だけ（expected が null なら、新しいカード）。 */
  async function write(pkg: NoahPackage, expected: number | null, listing: NoahPackageListing) {
    const at = now(), json = canonicalJson(pkg), sha = await noahPackageSha256(pkg);
    if (new TextEncoder().encode(json).byteLength > NOAH_PACKAGE_LIMITS.bytes) throw new NoahAgentError(`カード 1 枚は ${NOAH_PACKAGE_LIMITS.bytes} bytes までです。`);
    const listed = listing.listed ? 1 : 0, reason = listing.listed ? null : listing.reason, reasonStep = listing.listed ? null : listing.step;
    const head = expected === null
      ? prepare(`INSERT OR IGNORE INTO noah_packages (${CARD_COLUMNS}) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        pkg.id, pkg.shelf, pkg.topic, pkg.position, pkg.status, json, sha, listed, reason, reasonStep, at, at, at, pkg.revision)
      : prepare('UPDATE noah_packages SET shelf=?,topic=?,position=?,status=?,package_json=?,package_sha256=?,listed=?,reason=?,reason_step=?,checked_at=?,updated_at=?,revision=? WHERE id=? AND revision=?',
        pkg.shelf, pkg.topic, pkg.position, pkg.status, json, sha, listed, reason, reasonStep, at, at, pkg.revision, pkg.id, expected);
    // 工程の行は、カードの行を書けた時だけ置き換える（版が合わない書き込みで、工程だけが変わらないように）。
    const guard = 'EXISTS (SELECT 1 FROM noah_packages WHERE id=? AND revision=? AND package_sha256=?)';
    const statements = [
      head,
      prepare(`DELETE FROM noah_package_steps WHERE package_id=? AND ${guard}`, pkg.id, pkg.id, pkg.revision, sha),
      ...noahPackageStepRows(pkg).map((row) => prepare(`INSERT INTO noah_package_steps (package_id,step,kind,ref,tool) SELECT ?,?,?,?,? WHERE ${guard}`,
        row.package_id, row.step, row.kind, row.ref, row.tool, pkg.id, pkg.revision, sha)),
    ];
    const results = await db.batch(statements);
    if (results[0]?.meta.changes !== 1) throw new NoahAgentError(expected === null ? '同じ ID のカードがあります。読み直してください。' : '内容が更新されました。再読込してください。', 409);
    return { id: pkg.id, revision: pkg.revision, status: pkg.status, listed: listing.listed, reason, reasonText: reason ? NOAH_SHELF_REASON_TEXT[reason] : null };
  }
  async function current(id: string, revision: number) {
    const row = await prepare(`SELECT ${CARD_COLUMNS} FROM noah_packages WHERE id=?`, id).first<CardRow>();
    if (!row) throw new NoahAgentError('カードが見つかりません。', 404);
    if (row.revision !== revision) throw new NoahAgentError('内容が更新されました。再読込してください。', 409);
    const pkg = parsed(row);
    if (!pkg) throw new NoahAgentError('カードを読めません。置き直してください。', 409);
    return { row, pkg };
  }
  const evaluate = async (pkg: NoahPackage) => listingOf(pkg, await familyFacts(familyIds([pkg])));

  /**
   * カードを置く・書き換える。置いたカードは、いつも下書きに戻る（確かめた記録と、専門家の確かめは、中身が変わったので消す）。
   * revision は、今の版（新しいカードは null）。
   */
  async function put(input: unknown, revision: number | null) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new NoahAgentError('カードの形を確認してください。');
    const draft = { ...(input as Record<string, unknown>) };
    delete draft.verified;
    delete draft.review;
    let pkg: NoahPackage;
    try { pkg = parseNoahPackage({ ...draft, status: 'draft', revision: revision === null ? 1 : revision + 1 }); } catch (error) { shelfError(error); }
    if (revision !== null) await current(pkg.id, revision);
    return write(pkg, revision, await evaluate(pkg));
  }

  /**
   * 運営が動かして確かめた、と記録する。工程ごとに、その審査者自身の成功した依頼が、直近 7 日にある時だけ通す。
   * 確かめた時の中身は、サーバーが今の事実から作る（審査者が入れない）。ローンチの範囲では、相手のサーバーの道具と、本人の工程だけ。
   */
  async function verify(reviewer: string, id: string, revision: number) {
    const { pkg } = await current(id, revision);
    if (pkg.status === 'retired') throw new NoahAgentError('外したカードです。置き直してから確かめてください。', 409);
    const families = await familyFacts(familyIds([pkg])), since = now() - NOAH_SHELF_VERIFY_WINDOW_MS;
    const fingerprints: string[] = [];
    let runs = Number.POSITIVE_INFINITY;
    for (const [index, step] of pkg.steps.entries()) {
      const ref = step.ref, label = `工程 ${index + 1}`;
      if (ref.kind === 'owner') { fingerprints.push('owner'); continue; }
      if (ref.kind !== 'family') throw new NoahAgentError(`${label}は、まだ確かめられません（相手のサーバーの道具と、本人の工程だけを確かめられます）。`, 409);
      const fact = families.get(ref.familyId);
      if (!fact || fact.listed !== 1 || fact.withdrawn_at !== null || fact.hidden_at !== null || fact.level !== 2 || (fact.form_tools ?? 0) < 1 || !fact.tools_sha256) {
        throw new NoahAgentError(`${label}の Agent は、今は一覧に載っていないか、人が動かした記録がありません。`, 409);
      }
      const done = (await prepare(`SELECT a.finished_at,w.payload FROM noah_asks a JOIN noah_connections c ON c.id=a.connection_id LEFT JOIN work_jobs w ON w.id=a.work_id
        WHERE a.owner_id=? AND c.owner_id=? AND c.family_key=? AND a.tool=? AND a.mode='form' AND a.state='succeeded' AND a.finished_at>=? ORDER BY a.finished_at DESC LIMIT 50`,
      reviewer, reviewer, ref.familyId, ref.tool, since).all<{ finished_at: number; payload: string | null }>()).results;
      if (!done.length) throw new NoahAgentError(`${label}の道具（${ref.tool}）を、あなたが直近 7 日に動かして、成果が返った記録がありません。先に動かしてください。`, 409);
      // 動かした後に、巡回が道具の定義を読み直していない（＝ 今の hash は、その実行が書いた物）か、その実行の時の道具の一覧と、今の一覧が同じ時だけ。
      const latest = done[0];
      let toolsAtRun: string | null = null;
      try { toolsAtRun = (JSON.parse(latest.payload ?? 'null') as { noahRemote?: { toolsSha256?: string } } | null)?.noahRemote?.toolsSha256 ?? null; } catch { /* 読めない Work は、照らさない。 */ }
      if (!(latest.finished_at >= (fact.checked_at ?? 0) || toolsAtRun === fact.tools_sha256)) {
        throw new NoahAgentError(`${label}の道具の一覧が、動かした後に変わったかもしれません。もう一度動かしてから確かめてください。`, 409);
      }
      fingerprints.push(fact.tools_sha256);
      runs = Math.min(runs, done.length);
    }
    if (!Number.isFinite(runs)) throw new NoahAgentError('自動で動く工程が無いカードは、確かめられません。', 409);
    let next: NoahPackage;
    try { next = parseNoahPackage({ ...pkg, status: 'verified', verified: { at: now(), runs, fingerprints }, revision: revision + 1 }); } catch (error) { shelfError(error); }
    return write(next, revision, listingOf(next, families));
  }

  /** 外す。棚から消える。行は残す（確かめた記録は、カードの規則で、確かめた状態の時だけ置くので、消える）。置き直すと、下書きから。 */
  async function retire(id: string, revision: number) {
    const { pkg } = await current(id, revision);
    const rest: Record<string, unknown> = { ...pkg };
    delete rest.verified;
    let next: NoahPackage;
    try { next = parseNoahPackage({ ...rest, status: 'retired', revision: revision + 1 }); } catch (error) { shelfError(error); }
    return write(next, revision, { listed: false, reason: 'retired', step: null });
  }

  /** 専門家に確かめた日を記録する（助言を含むカードだけ）。誰に何を確かめたかは、docs/noah-design.md の 9 章。 */
  async function review(id: string, revision: number, expertAt: number) {
    const { pkg } = await current(id, revision);
    if (!pkg.advice) throw new NoahAgentError('助言を含むカードだけに記録できます。');
    if (!Number.isSafeInteger(expertAt) || expertAt < 1 || expertAt > now()) throw new NoahAgentError('確かめた日を確認してください。');
    let next: NoahPackage;
    try { next = parseNoahPackage({ ...pkg, review: { expertAt }, revision: revision + 1 }); } catch (error) { shelfError(error); }
    return write(next, revision, await evaluate(next));
  }

  /**
   * 載せるかの見直し。確かめたカードを、今の事実で判定し直し、写しが違う行だけを書く（版を 1 つ進める）。
   * あわせて、載せているカードが使う系列の、次の握手の時刻を、24 時間以内へ早める（止まった物を、棚に長く置かない）。
   */
  async function recheck(): Promise<{ checked: number; changed: number; probesPulled: number }> {
    const at = now();
    const rows = await cardRows("WHERE status='verified' LIMIT ?", NOAH_SHELVES.length * NOAH_PACKAGE_LIMITS.cardsPerShelf);
    const pkgs = rows.map(parsed);
    const families = await familyFacts(familyIds(pkgs.filter((pkg): pkg is NoahPackage => pkg !== null)));
    const writes: D1PreparedStatement[] = [];
    rows.forEach((row, index) => {
      const pkg = pkgs[index];
      const listing: NoahPackageListing = pkg ? listingOf(pkg, families) : { listed: false, reason: 'step_missing', step: null };
      const listed = listing.listed ? 1 : 0, reason = listing.listed ? null : listing.reason, reasonStep = listing.listed ? null : listing.step;
      if (row.listed === listed && row.reason === reason && row.reason_step === reasonStep) return;
      writes.push(prepare('UPDATE noah_packages SET listed=?,reason=?,reason_step=?,checked_at=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=?', listed, reason, reasonStep, at, at, row.id, row.revision));
    });
    // 変わらなかった行も、見直した時刻だけは進める（次の見直しの時機を決めるため）。版は進めない。
    const stamp = prepare("UPDATE noah_packages SET checked_at=? WHERE status='verified'", at);
    const pulled = prepare(`UPDATE noah_intake_checks SET next_check_at=COALESCE(checked_at,0)+? WHERE next_check_at>COALESCE(checked_at,0)+?
      AND candidate_id IN (SELECT f.representative_id FROM noah_intake_families f WHERE f.id IN (
        SELECT s.ref FROM noah_package_steps s JOIN noah_packages p ON p.id=s.package_id WHERE s.kind='family' AND p.listed=1))`, NOAH_SHELF_PROBE_MS, NOAH_SHELF_PROBE_MS);
    let changed = 0;
    for (const part of Array.from({ length: Math.ceil(writes.length / BATCH) }, (_, index) => writes.slice(index * BATCH, (index + 1) * BATCH))) {
      changed += (await db.batch(part)).reduce((sum, result) => sum + (result?.meta.changes ?? 0), 0);
    }
    const results = await db.batch([stamp, pulled]);
    return { checked: rows.length, changed, probesPulled: results[1]?.meta.changes ?? 0 };
  }
  /** 巡回の合図から呼ぶ。前の見直しから 10 分たっていれば、見直す（確かめたカードが無ければ、何もしない）。 */
  async function recheckIfDue() {
    const last = await prepare("SELECT COUNT(*) AS n, MAX(checked_at) AS at FROM noah_packages WHERE status='verified'").first<{ n: number; at: number | null }>();
    if (!last || !last.n || (last.at !== null && now() - last.at < NOAH_SHELF_RECHECK_MS)) return null;
    return recheck();
  }

  return { list, state, put, verify, retire, review, recheck, recheckIfDue };
}
