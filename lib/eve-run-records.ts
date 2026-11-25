/**
 * 画面に出す回の記録（task 130、2026-11-25）。本人の中身（広告リンク・売上の CSV）が入っていない回だけを、ここに足す。
 * 本人の中身が入る回の記録は data/eve-runs/private/ に置き、Git に入れない（このリポジトリは公開）。
 */

import type { EveRun } from './eve-combination-run.ts';
import a8First from '../data/eve-runs/a8-20261125.json' with { type: 'json' };

const RUNS: readonly { path: string; run: EveRun }[] = [{ path: 'data/eve-runs/a8-20261125.json', run: a8First as unknown as EveRun }];

/** その組み合わせ（版）の、一番新しい回。 */
export function eveLatestRun(combinationId: string, version: number): { path: string; run: EveRun } | null {
  return [...RUNS].filter((r) => r.run.combinationId === combinationId && r.run.version === version).sort((a, b) => b.run.startedAt.localeCompare(a.run.startedAt))[0] ?? null;
}
