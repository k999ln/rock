import catalog from '../data/noah-tool-summary-ja.json' with { type: 'json' };
import type { NoahStep } from './noah-steps.ts';

/**
 * 掲載中の Agent の、道具の説明（提供者の英語の最初の 1 文）の日本語の 1 行（同梱の写し。data/noah-tool-summary-ja.json）。
 *
 * 「こんな事を頼めます」に出す最初の 4 つの道具の分を、写しごとに持つ。今の道具の説明と 1 字でも違えば使わない（英語のまま出す）。
 * 提供者の元の文は、工程の note のまま残す（spec-74。詳細の下の「操作の流れと道具」に、元の文が出る）。サーバーだけで読む。
 */
type Entry = { summary: string; ja: string };
const SERIES = (catalog as { schema: string; series: Record<string, Record<string, Entry[]>> }).series;

export function noahBundledToolSummaryJa(seriesId: string, tool: string, summary: string): string | null {
  const tools = Object.hasOwn(SERIES, seriesId) ? SERIES[seriesId] : null;
  const entries = tools && Object.hasOwn(tools, tool) ? tools[tool] : null;
  return entries?.find((entry) => entry.summary === summary)?.ja ?? null;
}

/** 道具の工程（id が tool: で始まり、label が道具の名前、note が提供者の説明）に、日本語の 1 行（noteJa）を足す。形はそのまま。 */
export function noahWithToolNotesJa<T extends { steps: readonly NoahStep[] }>(explanation: T, seriesId: string): T {
  let changed = false;
  const steps = explanation.steps.map((step) => {
    if (!step.id.startsWith('tool:') || !step.note || step.noteJa) return step;
    const ja = noahBundledToolSummaryJa(seriesId, step.label, step.note);
    if (!ja) return step;
    changed = true;
    return { ...step, noteJa: ja };
  });
  return changed ? { ...explanation, steps } : explanation;
}
