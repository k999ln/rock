import type { NoahAgentCard } from './noah-agent-cards.ts';
import type { NoahCloudProfile } from './noah-cloud-contract.ts';
import type { NoahFirstJob } from './noah-first-jobs.ts';

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
export type NoahProjectDetail = { card: NoahAgentCard; connection: NoahProjectConnection; firstJob?: NoahFirstJob };
