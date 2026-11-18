export const noahRuntimePreferences = ['any', 'headless', 'local-model', 'codex'] as const;
export type NoahRuntimePreference = typeof noahRuntimePreferences[number];
export type NoahRecommendationSettings = { revision: number; historyEnabled: boolean; historySince: number; runtime: NoahRuntimePreference };
export type NoahRecommendationContext = {
  enabled: boolean; fingerprint: string; interests: string[]; followed: string[]; hidden: string[];
  historyTags: string[]; runtime: NoahRuntimePreference;
};
export const normalizeRecommendationTag = (value: string) => value.trim().normalize('NFKC').toLowerCase();
export function scoreNoahRecommendation(input: { id: string; author: string; tags: string[]; runtime?: 'local-model' | 'codex' | 'headless' }, context: NoahRecommendationContext) {
  if (!context.enabled) return { score: 0, reason: '' };
  const tags = input.tags.map(normalizeRecommendationTag);
  const followed = context.followed.includes(input.author), interest = tags.some(t => context.interests.includes(t)), history = tags.some(t => context.historyTags.includes(t));
  const compatible = context.runtime !== 'any' && Boolean(input.runtime) && (context.runtime === 'headless' || context.runtime === input.runtime);
  return { score: Number(followed) * 40 + Number(interest) * 20 + Number(history) * 10 + Number(compatible) * 5,
    reason: [followed && 'フォロー中の提供元', interest && '選んだ興味に関連', history && '同意後に利用したAgentの公開タグに関連', compatible && (context.runtime === 'codex' ? '本人のCodexを使う実行方法に対応' : context.runtime === 'local-model' ? 'Macのローカルモデルを使う実行方法に対応' : 'Macで画面を使わない実行方法に対応')].filter(Boolean).join('・') };
}
