import { collectionUrl, NOAH_COLLECTION_SOURCES, parseCollectionSnapshot, type NoahCollectionItem } from './noah-collection.ts';
import { sha256Hex } from './noah-connect-requirements.ts';
import { noahPinShape, noahPinTopic } from './noah-pins.ts';
import type { NoahAgentCard, NoahAgentSource } from './noah-agent-cards.ts';
import type { IntakeDb } from './noah-intake-db.ts';

type Family = { id: string; name: string; summary: string; external_key: string; repository: string | null; record_json: string; connect_json: string | null };
export type DirectoryEntry = { card: NoahAgentCard; families: string[]; observedAt: number };
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
      return object ? parseCollectionSnapshot(await object.json(), now) : null;
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
  const records: NoahCollectionItem[] = snapshots.flatMap(snapshot => snapshot?.items ?? []).filter(item => item.expiresAt > now);
  records.sort((a,b) => b.observedAt-a.observedAt || a.id.localeCompare(b.id));
  for (const item of records) {
    const url = noahProjectUrl(item.url)!;
    const feedbackId = await noahCardIdentity(url, item.id);
    const entry = entries.get(feedbackId) ?? { families: [], observedAt: item.observedAt,
      card: { ...base(feedbackId, item.name, item.summary, item.author, url), feedbackId, href: url, external: true } };
    const source: NoahAgentSource = { source: item.source, sourceUrl: item.sourceUrl, author: item.author, metrics: item.metrics, observedAt: item.observedAt };
    if (!entry.card.sources?.some(s => s.sourceUrl === source.sourceUrl)) entry.card.sources = [...(entry.card.sources ?? []), source];
    entry.observedAt = Math.max(entry.observedAt, item.observedAt);
    entries.set(feedbackId, entry);
  }
  return [...entries.values()];
}
export function selectNoahDirectory(entries: DirectoryEntry[], source: string, query: string) {
  const q = query.trim().toLowerCase();
  return entries.filter(entry => (!source || source === 'noah' ? !source || entry.families.length > 0 : source === 'discovered' ? !!entry.card.sources?.length : entry.card.sources?.some(s => s.source === source))
    && (!q || `${entry.card.name} ${entry.card.summary} ${entry.card.provider}`.toLowerCase().includes(q)))
    .sort((a,b) => b.observedAt-a.observedAt || a.card.id.localeCompare(b.card.id));
}
