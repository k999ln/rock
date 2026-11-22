/** Browser/server shared request boundaries. Never silently drop a family member. */
export const NOAH_INTAKE_IMPORT_LIMITS = { families: 60, candidates: 240, bytes: 1_048_576 } as const;
type ImportRows = { schema: string; exportedAt: number; families: Record<string, unknown>[]; candidates: Record<string, unknown>[]; checks: Record<string, unknown>[] };
export function splitNoahIntakeImport<T extends ImportRows>(all: T): T[] {
  const members = new Map<unknown, Record<string, unknown>[]>();
  for (const candidate of all.candidates) {
    const rows = members.get(candidate.family_id) ?? [];
    rows.push(candidate); members.set(candidate.family_id, rows);
  }
  const checks = new Map(all.checks.map(row => [row.candidate_id, row]));
  const empty = (): T => ({ ...all, families: [], candidates: [], checks: [] });
  const fits = (part: T) => part.families.length <= NOAH_INTAKE_IMPORT_LIMITS.families && part.candidates.length <= NOAH_INTAKE_IMPORT_LIMITS.candidates && new TextEncoder().encode(JSON.stringify(part)).byteLength <= NOAH_INTAKE_IMPORT_LIMITS.bytes;
  const parts: T[] = [];
  let current = empty();
  for (const family of all.families) {
    const candidates = members.get(family.id) ?? [];
    const rows = candidates.flatMap(candidate => { const check = checks.get(candidate.id); return check ? [check] : []; });
    const single = { ...empty(), families: [family], candidates, checks: rows };
    if (!fits(single)) throw Error('1つの系列が取り込み上限を超えています。系列を確認してください。');
    const next = { ...current, families: [...current.families, family], candidates: [...current.candidates, ...candidates], checks: [...current.checks, ...rows] };
    if (fits(next)) current = next;
    else { parts.push(current); current = single; }
  }
  if (current.families.length) parts.push(current);
  return parts;
}
