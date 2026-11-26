import type { DirectoryEntry } from './noah-agent-directory.ts';
import { noahComposePins, NOAH_PIN_RANK, type NoahPinCandidate, type NoahPinSources } from './noah-pins.ts';
import type { IntakeDb } from './noah-intake-db.ts';

/** Use the existing pin policy on canonical project identities, not source popularity. */
export async function rankNoahDirectory(entries: DirectoryEntry[], db: IntakeDb, personal: string[]) {
  type Fact = { id: string; votes: number; hot: number; level: number; ran: number; fresh: number };
  const facts = new Map<string, Fact>();
  const ids = [...new Set(entries.flatMap(entry => entry.families))];
  for (let offset = 0; offset < ids.length; offset += 80) {
    const part = ids.slice(offset, offset + 80);
    const rows = await db.prepare(`SELECT f.id, COALESCE(s.votes,0) AS votes, COALESCE(s.hot,0) AS hot,
      f.level, COALESCE(f.l2_at,0) AS ran, COALESCE(k.l1_at,f.updated_at) + f.one_tap * ${NOAH_PIN_RANK.freshOneTapMs} AS fresh
      FROM noah_intake_families f LEFT JOIN noah_pin_stats s ON s.family_id=f.id
      LEFT JOIN noah_intake_checks k ON k.candidate_id=f.representative_id
      WHERE f.id IN (${part.map(() => '?').join(',')}) AND f.listed=1 AND f.withdrawn_at IS NULL AND f.hidden_at IS NULL`).bind(...part).all<Fact>();
    for (const row of rows.results) facts.set(row.id, row);
  }
  const key = (entry: DirectoryEntry) => entry.card.feedbackId ?? entry.card.id;
  const candidate = (entry: DirectoryEntry): NoahPinCandidate => ({id:key(entry),provider:entry.card.provider,topic:entry.card.topic});
  const byId = new Map(entries.map(entry => [key(entry), entry]));
  const family = new Map(entries.flatMap(entry => entry.families.map(id => [id, entry] as const)));
  const ranked = entries.map(entry => {
    const rows = entry.families.flatMap(id => facts.has(id) ? [facts.get(id)!] : []);
    const popular = rows.filter(row => row.votes > 0).sort((a,b) => b.hot-a.hot)[0];
    const ran = rows.filter(row => row.level === 2).sort((a,b) => b.ran-a.ran)[0];
    return {entry, pool:popular ? 'popular' : ran ? 'ran' : 'fresh', score:popular?.hot ?? ran?.ran ?? Math.max(entry.createdAt ?? entry.observedAt, ...rows.map(row => row.fresh))};
  }).sort((a,b) => b.score-a.score || key(a.entry).localeCompare(key(b.entry)));
  const of = (pool: string) => ranked.filter(row => row.pool===pool).map(row => candidate(row.entry));
  const sources: NoahPinSources = {
    personal: [...new Set(personal.flatMap(id => family.has(id) ? [key(family.get(id)!)] : []))].map(id => candidate(byId.get(id)!)),
    popular:of('popular'), ran:of('ran'), fresh:of('fresh'),
  };
  return noahComposePins(sources, entries.length, new Set(), 20).map(item => byId.get(item.id)!);
}
