import { env } from 'cloudflare:workers';
import { database, requestUser } from './fund-store';
import { createNoahFeedbackApi } from './noah-feedback';
import { noahResearchCatalog } from './noah-research-catalog';
import { recipeFor } from './noah-execution-contract.mjs';
import { createNoahLaunchService } from './noah-launch';
import { noahReleaseDependencies } from './noah-release-server';
export function noahFeedbackApi() {
  let published: Promise<string[]> | undefined;
  return createNoahFeedbackApi({
    db: database(),
    authenticate: requestUser,
    operators: (
      (env as unknown as { NOAH_FEEDBACK_OPERATOR_USER_IDS?: string })
        .NOAH_FEEDBACK_OPERATOR_USER_IDS ?? ''
    )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    agentName: (id) =>
      noahResearchCatalog.get(id)?.entry.name ??
      recipeFor(id)?.name ??
      '公開Agent',
    publicAgent: async (id) => {
      const entry = noahResearchCatalog.get(id)?.entry;
      if (entry) return entry.kind === 'agent' || entry.kind === 'candidate';
      if (recipeFor(id)) return true;
      if (!/^release-[a-f0-9]{64}$/.test(id)) return false;
      published ??= createNoahLaunchService(noahReleaseDependencies())
        .catalog()
        .then((rows) => rows.map((r) => r.id));
      return (await published).includes(id);
    },
  });
}
