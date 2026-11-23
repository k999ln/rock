import type { IntakeDb } from './noah-intake-db.ts';
import { sha256Hex } from './noah-connect-requirements.ts';
import type { ProviderPlan } from './noah-gradio.ts';

export const NOAH_AVAILABILITY_TTL = 24 * 60 * 60 * 1000;
export type AvailabilityObservation = { startedAt: number; leaseUntil?: number };
export type AvailabilityRow = {
  project_id: string; protocol: string; manifest_hash: string; endpoints_json: string;
  state: 'connected' | 'verified' | 'unavailable'; checked_at: number; success_at: number | null;
  success_digest: string | null; failure_at: number | null; next_check_at: number; lease_until: number; revision: number;
};
export type AvailabilityView = { projectId: string; status: 'unverified' | 'connected' | 'available' | 'unavailable' | 'stale';
  checkedAt: number | null; succeededAt: number | null; expiresAt: number | null; protocol: string | null };
const PROJECT = /^project-[a-f0-9]{64}$/;
export function noahProviderManifest(plan: ProviderPlan) {
  return sha256Hex(JSON.stringify([plan.repository, plan.protocol ?? 'gradio', plan.host, plan.prefix, plan.sourceRevision ?? null, plan.endpoints.map(endpoint => endpoint.digest).sort()]));
}
/** These endpoints were reviewed as the Agent's task entry, not a UI helper or status method. */
export function noahReviewedAgentEndpoint(repository: string, api: string) {
  const reviewed: Record<string, string> = {
    'ksufian/ai-car-assistant': 'respond',
    'jayeshmurthi49-byte/agentic-rag-chatbot-api': 'ask',
    'coding-it-forward-dc-transit/dc-metro-transit-assistant': 'respond',
    'samir72/multi-agent-research-paper-analysis-system': 'analyze_research',
    'jeganvnr1604/trailhaven-ai-assistant': 'respond',
  };
  return reviewed[repository.toLowerCase()] === api;
}
export function presentNoahAvailability(row: AvailabilityRow | undefined, now: number): AvailabilityView {
  if (!row) return { projectId: '', status: 'unverified', checkedAt: null, succeededAt: null, expiresAt: null, protocol: null };
  const expiresAt = Math.min(row.checked_at, row.state === 'verified' ? row.success_at ?? 0 : row.checked_at) + NOAH_AVAILABILITY_TTL;
  return { projectId: row.project_id, status: expiresAt <= now ? 'stale' : row.state === 'verified' ? 'available' : row.state === 'connected' ? 'connected' : 'unavailable',
    checkedAt: row.checked_at, succeededAt: row.success_at, expiresAt, protocol: row.protocol };
}

/** Only server-observed metadata and successful Work completion enter this table. No owner, input, output or token. */
export function createNoahAvailabilityStore(db: Pick<IntakeDb, 'prepare'>, now = Date.now) {
  const read = async (id: string) => db.prepare('SELECT * FROM noah_agent_availability WHERE project_id=?').bind(id).first<AvailabilityRow>();
  async function prepared(plan: ProviderPlan, observation: AvailabilityObservation = { startedAt: now() }) {
    if (!PROJECT.test(plan.projectId)) throw Error('invalid_project');
    const digests = plan.endpoints.map(endpoint => endpoint.digest).sort();
    const manifest = await noahProviderManifest(plan);
    const at = observation.startedAt;
    await db.prepare(`INSERT INTO noah_agent_availability(project_id,protocol,manifest_hash,endpoints_json,state,checked_at,next_check_at,revision)
      VALUES(?,?,?,?,'connected',?,?,1) ON CONFLICT(project_id) DO UPDATE SET
      protocol=excluded.protocol,manifest_hash=excluded.manifest_hash,endpoints_json=excluded.endpoints_json,
      state=CASE WHEN noah_agent_availability.state='verified' AND noah_agent_availability.manifest_hash=excluded.manifest_hash AND noah_agent_availability.success_at>? THEN 'verified' ELSE 'connected' END,
      success_digest=CASE WHEN noah_agent_availability.manifest_hash=excluded.manifest_hash THEN noah_agent_availability.success_digest ELSE NULL END,
      checked_at=excluded.checked_at,next_check_at=excluded.next_check_at,lease_until=0,revision=noah_agent_availability.revision+1
      WHERE excluded.checked_at>=noah_agent_availability.checked_at AND (? IS NULL OR noah_agent_availability.lease_until=?)`)
      .bind(plan.projectId, plan.protocol ?? 'gradio', manifest, JSON.stringify(digests), at, at + 3600000, at - NOAH_AVAILABILITY_TTL, observation.leaseUntil ?? null, observation.leaseUntil ?? null).run();
  }
  async function succeeded(projectId: string, digest: string, manifest: string, startedAt: number) {
    const at = now();
    // A stale invocation may not bless a newer schema. A later failed probe also wins.
    await db.prepare(`UPDATE noah_agent_availability SET state='verified',success_at=?,success_digest=?,revision=revision+1
      WHERE project_id=? AND manifest_hash=? AND state IN ('connected','verified') AND checked_at>?
      AND (failure_at IS NULL OR failure_at<?)
      AND EXISTS(SELECT 1 FROM json_each(endpoints_json) WHERE value=?)`)
      .bind(at, digest, projectId, manifest, at - NOAH_AVAILABILITY_TTL, startedAt, digest).run();
  }
  async function failed(projectId: string, observedAfter = 0, manifest?: string, leaseUntil?: number) {
    const at = now();
    await db.prepare(`UPDATE noah_agent_availability SET state='unavailable',failure_at=?,checked_at=?,next_check_at=?,lease_until=0,revision=revision+1
      WHERE project_id=? AND checked_at<=? AND (? IS NULL OR manifest_hash=?) AND (? IS NULL OR lease_until=?)`)
      .bind(at, at, at + 3600000, projectId, observedAfter || at, manifest ?? null, manifest ?? null, leaseUntil ?? null, leaseUntil ?? null).run();
  }
  async function all() { return (await db.prepare('SELECT * FROM noah_agent_availability ORDER BY project_id').all<AvailabilityRow>()).results; }
  async function claimDue(limit = 2) {
    const at = now();
    const rows = (await db.prepare('SELECT project_id FROM noah_agent_availability WHERE next_check_at<=? AND lease_until<=? ORDER BY next_check_at LIMIT ?')
      .bind(at, at, Math.min(2, limit)).all<{ project_id: string }>()).results;
    const claimed: { projectId: string; observation: AvailabilityObservation }[] = [];
    for (const row of rows) {
      const result = await db.prepare('UPDATE noah_agent_availability SET lease_until=? WHERE project_id=? AND next_check_at<=? AND lease_until<=? RETURNING project_id')
        .bind(at + 60000, row.project_id, at, at).first();
      if (result) claimed.push({ projectId: row.project_id, observation: { startedAt: at, leaseUntil: at + 60000 } });
    }
    return claimed;
  }
  return { read, prepared, succeeded, failed, all, claimDue };
}
