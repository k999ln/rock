/** Research evidence is deliberately independent of launch manifests and user grants. */
export type VerifiedAgent = {
  id: string; familyId: string; name: string; publisher: string; category: string;
  summary: string; url: string; sources: string[]; status: string; added: boolean;
  connection: 'not_tested'; launchAllowed: false; protocol: string | null;
  requirements: string[];
};
export type AgentReview = {
  key: string; name: string; source: string; url: string; decision: string;
  reason: string; method: string; familyId: string | null;
};
export type VerifiedRegistry = {
  schema: 'noah.verified-agent-catalog/1'; revision: string; asOf: string;
  summary: { families: number; categories: number; added: number; reviewed: number;
    unresolved: number; byDecision: Record<string, number>; individuallyReviewed: number;
    automatedTriage: number; noahConnectionTests: number };
  products: VerifiedAgent[]; reviews: AgentReview[];
};

export function createVerifiedRegistryApi(registry: VerifiedRegistry) {
  return (request: Request) => {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ETag: '"' + registry.revision + '"' };
    if (request.method !== 'GET') return Response.json({ error: '閲覧専用です。' }, { status: 405, headers: { ...headers, Allow: 'GET' } });
    if (request.headers.get('If-None-Match') === headers.ETag) return new Response(null, { status: 304, headers });
    // Never return an execution URL, manifest, owner credential, or inferred grant.
    return Response.json(registry, { headers });
  };
}
