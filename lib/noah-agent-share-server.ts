import { noahIntakeDependencies } from './noah-intake-server';
import { createIntakeStore } from './noah-intake-store';
import { loadNoahShareAgent, noahShareId } from './noah-agent-share';
import { noahBundledSummaryJa } from './noah-summary-ja';

// 共有のカード（og・twitter・share-image）の説明は、日本語の 1 行があればそれを使う（同梱の写しは、サーバーだけで読む）。
export async function publicNoahShareAgent(id: unknown) {
  if (!noahShareId(id)) return null;
  try {
    const deps = noahIntakeDependencies();
    return await loadNoahShareAgent(id, { publicListing: deps.flags.intakePublic, detail: createIntakeStore(deps).detail, summaryJa: noahBundledSummaryJa });
  } catch { return null; }
}
