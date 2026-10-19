import { evaluateSkyPrivateAgentAdd, parseSkyPrivateAgentFit, parseSkyPrivateAgentSpec,
  skyPrivateAgentDigest, type SkyPrivateAgentAdd, type SkyPrivateAgentFit,
  type SkyPrivateAgentRecord } from './sky-private-agent.ts';
import { matchesSkyAddHostFit } from './sky-add-host-contract.ts';

type Database = Pick<D1Database, 'prepare'>;
type AgentRow = {
  id: string; ownerUserId: string; revision: number; digest: string; status: SkyPrivateAgentRecord['status'];
  specJson: string; createdAt: number; updatedAt: number;
};
type AddRow = {
  id: string; ownerUserId: string; agentId: string; agentRevision: number; agentDigest: string;
  fitJson: string; status: SkyPrivateAgentAdd['status']; createdAt: number; updatedAt: number;
};
const agentSelect = `SELECT id, owner_user_id AS ownerUserId, revision, digest, status,
  spec_json AS specJson, created_at AS createdAt, updated_at AS updatedAt FROM sky_private_agents`;
const addSelect = `SELECT id, owner_user_id AS ownerUserId, agent_id AS agentId,
  agent_revision AS agentRevision, agent_digest AS agentDigest, fit_json AS fitJson,
  status, created_at AS createdAt, updated_at AS updatedAt FROM sky_private_agent_adds`;

function agentFromRow(row: AgentRow): SkyPrivateAgentRecord {
  return { id: row.id, ownerUserId: row.ownerUserId, revision: row.revision, digest: row.digest,
    status: row.status, spec: parseSkyPrivateAgentSpec(JSON.parse(row.specJson)),
    createdAt: row.createdAt, updatedAt: row.updatedAt };
}
function addFromRow(row: AddRow): SkyPrivateAgentAdd {
  return { id: row.id, ownerUserId: row.ownerUserId, agentId: row.agentId,
    agentRevision: row.agentRevision, agentDigest: row.agentDigest,
    fit: parseSkyPrivateAgentFit(JSON.parse(row.fitJson)), status: row.status,
    createdAt: row.createdAt, updatedAt: row.updatedAt };
}

export function skyPrivateAgentStore(db: Database) {
  async function getAgent(ownerUserId: string, id: string): Promise<SkyPrivateAgentRecord | null> {
    const row = await db.prepare(`${agentSelect} WHERE owner_user_id = ? AND id = ?`)
      .bind(ownerUserId, id).first<AgentRow>();
    if (!row) return null;
    const agent = agentFromRow(row);
    if (await skyPrivateAgentDigest(ownerUserId, agent.id, agent.revision, agent.spec) !== agent.digest)
      throw new Error('Agent保存内容の照合に失敗しました。');
    return agent;
  }
  async function getAdd(ownerUserId: string, id: string): Promise<SkyPrivateAgentAdd | null> {
    const row = await db.prepare(`${addSelect} WHERE owner_user_id = ? AND id = ?`)
      .bind(ownerUserId, id).first<AddRow>();
    return row ? addFromRow(row) : null;
  }
  return {
    getAgent,
    getAdd,
    async listAgents(ownerUserId: string): Promise<SkyPrivateAgentRecord[]> {
      const rows = await db.prepare(`${agentSelect} WHERE owner_user_id = ? ORDER BY updated_at DESC LIMIT 100`)
        .bind(ownerUserId).all<AgentRow>();
      return Promise.all(rows.results.map(async (row) => {
        const agent = agentFromRow(row);
        if (await skyPrivateAgentDigest(ownerUserId, agent.id, agent.revision, agent.spec) !== agent.digest)
          throw new Error('Agent保存内容の照合に失敗しました。');
        return agent;
      }));
    },
    async listAdds(ownerUserId: string): Promise<SkyPrivateAgentAdd[]> {
      const rows = await db.prepare(`${addSelect} WHERE owner_user_id = ? ORDER BY updated_at DESC LIMIT 100`)
        .bind(ownerUserId).all<AddRow>();
      return rows.results.map(addFromRow);
    },
    async createAgent(ownerUserId: string, id: string, input: unknown): Promise<SkyPrivateAgentRecord | null> {
      const spec = parseSkyPrivateAgentSpec(input), now = Date.now(), digest = await skyPrivateAgentDigest(ownerUserId, id, 1, spec);
      const result = await db.prepare(`INSERT INTO sky_private_agents
        (owner_user_id, id, revision, digest, status, spec_json, created_at, updated_at)
        VALUES (?, ?, 1, ?, 'active', ?, ?, ?) ON CONFLICT(owner_user_id, id) DO NOTHING`)
        .bind(ownerUserId, id, digest, JSON.stringify(spec), now, now).run();
      if (result.meta.changes === 1) return { id, ownerUserId, revision: 1, digest, status: 'active', spec, createdAt: now, updatedAt: now };
      const existing = await getAgent(ownerUserId, id);
      return existing?.status === 'active' && existing.revision === 1 && existing.digest === digest ? existing : null;
    },
    async reviseAgent(ownerUserId: string, id: string, expectedRevision: number, input: unknown): Promise<SkyPrivateAgentRecord | null> {
      const current = await getAgent(ownerUserId, id);
      if (!current || current.status !== 'active' || current.revision !== expectedRevision) return null;
      const spec = parseSkyPrivateAgentSpec(input), nextRevision = current.revision + 1, now = Date.now();
      const digest = await skyPrivateAgentDigest(ownerUserId, id, nextRevision, spec);
      const result = await db.prepare(`UPDATE sky_private_agents SET revision = ?, digest = ?, spec_json = ?, updated_at = ?
        WHERE owner_user_id = ? AND id = ? AND revision = ? AND status = 'active'`)
        .bind(nextRevision, digest, JSON.stringify(spec), now, ownerUserId, id, expectedRevision).run();
      return result.meta.changes === 1 ? { ...current, revision: nextRevision, digest, spec, updatedAt: now } : null;
    },
    async revokeAgent(ownerUserId: string, id: string, expectedRevision: number): Promise<boolean> {
      const result = await db.prepare(`UPDATE sky_private_agents SET status = 'revoked', updated_at = ?
        WHERE owner_user_id = ? AND id = ? AND revision = ? AND status = 'active'`)
        .bind(Date.now(), ownerUserId, id, expectedRevision).run();
      return result.meta.changes === 1;
    },
    async addAgent(ownerUserId: string, id: string, agentId: string, fitInput: unknown): Promise<SkyPrivateAgentAdd | null> {
      const agent = await getAgent(ownerUserId, agentId), fit = parseSkyPrivateAgentFit(fitInput);
      if (!agent || agent.status !== 'active' ||
          !matchesSkyAddHostFit({ agentId, fits: agent.spec.fits }, fit)) return null;
      const now = Date.now();
      const result = await db.prepare(`INSERT INTO sky_private_agent_adds
        (owner_user_id, id, agent_id, agent_revision, agent_digest, fit_json, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'added', ?, ?) ON CONFLICT(owner_user_id, id) DO NOTHING`)
        .bind(ownerUserId, id, agentId, agent.revision, agent.digest, JSON.stringify(fit), now, now).run();
      if (result.meta.changes === 1) return { id, ownerUserId, agentId, agentRevision: agent.revision,
        agentDigest: agent.digest, fit, status: 'added', createdAt: now, updatedAt: now };
      const existing = await getAdd(ownerUserId, id);
      return existing?.status === 'added' && existing.agentId === agentId &&
        existing.agentRevision === agent.revision && existing.agentDigest === agent.digest &&
        JSON.stringify(existing.fit) === JSON.stringify(fit) ? existing : null;
    },
    async removeAdd(ownerUserId: string, id: string): Promise<boolean> {
      const result = await db.prepare(`UPDATE sky_private_agent_adds SET status = 'removed', updated_at = ?
        WHERE owner_user_id = ? AND id = ? AND status = 'added'`)
        .bind(Date.now(), ownerUserId, id).run();
      if (result.meta.changes === 1) return true;
      return (await getAdd(ownerUserId, id))?.status === 'removed';
    },
    async validateAdd(ownerUserId: string, id: string, fit: SkyPrivateAgentFit) {
      const add = await getAdd(ownerUserId, id);
      const agent = add ? await getAgent(ownerUserId, add.agentId) : null;
      return { agent, add, decision: evaluateSkyPrivateAgentAdd(ownerUserId, agent, add, fit) };
    },
  };
}
