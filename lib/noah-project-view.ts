import type { NoahAgentCard } from './noah-agent-cards.ts';
import type { NoahCloudProfile } from './noah-cloud-contract.ts';

export const noahProjectHref = (id: string) => `/noah/discover/agent?${new URLSearchParams({ id })}`;
/** Collected cards always open Noah, even while an older snapshot still carries an external href. */
export function noahCardHref(card: NoahAgentCard) {
  return card.sources?.length || card.external ? noahProjectHref(card.feedbackId ?? card.id) : card.href;
}
export type NoahProjectConnection =
  | { kind: 'ready'; familyId: string }
  | { kind: 'cloud'; profile: NoahCloudProfile; providerFamilyId: string | null }
  | { kind: 'space'; repository: string }
  | { kind: 'setup'; importHref: string | null };
export type NoahProjectDetail = { card: NoahAgentCard; connection: NoahProjectConnection };

export function eveNoahProjectHref(id: string) {
  return `/os/eve?${new URLSearchParams({ noahProject: id })}#eve-compose`;
}

/** Public links are reference material. The Work form still controls submission. */
export function noahProjectHandoffDraft({ card }: NoahProjectDetail) {
  const sources = (card.sources ?? []).filter(source => source.sourceUrl.length <= 700);
  const githubRelease = sources.find(source => source.source === 'github' && source.sourceUrl.includes('/releases/tag/'));
  const official = githubRelease ?? sources.find(source => ['github', 'huggingface', 'npm', 'docker', 'mcp-registry'].includes(source.source));
  const discovery = sources.find(source => ['x', 'reddit', 'bluesky', 'hackernews'].includes(source.source));
  const urls = [...new Set([official?.sourceUrl, discovery?.sourceUrl, sources[0]?.sourceUrl].filter(Boolean))].slice(0, 2);
  return [
    `Noahで見つけた「${card.name.slice(0, 200)}」を確認して、今の仕事に使えるパッケージ案を作ってください。`,
    ...urls.map(url => `出典：${url}`),
    '公式資料で用途・対応環境・必要なアカウント・費用を確かめ、発見から接続・試用・成果の受け取りまでの手順を整理してください。この依頼は調査と計画までです。',
  ].join('\n');
}
