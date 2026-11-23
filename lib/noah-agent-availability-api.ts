import { createNoahAvailabilityStore, presentNoahAvailability, type AvailabilityView } from './noah-agent-availability.ts';
export type VerifiedIdentity = { id: string; familyId: string; projectId: string; name: string; source: string; category: string };
export type NoahAvailabilityResponse = {
  asOf: number; refreshSeconds: 10; total: number; available: number; connected: number;
  items: (AvailabilityView & { id: string; familyId: string; href: string })[];
};
export function createNoahAvailabilityApi(deps: {
  store: ReturnType<typeof createNoahAvailabilityStore>;
  identities: () => Promise<VerifiedIdentity[]>;
  recheck?: () => Promise<void>; waitUntil?: (work: Promise<unknown>) => void; now?: () => number;
}) {
  return async (request: Request) => {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    if (request.method !== 'GET') return Response.json({ error: '閲覧専用です。' }, { status: 405, headers: { ...headers, Allow: 'GET' } });
    try {
      const at = (deps.now ?? Date.now)(), [identities, rows] = await Promise.all([deps.identities(), deps.store.all()]);
      const byId = new Map(rows.map(row => [row.project_id, row]));
      const items = identities.map(identity => ({ ...presentNoahAvailability(byId.get(identity.projectId), at),
        id: identity.id, familyId: identity.familyId, projectId: identity.projectId,
        href: `/noah/discover/agent?id=${encodeURIComponent(identity.projectId)}` }));
      // Bounded public metadata checks only. A browser refresh never executes an Agent task.
      if (deps.waitUntil && deps.recheck) deps.waitUntil(deps.recheck().catch(() => undefined));
      const result: NoahAvailabilityResponse = { asOf: at, refreshSeconds: 10, total: items.length,
        available: items.filter(row => row.status === 'available').length,
        connected: items.filter(row => row.status === 'connected').length, items };
      return Response.json(result, { headers });
    } catch { return Response.json({ error: '稼働状態を確認できません。少し待ってから再読み込みしてください。' }, { status: 503, headers }); }
  };
}
