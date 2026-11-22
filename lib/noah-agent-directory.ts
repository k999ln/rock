import { collectionUrl, NOAH_COLLECTION_SOURCES, noahCollectionBlocked, noahCollectionCards, parseCollectionSnapshot } from './noah-collection.ts';
import { sha256Hex } from './noah-connect-requirements.ts';
import { noahPinShape, noahPinTopic } from './noah-pins.ts';
import type { NoahAgentCard, NoahAgentSource } from './noah-agent-cards.ts';
import type { IntakeDb } from './noah-intake-db.ts';
import { noahSearchMatcher, noahSearchTerms } from './noah-search-terms.ts';

type Family = { id: string; name: string; summary: string; external_key: string; repository: string | null; record_json: string; connect_json: string | null };
export type DirectoryEntry = { firstParty?: 'business-training'; card: NoahAgentCard; families: string[]; observedAt: number; createdAt?: number; hot?: number };
export type DirectoryDependencies = { db: IntakeDb; bucket?: Pick<R2Bucket, 'get'>; listed: boolean; now?: () => number };
// Exact project URLs only: a shared host or a similar name never establishes identity.
export function noahProjectUrl(value: unknown): string | null {
  try {
    const url = new URL(collectionUrl(value));
    if (url.hostname === 'github.com') url.pathname = url.pathname.replace(/\.git\/?$/, '').replace(/\/$/, '').toLowerCase();
    return url.href;
  } catch { return null; }
}
export async function noahCardIdentity(url: string | null, familyId: string) {
  return `project-${await sha256Hex(url ?? `family:${familyId}`)}`;
}
export function noahFamilyUrl(row: Pick<Family, 'repository' | 'record_json' | 'connect_json'>): string | null {
  try {
    const record = JSON.parse(row.record_json), connect = row.connect_json ? JSON.parse(row.connect_json) : null;
    return noahProjectUrl(record.repository?.url || row.repository || record.websiteUrl || connect?.target?.url);
  } catch { return null; }
}
export async function readNoahDirectory(deps: DirectoryDependencies): Promise<DirectoryEntry[]> {
  const now = (deps.now ?? Date.now)();
  const [rows, snapshots] = await Promise.all([
    deps.listed ? deps.db.prepare(`SELECT f.id,c.name,c.summary,c.external_key,c.repository,c.record_json,k.connect_json
      FROM noah_intake_families f JOIN noah_intake_candidates c ON c.id=f.representative_id
      LEFT JOIN noah_intake_checks k ON k.candidate_id=f.representative_id
      WHERE f.listed=1 AND f.withdrawn_at IS NULL AND f.hidden_at IS NULL ORDER BY f.id`).all<Family>() : Promise.resolve({ results: [] as Family[] }),
    Promise.all(NOAH_COLLECTION_SOURCES.map(async source => {
      const object = await deps.bucket?.get(`noah/collection/v1/${source}.json`);
      if (!object) return null;
      try { return parseCollectionSnapshot(await object.json(), now); } catch { return null; }
    })),
  ]);
  const entries = new Map<string, DirectoryEntry>();
  const base = (id: string, name: string, summary: string, provider: string, url: string | null): NoahAgentCard => ({ id, name, summary, provider,
    host: url ? new URL(url).hostname : null, users: 0, oneTap: false, savedIn: [], topic: noahPinTopic(name, summary), shape: noahPinShape(id) });
  for (const row of rows.results) {
    const url = noahFamilyUrl(row), feedbackId = await noahCardIdentity(url, row.id);
    const existing = entries.get(feedbackId);
    if (existing) { existing.families.push(row.id); continue; }
    entries.set(feedbackId, { families: [row.id], observedAt: 0, card: { ...base(row.id, row.name, row.summary, row.external_key.split('/')[0], url), feedbackId } });
  }
  const listedIds = new Set(rows.results.map(row => row.id));
  const records = snapshots.flatMap(snapshot => snapshot?.items ?? [])
    .filter(item => item.expiresAt > now && !noahCollectionBlocked(item))
    .map(item => ({ ...item, url: noahProjectUrl(item.url) ?? item.url,
      run: item.run === 'phone' && !listedIds.has(item.familyId ?? '') ? undefined : item.run }));
  for (const item of noahCollectionCards(records)) {
    const url = item.url;
    const feedbackId = await noahCardIdentity(url, item.id);
    const entry: DirectoryEntry = entries.get(feedbackId) ?? { families: [], observedAt: item.observedAt,
      card: { ...base(feedbackId, item.name, item.summary, item.author, url), feedbackId, href: url, external: true } };
    const seen = new Set<string>();
    entry.card.sources = item.sources.filter((source: NoahAgentSource) => {
      if (seen.has(source.sourceUrl)) return false;
      seen.add(source.sourceUrl);
      return true;
    });
    entry.card.run = item.run;
    if (item.run === 'phone' && item.familyId && !entry.families.length) {
      entry.families.push(item.familyId);
      entry.card.id = item.familyId;
      entry.card.href = undefined;
      entry.card.external = false;
    }
    entry.observedAt = Math.max(...item.sources.map(source => source.observedAt));
    entry.createdAt = item.createdAt;
    entry.hot = item.hot;
    entries.set(feedbackId, entry);
  }
  return [...entries.values()];
}
export function selectNoahDirectory(entries: DirectoryEntry[], source: string, query: string, order: 'hot' | 'new' = 'hot') {
  // 語ごとに当てる。日本語の語は英語の語幹にも広げる（一覧の説明は、ほとんど英語）。lib/noah-search-terms.ts
  const groups = noahSearchTerms(query), matches = noahSearchMatcher(groups), searching = groups.some(group => group.length);
  return entries.filter(entry => (!source || source === 'noah' ? !source || entry.families.length > 0 || !!entry.firstParty : source === 'discovered' ? !!entry.card.sources?.length : entry.card.sources?.some(s => s.source === source))
    && (!searching || matches(`${entry.card.name} ${entry.card.summary} ${entry.card.provider}`.toLowerCase())))
    .sort((a,b) => {
      const rank = source === 'noah' ? b.observedAt-a.observedAt : order === 'new'
        ? (b.createdAt ?? 0)-(a.createdAt ?? 0)
        : (b.hot ?? -Infinity)-(a.hot ?? -Infinity);
      return rank || a.card.id.localeCompare(b.card.id);
    });
}
