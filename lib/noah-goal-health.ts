/**
 * 目的型の Agent「体調ノート」（ヘルスケア。無料）。docs/noah/spec-goal-health.md。
 * 本人の許可（2026-11-27）「目的型（ヘルスケア）の Agent を無料で 1 つ作って、出してよい」。目的・窓口・名前は、本人の答えが来るまで既定
 * （「毎朝の体調を記録して、週末に振り返る」、Noah の画面だけ）。
 *
 * 目的: 4 週間（28 日分）、毎朝の体調を記録して、週ごとに振り返る。28 日分そろったら完成。
 * 記録は、この端末のブラウザにだけ置く（Noah へは送らない。外へも送らない）。病気の判断・薬の指示はしない（ここにある式は、平均と多い少ないだけ）。
 * 日付は、本人の端末の暦の日（YYYY-MM-DD）。週は月曜から日曜。
 */

export const NOAH_GOAL_HEALTH_SCHEMA = 'noah-goal-health/1';
export const NOAH_GOAL_HEALTH_STORAGE_KEY = 'noah-goal-health/v1';
/** 目的の日数（4 週間）。これだけ記録がそろったら完成。 */
export const NOAH_GOAL_HEALTH_TARGET_DAYS = 28;
export const NOAH_GOAL_HEALTH_NOTE_MAX = 140;
export const NOAH_GOAL_HEALTH_NOTICE = '記録と振り返りの道具です。病気の判断や薬の指示はしません。気になる症状がある時は、医師や薬剤師に相談してください。急に強い症状が出た時は、すぐに医療機関に連絡してください。記録はこの端末のブラウザにだけ保存し、Noahには送りません。';

export const NOAH_GOAL_HEALTH_ITEMS = [
  { key: 'sleep', question: 'よく眠れましたか', low: '眠れなかった', high: 'よく眠れた' },
  { key: 'body', question: '体の調子はどうですか', low: 'つらい', high: 'とても良い' },
  { key: 'mood', question: '気分はどうですか', low: '沈んでいる', high: 'とても良い' },
] as const;
export type NoahGoalHealthItem = (typeof NOAH_GOAL_HEALTH_ITEMS)[number]['key'];
export type NoahGoalHealthEntry = Record<NoahGoalHealthItem, number> & { note: string };
export type NoahGoalHealthLog = { schema: typeof NOAH_GOAL_HEALTH_SCHEMA; started: string; entries: Record<string, NoahGoalHealthEntry> };

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ITEM_KEYS = NOAH_GOAL_HEALTH_ITEMS.map((item) => item.key);

/** 暦の日として正しい YYYY-MM-DD か。 */
export function noahGoalHealthDate(value: unknown): value is string {
  const match = typeof value === 'string' ? DATE.exec(value) : null;
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}

/** 端末の暦の今日（YYYY-MM-DD）。 */
export function noahGoalHealthToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function shift(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const moved = new Date(Date.UTC(y, m - 1, d + days));
  return moved.toISOString().slice(0, 10);
}

/** その日を含む週の月曜（YYYY-MM-DD）。 */
export function noahGoalHealthWeek(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = 日曜
  return shift(date, -((weekday + 6) % 7));
}

export function noahGoalHealthEmpty(today: string): NoahGoalHealthLog {
  return { schema: NOAH_GOAL_HEALTH_SCHEMA, started: today, entries: {} };
}

function validEntry(value: unknown): value is NoahGoalHealthEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return ITEM_KEYS.every((key) => Number.isInteger(entry[key]) && (entry[key] as number) >= 1 && (entry[key] as number) <= 5)
    && typeof entry.note === 'string' && entry.note.length <= NOAH_GOAL_HEALTH_NOTE_MAX;
}

/** 保存してあった文字を読む。壊れていたら、空の記録（読めた日だけ残す。推量で直さない）。 */
export function noahGoalHealthParse(text: string | null, today: string): NoahGoalHealthLog {
  try {
    const value = JSON.parse(text ?? '') as Partial<NoahGoalHealthLog>;
    if (value?.schema !== NOAH_GOAL_HEALTH_SCHEMA || !noahGoalHealthDate(value.started) || !value.entries || typeof value.entries !== 'object') return noahGoalHealthEmpty(today);
    const entries: Record<string, NoahGoalHealthEntry> = {};
    for (const [date, entry] of Object.entries(value.entries)) {
      if (noahGoalHealthDate(date) && validEntry(entry)) entries[date] = { sleep: entry.sleep, body: entry.body, mood: entry.mood, note: entry.note };
    }
    return { schema: NOAH_GOAL_HEALTH_SCHEMA, started: value.started, entries };
  } catch {
    return noahGoalHealthEmpty(today);
  }
}

/** その日の記録を入れる（同じ日は書き換える）。数は 1〜5、メモは 140 字まで（前後の空白は除く）。 */
export function noahGoalHealthRecord(log: NoahGoalHealthLog, date: string, entry: NoahGoalHealthEntry): NoahGoalHealthLog {
  const clean = { sleep: entry.sleep, body: entry.body, mood: entry.mood, note: entry.note.trim() };
  if (!noahGoalHealthDate(date) || !validEntry(clean)) throw new Error('記録の形を確かめてください。');
  return { ...log, entries: { ...log.entries, [date]: clean } };
}

export type NoahGoalHealthWeekSummary = { days: number; averages: Record<NoahGoalHealthItem, number> | null };
function summary(log: NoahGoalHealthLog, monday: string): NoahGoalHealthWeekSummary {
  const dates = Array.from({ length: 7 }, (_, i) => shift(monday, i)).filter((date) => log.entries[date]);
  if (!dates.length) return { days: 0, averages: null };
  const average = (key: NoahGoalHealthItem) => Math.round((dates.reduce((sum, date) => sum + log.entries[date][key], 0) / dates.length) * 10) / 10;
  return { days: dates.length, averages: { sleep: average('sleep'), body: average('body'), mood: average('mood') } };
}

export type NoahGoalHealthReview = {
  week: string; days: number;
  averages: Record<NoahGoalHealthItem, number> | null;
  previous: Record<NoahGoalHealthItem, number> | null;
  change: Record<NoahGoalHealthItem, 'up' | 'down' | 'same'> | null;
  best: string | null; hardest: string | null;
  notes: { date: string; note: string }[];
};

/** その日を含む週の振り返り（平均・先週との違い・合計がいちばん高い日と低い日・メモ）。助言は出さない。 */
export function noahGoalHealthReview(log: NoahGoalHealthLog, today: string): NoahGoalHealthReview {
  const week = noahGoalHealthWeek(today);
  const now = summary(log, week), before = summary(log, shift(week, -7));
  const dates = Array.from({ length: 7 }, (_, i) => shift(week, i)).filter((date) => log.entries[date]);
  const total = (date: string) => log.entries[date].sleep + log.entries[date].body + log.entries[date].mood;
  const sorted = [...dates].sort((a, b) => total(b) - total(a) || a.localeCompare(b));
  const change = now.averages && before.averages
    ? Object.fromEntries(ITEM_KEYS.map((key) => [key, now.averages![key] > before.averages![key] ? 'up' : now.averages![key] < before.averages![key] ? 'down' : 'same'])) as Record<NoahGoalHealthItem, 'up' | 'down' | 'same'>
    : null;
  return {
    week, days: now.days, averages: now.averages, previous: before.averages, change,
    best: dates.length >= 2 ? sorted[0] : null,
    hardest: dates.length >= 2 && total(sorted.at(-1)!) < total(sorted[0]) ? sorted.at(-1)! : null,
    notes: dates.filter((date) => log.entries[date].note).map((date) => ({ date, note: log.entries[date].note })),
  };
}

/** 目的までの進み（記録した日の数）。28 日分で完成。 */
export function noahGoalHealthProgress(log: NoahGoalHealthLog): { days: number; target: number; done: boolean } {
  const days = Object.keys(log.entries).length;
  return { days, target: NOAH_GOAL_HEALTH_TARGET_DAYS, done: days >= NOAH_GOAL_HEALTH_TARGET_DAYS };
}
