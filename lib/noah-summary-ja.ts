import catalog from '../data/noah-summary-ja.json' with { type: 'json' };
import projectCatalog from '../data/noah-project-summary-ja.json' with { type: 'json' };

/**
 * 掲載中の Agent の、英語の説明の日本語の 1 行（同梱の写し。data/noah-summary-ja.json）。
 *
 * 本番の取り込みが自動の日本語の 1 行（noah_intake_candidates.summary_ja）を書くまでの間に、カード・詳細・検索で使う。
 * 写しを書いた時の英語の説明を一緒に持ち、今の英語の説明と 1 字でも違えば使わない（英語のまま出す）。
 * 取り込みが書いた summary_ja がある時は、そちらを使う。
 * 見つかった物（id が project- で始まるカード。GitHub・Hugging Face・npm など）は、別の写し（data/noah-project-summary-ja.json。
 * 2026-11-28 の本番のホームの最初の 400 枚の分）から引く。決まりは同じ（説明が 1 字でも違えば英語などの元のまま）。
 */
type Entry = { summary: string; ja: string };
const SERIES = (catalog as { schema: string; series: Record<string, Entry> }).series;
const PROJECTS = (projectCatalog as { schema: string; projects: Record<string, Entry> }).projects;

export function noahBundledSummaryJa(id: string, summary: string): string | null {
  const table = id.startsWith('project-') ? PROJECTS : SERIES;
  const entry = Object.hasOwn(table, id) ? table[id] : null;
  return entry && entry.summary === summary ? entry.ja : null;
}

/** summaryJa が無い時だけ、同梱の写しで補う（形はそのまま）。 */
export function noahWithSummaryJa<T extends { id: string; summary: string; summaryJa?: string | null }>(item: T): T {
  if (item.summaryJa) return item;
  const ja = noahBundledSummaryJa(item.id, item.summary);
  return ja ? { ...item, summaryJa: ja } : item;
}
