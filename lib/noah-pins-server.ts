import { noahAgentDirectory } from './noah-agent-directory-server';
import type { DirectoryEntry } from './noah-agent-directory';
import { env, waitUntil } from 'cloudflare:workers';
import { database, requestUser } from './fund-store';
import { parseNoahFlags } from './noah-flags';
/** ピンタレスト風の一覧の入口の依存（task 115）。見せてよいかは、取り込んだ一覧と同じ切り替え（NOAH_INTAKE_PUBLIC）と審査者。 */
export function noahPinsDependencies() {
  const config = env as unknown as Record<string, string | undefined>;
  let directory: Promise<DirectoryEntry[]> | undefined;
  return { decoratePins: async (items: import('./noah-boards-store').NoahPin[]) => {
    directory ??= noahAgentDirectory();
    const entries=await directory;
    return items.map(item=>{const entry=entries.find(e=>e.families.includes(item.id));return entry?{...item,feedbackId:entry.card.feedbackId,sources:entry.card.sources}:item;});
  }, db: database(), authenticate: requestUser, now: Date.now, waitUntil,
    reviewers: (config.NOAH_REVIEWER_USER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean),
    flags: parseNoahFlags(config) };
}
