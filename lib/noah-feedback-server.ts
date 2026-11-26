import { database, requestUser } from './fund-store';
import { createNoahFeedbackApi } from './noah-feedback';
import { noahResearchCatalog } from './noah-research-catalog';
import { recipeFor } from './noah-execution-contract.mjs';
import { createNoahLaunchService } from './noah-launch';
import { noahReleaseDependencies } from './noah-release-server';
import { findNoahAgentEntry, noahAgentDirectory } from './noah-agent-directory-server';
import type { DirectoryEntry } from './noah-agent-directory';
export function noahFeedbackApi(request?: Request) {
  const single = request?.method === 'GET' ? new URL(request.url).searchParams.get('ids') : null;
  const lookups = new Map<string, Promise<DirectoryEntry | undefined>>();
  let directory: Promise<DirectoryEntry[]> | undefined;
  const entryFor = async (id: string) => {
    if (!/^project-[a-f0-9]{64}$/.test(id)) return undefined;
    if (single === id) {
      if (!lookups.has(id)) lookups.set(id, findNoahAgentEntry(id));
      return lookups.get(id);
    }
    directory ??= noahAgentDirectory();
    return (await directory).find(e=>e.card.feedbackId===id);
  };
  let published: Promise<string[]> | undefined;
  return createNoahFeedbackApi({
    db: database(),
    authenticate: requestUser,
    users: async (id) => {
      const entry=await entryFor(id);
      if (!entry) return undefined;
      if (!entry.families.length) return 0;
      const row=await database().prepare(`SELECT COUNT(DISTINCT c.owner_id) AS n FROM noah_connections c WHERE c.family_key IN (SELECT value FROM json_each(?)) AND EXISTS (SELECT 1 FROM noah_asks a WHERE a.owner_id=c.owner_id AND a.connection_id=c.id AND a.state='succeeded')`).bind(JSON.stringify(entry.families)).first<{n:number}>();
      return Number(row?.n??0);
    },
    agentName: async (id) =>
      (await entryFor(id))?.card.name ?? noahResearchCatalog.get(id)?.entry.name ??
      recipeFor(id)?.name ??
      '公開Agent',
    publicAgent: async (id) => {
      if (id.startsWith('project-')) return !!await entryFor(id);
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
