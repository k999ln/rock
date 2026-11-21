/**
 * Noah を 300 人に出す試行（task 114）: 経路の札・入口・段の判定・本人の報告。仕様: docs/noah/trial-300.md の 3・4・5・7・9 章。
 *
 * 段の判定と式（NOAH_TRIAL・noahTrialGate・noahTrialReach・noahEarnEstimate・noahTrialVia）は、型契約ごと lib/noah-shelf.ts へ移してある。ここは、表の読み書き。
 * 数えるのは、試行に入った人だけ（noah_trial_entries から引く。接続と依頼の表を、端から読まない）。5 人未満の経路とカードの数は、返さない。
 * 本人の報告は、本人が自分で入れる 4 つの数だけ（文章は置かない）。「稼ぐ・仕事を省く」の棚のカードで、そのカードの道具を動かして成果が返った本人だけが入れられる。
 */
import type { IntakeDb } from './noah-intake-db.ts';
import { NoahAgentError } from './noah-agent-upload.ts';
import { NOAH_TRIAL, noahTrialGate, noahTrialVia, type NoahTrialCounts, type NoahTrialFailing } from './noah-shelf.ts';

export { NOAH_TRIAL, noahEarnEstimate, noahTrialGate, noahTrialReach, noahTrialVia } from './noah-shelf.ts';
export type TrialDependencies = { db: IntakeDb; now?: () => number };
type Wave = 1 | 2 | 3;
/** 5 人未満の経路とカードの数は、出さない（docs/noah-detailed-design.md 18 章「作る人に見せる最小の人数」と同じ）。 */
export const NOAH_TRIAL_MIN_PEOPLE = 5;

/** 運営の画面と、カードの詳細に出す文（サーバーが作る。画面は、そのまま出す）。 */
export const NOAH_TRIAL_TEXT = {
  done: (wave: number) => `段 ${wave} を終えました`,
  failing: (reason: NoahTrialFailing, have: number, need: number): string => ({
    people: `人数が足りません（成果まで行った人 ${have} / ${need}）`,
    connect: `つながる割合が足りません（${Math.round(NOAH_TRIAL.connect * 100)}% 以上）`,
    first_result: `成果まで行く割合が足りません（${Math.round(NOAH_TRIAL.firstResult * 100)}% 以上）`,
    returned: `また使う割合が足りません（${Math.round(NOAH_TRIAL.returned * 100)}% 以上）`,
  })[reason],
  /** 5 人以上が報告したカードの合計。金額は約束ではなく、測った合計。 */
  summary: (row: { people: number; listed: number; sellers: number; orders: number; netYen: number; minutes: number }) => {
    const head = `報告した ${row.people} 人のうち、出品した ${row.listed} 人・売れた ${row.sellers} 人。`;
    if (row.orders < 1) return head;
    return `${head}1 件の手取りの平均 ¥${Math.round(row.netYen / row.orders).toLocaleString('ja-JP')}・掛けた分の平均 ${Math.round(row.minutes / row.orders)} 分`;
  },
} as const;

/** 問い合わせ（docs/contracts/noah-shelf-queries-v1.sql の trial_totals・trial_funnel・trial_earn。:名前 を ? に置き換えただけ）。 */
const TRIAL_TOTALS = `SELECT
  (SELECT COUNT(*) FROM noah_trial_entries e WHERE e.wave <= ? AND EXISTS (SELECT 1 FROM noah_connections c WHERE c.owner_id = e.owner_id)) AS pressed,
  (SELECT COUNT(*) FROM noah_trial_entries e WHERE e.wave <= ? AND EXISTS (SELECT 1 FROM noah_connections c WHERE c.owner_id = e.owner_id AND c.connected_at IS NOT NULL)) AS connected,
  (SELECT COUNT(*) FROM noah_trial_entries e WHERE e.wave <= ? AND EXISTS (SELECT 1 FROM noah_asks a WHERE a.owner_id = e.owner_id AND a.state = 'succeeded')) AS first_result,
  (SELECT COUNT(*) FROM noah_trial_entries e WHERE e.wave <= ? AND EXISTS (
     SELECT 1 FROM noah_asks b WHERE b.owner_id = e.owner_id
        AND b.created_at >= ((SELECT MIN(a.finished_at) FROM noah_asks a WHERE a.owner_id = e.owner_id AND a.state = 'succeeded') / 86400000 + 1) * 86400000)) AS returned`;
const TRIAL_FUNNEL = `SELECT e.via, COUNT(*) AS entered,
       SUM(EXISTS (SELECT 1 FROM noah_connections c WHERE c.owner_id = e.owner_id AND c.connected_at IS NOT NULL)) AS connected,
       SUM(EXISTS (SELECT 1 FROM noah_asks a WHERE a.owner_id = e.owner_id AND a.state = 'succeeded')) AS first_result
  FROM noah_trial_entries e GROUP BY e.via HAVING COUNT(*) >= 5 ORDER BY e.via`;
const TRIAL_EARN = `SELECT package_id, COUNT(*) AS people, SUM(listed) AS listed, SUM(sold > 0) AS sellers, SUM(sold) AS orders, SUM(net_yen) AS net_yen, SUM(minutes) AS minutes
  FROM noah_trial_reports GROUP BY package_id HAVING COUNT(*) >= 5 ORDER BY package_id`;
const TRIAL_EARN_ONE = `SELECT package_id, COUNT(*) AS people, SUM(listed) AS listed, SUM(sold > 0) AS sellers, SUM(sold) AS orders, SUM(net_yen) AS net_yen, SUM(minutes) AS minutes
  FROM noah_trial_reports WHERE package_id = ? GROUP BY package_id HAVING COUNT(*) >= 5`;
/** そのカードの、相手のサーバーの工程の道具を、本人が動かして成果が返ったか（成果まで行った本人だけが、報告を入れられる）。 */
const RAN_CARD = `SELECT 1 AS ok FROM noah_package_steps s WHERE s.package_id = ? AND s.kind = 'family' AND EXISTS (
  SELECT 1 FROM noah_asks a JOIN noah_connections c ON c.id = a.connection_id
   WHERE a.owner_id = ? AND c.owner_id = ? AND c.family_key = s.ref AND a.tool = s.tool AND a.state = 'succeeded') LIMIT 1`;

type TotalsRow = { pressed: number; connected: number; first_result: number; returned: number };
type EarnRow = { package_id: string; people: number; listed: number; sellers: number; orders: number; net_yen: number; minutes: number };
export type NoahTrialChannel = { via: string; label: string; wave: Wave; createdAt: number; closedAt: number | null };
export type NoahTrialEarn = { packageId: string; people: number; listed: number; sellers: number; orders: number; netYen: number; minutes: number; summary: string };
export type NoahTrialWaveState = { wave: Wave; people: number; counts: NoahTrialCounts; done: boolean; rates: { connect: number; firstResult: number; returned: number }; text: string[] };
export type NoahTrialReport = { listed: boolean; sold: number; netYen: number; minutes: number; reportedAt: number };

const hasControl = (value: string) => Array.from(value).some((ch) => { const code = ch.codePointAt(0) ?? 0; return code < 0x20 || code === 0x7f; });
const whole = (value: unknown, label: string, max: number) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) throw new NoahAgentError(`${label}は 0〜${max.toLocaleString('ja-JP')} の整数で入れてください。`);
  return value;
};
const earnOf = (row: EarnRow): NoahTrialEarn => {
  const out = { packageId: row.package_id, people: row.people, listed: row.listed, sellers: row.sellers, orders: row.orders, netYen: row.net_yen, minutes: row.minutes };
  return { ...out, summary: NOAH_TRIAL_TEXT.summary(out) };
};

export function createNoahTrialStore(deps: TrialDependencies) {
  const { db } = deps, now = deps.now ?? Date.now;
  const prepare = (sql: string, ...args: (string | number | null)[]) => db.prepare(sql).bind(...args);

  async function channels(): Promise<NoahTrialChannel[]> {
    const rows = (await prepare('SELECT via,label,wave,created_at,closed_at FROM noah_trial_channels ORDER BY wave,via LIMIT 200').all<{ via: string; label: string; wave: Wave; created_at: number; closed_at: number | null }>()).results;
    return rows.map((row) => ({ via: row.via, label: row.label, wave: row.wave, createdAt: row.created_at, closedAt: row.closed_at }));
  }

  /** 経路の札を足す（運営）。札は英小文字・数字・ハイフン。名前は運営の画面にだけ出す。 */
  async function addChannel(via: unknown, label: unknown, wave: unknown) {
    if (typeof via !== 'string' || noahTrialVia(via, [via]) === null) throw new NoahAgentError('札は、英小文字か数字で始めて、英小文字・数字・ハイフンを 40 字までで書いてください。');
    if (typeof label !== 'string' || !label.trim() || Array.from(label).length > 60 || hasControl(label)) throw new NoahAgentError('名前は 1〜60 字で書いてください。');
    if (wave !== 1 && wave !== 2 && wave !== 3) throw new NoahAgentError('段は 1・2・3 のどれかです。');
    const written = await prepare('INSERT OR IGNORE INTO noah_trial_channels(via,label,wave,created_at,closed_at) VALUES(?,?,?,?,NULL)', via, label.trim(), wave, now()).run();
    if (written.meta.changes !== 1) throw new NoahAgentError('同じ札があります。', 409);
    return { via };
  }
  /** 札を閉じる（運営）。閉じた札のリンクでは、もう入口ができない。入った人の行は残る。 */
  async function closeChannel(via: unknown) {
    if (typeof via !== 'string') throw new NoahAgentError('札を確認してください。');
    const written = await prepare('UPDATE noah_trial_channels SET closed_at=? WHERE via=? AND closed_at IS NULL', now(), via).run();
    if (written.meta.changes !== 1) throw new NoahAgentError('開いている札が見つかりません。', 404);
    return { via };
  }

  /** 本人の入口。運営が登録した、開いている札の時だけ、1 行（もう行がある本人には書かない）。段は、その札の段。 */
  async function enter(owner: string, value: unknown): Promise<{ entered: boolean; already: boolean }> {
    const open = (await prepare('SELECT via FROM noah_trial_channels WHERE closed_at IS NULL LIMIT 200').all<{ via: string }>()).results.map((row) => row.via);
    const via = noahTrialVia(value, open);
    const already = !!(await prepare('SELECT 1 AS ok FROM noah_trial_entries WHERE owner_id=?', owner).first());
    if (!via || already) return { entered: false, already };
    const written = await prepare('INSERT OR IGNORE INTO noah_trial_entries(owner_id,via,wave,created_at) SELECT ?,via,wave,? FROM noah_trial_channels WHERE via=? AND closed_at IS NULL', owner, now(), via).run();
    return { entered: written.meta.changes === 1, already: written.meta.changes !== 1 };
  }
  const entered = async (owner: string) => !!(await prepare('SELECT 1 AS ok FROM noah_trial_entries WHERE owner_id=?', owner).first());

  async function totals(wave: Wave): Promise<NoahTrialCounts> {
    const row = await prepare(TRIAL_TOTALS, wave, wave, wave, wave).first<TotalsRow>();
    // 数は前の段を越えない（依頼は接続から、成果は依頼から）。表を直に書かれた時も、判定が投げないように、前の段の数で切る。
    const pressed = row?.pressed ?? 0, connected = Math.min(row?.connected ?? 0, pressed), firstResult = Math.min(row?.first_result ?? 0, connected);
    return { pressed, connected, firstResult, returned: Math.min(row?.returned ?? 0, firstResult) };
  }

  /** 運営の画面: 段ごとの 4 つの数と判定、今の段、経路ごとの数（5 人以上）、カードごとの報告の合計（5 人以上）、札の一覧（人数は出さない）。 */
  async function state() {
    const waves: NoahTrialWaveState[] = [];
    for (const item of NOAH_TRIAL.waves) {
      const counts = await totals(item.wave), gate = noahTrialGate(item.wave, counts);
      waves.push({ wave: item.wave, people: item.people, counts, done: gate.done, rates: gate.rates,
        text: gate.done ? [NOAH_TRIAL_TEXT.done(item.wave)] : gate.failing.map((reason) => NOAH_TRIAL_TEXT.failing(reason, counts.firstResult, item.people)) });
    }
    const current = waves.find((wave) => !wave.done)?.wave ?? 3;
    const funnel = (await prepare(TRIAL_FUNNEL).all<{ via: string; entered: number; connected: number; first_result: number }>()).results
      .map((row) => ({ via: row.via, entered: row.entered, connected: row.connected, firstResult: row.first_result }));
    const earn = (await prepare(TRIAL_EARN).all<EarnRow>()).results.map(earnOf);
    return { current, waves, funnel, earn, channels: await channels() };
  }

  /** そのカードで、本人が報告を入れられるか（試行に入っていて、「稼ぐ・仕事を省く」の棚の、確かめたカードで、その道具を動かして成果が返った）。 */
  async function eligible(owner: string, packageId: string) {
    const card = await prepare('SELECT shelf,status FROM noah_packages WHERE id=?', packageId).first<{ shelf: string; status: string }>();
    if (!card || card.shelf !== 'earn' || card.status === 'draft') return false;
    if (!(await entered(owner))) return false;
    return !!(await prepare(RAN_CARD, packageId, owner, owner).first());
  }
  /** カードの詳細の下: 5 人以上の報告の合計（誰にでも）と、本人の報告と、入れられるか。 */
  async function card(owner: string | null, packageId: string) {
    if (!(await prepare('SELECT 1 AS ok FROM noah_packages WHERE id=?', packageId).first())) throw new NoahAgentError('カードが見つかりません。', 404);
    const row = await prepare(TRIAL_EARN_ONE, packageId).first<EarnRow>();
    const mine = owner ? await prepare('SELECT listed,sold,net_yen,minutes,reported_at FROM noah_trial_reports WHERE owner_id=? AND package_id=?', owner, packageId).first<{ listed: number; sold: number; net_yen: number; minutes: number; reported_at: number }>() : null;
    return {
      summary: row ? earnOf(row).summary : null,
      eligible: owner ? await eligible(owner, packageId) : false,
      report: mine ? { listed: mine.listed === 1, sold: mine.sold, netYen: mine.net_yen, minutes: mine.minutes, reportedAt: mine.reported_at } satisfies NoahTrialReport : null,
    };
  }
  /** 本人の報告（同じ本人・同じカードは上書き）。4 つの数だけ。 */
  async function report(owner: string, packageId: string, input: Record<string, unknown>) {
    if (typeof input.listed !== 'boolean') throw new NoahAgentError('出品したかを選んでください。');
    const sold = whole(input.sold, '売れた件数', 999), netYen = whole(input.netYen, '手取り', 100_000_000), minutes = whole(input.minutes, '掛けた分', 100_000);
    if (!input.listed && sold > 0) throw new NoahAgentError('出品していない時は、売れた件数は 0 です。');
    if (sold === 0 && netYen > 0) throw new NoahAgentError('売れていない時は、手取りは 0 です。');
    if (!(await eligible(owner, packageId))) throw new NoahAgentError('このカードで成果まで行った、試行の参加者だけが報告できます。', 403);
    const at = now();
    await prepare(`INSERT INTO noah_trial_reports(owner_id,package_id,listed,sold,net_yen,minutes,reported_at) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(owner_id,package_id) DO UPDATE SET listed=excluded.listed,sold=excluded.sold,net_yen=excluded.net_yen,minutes=excluded.minutes,reported_at=excluded.reported_at`,
    owner, packageId, input.listed ? 1 : 0, sold, netYen, minutes, at).run();
    return { report: { listed: input.listed, sold, netYen, minutes, reportedAt: at } satisfies NoahTrialReport };
  }

  return { channels, addChannel, closeChannel, enter, entered, totals, state, card, report };
}
