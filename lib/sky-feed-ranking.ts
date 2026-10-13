import type { Automation } from './catalog';

export type SkyFeedMode = 'recommended' | 'library';

export type SkyFeedSignals = {
  savedAt?: Readonly<Record<string, number>>;
  connectedAt?: Readonly<Record<string, number>>;
  availableToolIds?: ReadonlySet<string>;
  routedToolId?: string;
  now?: number;
};

export type RankedSkyTool = {
  tool: Automation;
  score: number;
  reasonCode:
    | 'current-request'
    | 'saved'
    | 'connected'
    | 'available'
    | 'curated'
    | 'candidate';
  reason: string;
};

export const SKY_FEED_WEIGHTS = Object.freeze({
  routedRequest: 60,
  saved: 34,
  connected: 26,
  available: 18,
  dedicatedFlow: 10,
  curated: 8,
  candidate: -6,
  pending: -24,
  consecutiveCategory: -9,
  repeatedCategory: -5,
});

const DAY_MS = 24 * 60 * 60 * 1000;
const curatedToolIds = new Set([
  'rockstar-amc',
  'rockstar-csv-cleanup',
  'rockstar-spider',
  'coconala',
  'mr-free-article',
  'mr-citations',
  'rockstar-patent-assistant',
  'fashion-brand-ops',
]);

function recentRelationshipBoost(timestamp: number | undefined, now: number) {
  if (!timestamp || timestamp > now + 30_000) return 0;
  const ageDays = Math.max(0, (now - timestamp) / DAY_MS);
  if (ageDays <= 1) return 10;
  if (ageDays <= 7) return 7;
  if (ageDays <= 30) return 4;
  return 1;
}

function relationshipTime(toolId: string, signals: SkyFeedSignals) {
  return Math.max(
    signals.savedAt?.[toolId] ?? 0,
    signals.connectedAt?.[toolId] ?? 0,
  );
}

function rankOne(
  tool: Automation,
  signals: SkyFeedSignals,
  now: number,
): RankedSkyTool {
  const saved = Boolean(signals.savedAt?.[tool.id]);
  const connected = Boolean(signals.connectedAt?.[tool.id]);
  const routed = signals.routedToolId === tool.id;
  const available = Boolean(signals.availableToolIds?.has(tool.id));
  let score = 0;

  if (routed) score += SKY_FEED_WEIGHTS.routedRequest;
  if (saved) score += SKY_FEED_WEIGHTS.saved;
  if (connected) score += SKY_FEED_WEIGHTS.connected;
  if (available) score += SKY_FEED_WEIGHTS.available;
  if (tool.launchPath || tool.runner) score += SKY_FEED_WEIGHTS.dedicatedFlow;
  if (curatedToolIds.has(tool.id)) score += SKY_FEED_WEIGHTS.curated;
  if (tool.status === 'candidate') score += SKY_FEED_WEIGHTS.candidate;
  if (tool.status === 'pending') score += SKY_FEED_WEIGHTS.pending;
  score += recentRelationshipBoost(relationshipTime(tool.id, signals), now);

  const [reasonCode, reason] = routed
    ? (['current-request', '今の依頼に関連'] as const)
    : saved
      ? (['saved', '保存したTool'] as const)
      : connected
        ? (['connected', '接続済み'] as const)
        : available
          ? (['available', '今使える'] as const)
          : curatedToolIds.has(tool.id)
            ? (['curated', 'Skyのおすすめ'] as const)
            : (['candidate', '新しい候補'] as const);

  return { tool, score, reasonCode, reason };
}

function diversify(items: readonly RankedSkyTool[]) {
  const remaining = [...items];
  const output: RankedSkyTool[] = [];
  const categoryCounts = new Map<string, number>();
  let previousCategory = '';

  while (remaining.length) {
    let winnerIndex = 0;
    let winnerScore = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < remaining.length; index += 1) {
      const item = remaining[index]!;
      const seen = categoryCounts.get(item.tool.category) ?? 0;
      const adjusted =
        item.score +
        seen * SKY_FEED_WEIGHTS.repeatedCategory +
        (item.tool.category === previousCategory
          ? SKY_FEED_WEIGHTS.consecutiveCategory
          : 0);
      const winner = remaining[winnerIndex]!;
      if (
        adjusted > winnerScore ||
        (adjusted === winnerScore && item.tool.id < winner.tool.id)
      ) {
        winnerIndex = index;
        winnerScore = adjusted;
      }
    }
    const [selected] = remaining.splice(winnerIndex, 1);
    if (!selected) break;
    output.push({ ...selected, score: winnerScore });
    categoryCounts.set(
      selected.tool.category,
      (categoryCounts.get(selected.tool.category) ?? 0) + 1,
    );
    previousCategory = selected.tool.category;
  }
  return output;
}

/**
 * Ranks catalog metadata, live availability and owner-scoped Tool relationships.
 * Request text, prompts, result bodies, clicks and dwell time are deliberately not
 * accepted by this function. The caller may pass only an ephemeral routed Tool id.
 */
export function rankSkyFeed(
  tools: readonly Automation[],
  mode: SkyFeedMode,
  signals: SkyFeedSignals = {},
): RankedSkyTool[] {
  const now = signals.now ?? Date.now();
  const ranked = tools.map((tool) => rankOne(tool, signals, now));

  if (mode === 'library') {
    return ranked
      .filter(
        ({ tool }) =>
          Boolean(signals.savedAt?.[tool.id]) ||
          Boolean(signals.connectedAt?.[tool.id]),
      )
      .sort((a, b) => {
        const time =
          relationshipTime(b.tool.id, signals) -
          relationshipTime(a.tool.id, signals);
        return time || b.score - a.score || a.tool.id.localeCompare(b.tool.id);
      });
  }

  return diversify(
    ranked.sort(
      (a, b) => b.score - a.score || a.tool.id.localeCompare(b.tool.id),
    ),
  );
}
