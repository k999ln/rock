import catalog from '../data/noah-summary-ja.json' with { type: 'json' };

/**
 * 掲載中の Agent の、英語の説明の日本語の 1 行（同梱の写し。data/noah-summary-ja.json）。
 *
 * 本番の取り込みが自動の日本語の 1 行（noah_intake_candidates.summary_ja）を書くまでの間に、カード・詳細・検索で使う。
 * 写しを書いた時の英語の説明を一緒に持ち、今の英語の説明と 1 字でも違えば使わない（英語のまま出す）。
 * 取り込みが書いた summary_ja がある時は、そちらを使う。
 */
type Entry = { summary: string; ja: string };
const SERIES = (catalog as { schema: string; series: Record<string, Entry> }).series;

export function noahBundledSummaryJa(id: string, summary: string): string | null {
  const entry = Object.hasOwn(SERIES, id) ? SERIES[id] : null;
  return entry && entry.summary === summary ? entry.ja : null;
}

/** summaryJa が無い時だけ、同梱の写しで補う（形はそのまま）。 */
export function noahWithSummaryJa<T extends { id: string; summary: string; summaryJa?: string | null }>(item: T): T {
  if (item.summaryJa) return item;
  const ja = noahBundledSummaryJa(item.id, item.summary);
  return ja ? { ...item, summaryJa: ja } : item;
}
