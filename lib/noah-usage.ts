import { NoahAgentError, noahSha256 } from './noah-agent-upload.ts';
import { cloudTrigger, utcMonth, type CloudMonth, type CloudTriggerState } from './cloud-cost.ts';
export type NoahUsageScope = 'personal' | 'publisher' | 'operator';
export type NoahUsageSource = 'platform_agent' | 'local_agent' | 'model' | 'reported';
export type UsageMetrics = { runs: number; succeeded: number; failed: number; other: number; durationMs: number | null; measuredDurationRuns: number; knownCostRuns: number };
export type UsageGroup = UsageMetrics & { agentRef: string; name: string; actorId?: string; actorKind?: string; lastUsedAt: number };
export type UsageRow = { id: string; agentRef: string; name: string; actorId: string; actorKind: string; outcome: string; durationMs: number | null; costMinor: number | null; currency: string | null; occurredAt: number };
export type NoahUsageReport = {
  scope: NoahUsageScope; days: number; from: number; to: number; operatorAllowed: boolean;
  sources: { source: NoahUsageSource; metrics: UsageMetrics; costs: { currency: string; amountMinor: number }[]; agents: UsageGroup[]; users: UsageGroup[]; recent: UsageRow[] }[];
  cloud?: NoahCloudUsageReport;
  cloudError?: string;
};

export type NoahCloudUsageReport = {
  months: CloudMonth[];
  currentMonth: string;
  current: CloudMonth | null;
  remainingUsd: number | null;
  trigger: CloudTriggerState;
};

export async function noahCloudUsageReport(
  db: Pick<D1Database, 'prepare'>,
  triggerConfig?: string,
  now = Date.now(),
): Promise<NoahCloudUsageReport> {
  const configured = triggerConfig ?? '190';
  const thresholdUsd = Number(configured);
  if (!/^\d+(\.\d{1,6})?$/u.test(configured) || !Number.isFinite(thresholdUsd)) {
    throw new NoahAgentError('移行の引き金の金額設定を確認してください。', 503);
  }
  const currentMonth = utcMonth(now);
  const date = new Date(now);
  const from = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 11, 1);
  // Metering derives cost_usd from cloud-cost.ts when a trusted usage record is accepted.
  const { results: months } = await db.prepare(`SELECT
    strftime('%Y-%m', observed_at / 1000, 'unixepoch') AS month,
    ROUND(COALESCE(SUM(CASE WHEN json_extract(usage_json, '$.kind') = 'container' THEN cost_usd END), 0), 6) AS containersUsd,
    ROUND(COALESCE(SUM(CASE WHEN json_extract(usage_json, '$.kind') = 'model' THEN cost_usd END), 0), 6) AS modelsUsd,
    ROUND(COALESCE(SUM(cost_usd), 0), 6) AS totalUsd,
    COUNT(*) - COUNT(cost_usd) AS unpriced, COUNT(*) AS records
    FROM cloud_usage_records
    WHERE observed_at BETWEEN ? AND ?
    GROUP BY month ORDER BY month`).bind(from, now).all<CloudMonth>();
  const current = months.find((month) => month.month === currentMonth) ?? null;
  const remainingUsd = current && (current.unpriced === 0 || current.totalUsd >= thresholdUsd)
    ? Math.max(0, Math.round((thresholdUsd - current.totalUsd) * 1e6) / 1e6)
    : null;
  return { months, currentMonth, current, remainingUsd, trigger: cloudTrigger(months, now, { thresholdUsd }) };
}

export function noahUsageOperatorAllowed(owner: string, configured: unknown) {
  if (typeof configured !== 'string') return false;
  try { const ids = JSON.parse(configured); return Array.isArray(ids) && ids.length <= 100 && ids.every(id => typeof id === 'string' && id.length > 0 && id.length <= 256) && ids.includes(owner); }
  catch { return false; }
}
const facts = `WITH local_work AS (
  SELECT id, user_id, CASE WHEN json_valid(payload) THEN payload ELSE '{}' END AS payload FROM work_jobs
), local_work_owned AS (
  SELECT w.*, COALESCE(p.user_id,u.owner_id,i.owner_id) AS source_owner,
    CASE WHEN json_valid(p.manifest) THEN json_extract(p.manifest,'$.name') WHEN json_valid(u.manifest) THEN json_extract(u.manifest,'$.name') WHEN json_valid(shared.manifest) THEN json_extract(shared.manifest,'$.name') END AS source_name,
    p.package_key AS release_key
  FROM local_work w LEFT JOIN noah_agent_uploads u
    ON u.id=json_extract(w.payload,'$.noahExecution.source.uploadId') AND u.owner_id=w.user_id
    AND u.manifest_sha256=json_extract(w.payload,'$.noahExecution.source.manifestSha256')
    AND u.source_sha256=json_extract(w.payload,'$.noahExecution.source.sourceSha256')
  LEFT JOIN noah_agent_invites i ON i.id=json_extract(w.payload,'$.noahExecution.invite.inviteId')
    AND i.upload_id=json_extract(w.payload,'$.noahExecution.invite.uploadId')
    AND i.manifest_sha256=json_extract(w.payload,'$.noahExecution.invite.manifestSha256')
    AND i.source_sha256=json_extract(w.payload,'$.noahExecution.invite.sourceSha256')
    AND (i.owner_id=w.user_id OR EXISTS(SELECT 1 FROM noah_agent_invite_claims c WHERE c.invite_id=i.id AND c.recipient_id=w.user_id))
  LEFT JOIN noah_agent_uploads shared ON shared.id=i.upload_id AND shared.owner_id=i.owner_id
  LEFT JOIN sky_tool_packages p ON p.package_key=json_extract(w.payload,'$.noahExecution.release.packageKey')
    AND p.manifest_sha256=json_extract(w.payload,'$.noahExecution.release.manifestSha256')
    AND CASE WHEN json_valid(p.manifest) THEN json_extract(p.manifest,'$.source.artifact.sha256') END=json_extract(w.payload,'$.noahExecution.release.sourceSha256')
), facts AS (
  SELECT 'platform_agent' AS source, 'a2a:' || d.id AS id, d.owner_user_id AS consumer_id, p.user_id AS publisher_id,
    COALESCE(p.package_key, 'a2a:' || d.target_origin || ':' || d.target_agent_name || '@' || d.target_agent_version) AS agent_ref,
    d.target_agent_name AS name, d.owner_user_id AS actor_id, 'account' AS actor_kind,
    CASE WHEN d.state = 'remote_completed' THEN 'succeeded' WHEN d.state IN ('remote_failed','remote_rejected') THEN 'failed' ELSE d.state END AS outcome,
    NULL AS duration_ms, r.amount_minor AS cost_minor, r.currency AS currency, d.created_at AS occurred_at
  FROM agent_delegations d
  LEFT JOIN sky_package_runtime_bindings b ON b.binding_id=d.package_runtime_binding_id AND b.digest=d.package_runtime_binding_digest
  LEFT JOIN sky_tool_packages p ON p.package_key=b.package_key AND p.manifest_sha256=b.manifest_sha256
  LEFT JOIN a2a_usage_receipts r ON r.delegation_id=d.id AND r.owner_user_id=d.owner_user_id AND r.parent_job_id=d.parent_job_id
  WHERE d.state NOT IN ('awaiting_approval','prepared','expired')
  UNION ALL
  SELECT 'local_agent', 'work:' || id, user_id, source_owner,
    COALESCE(release_key, CASE WHEN source_owner IS NOT NULL THEN 'noah-upload:' || COALESCE(json_extract(payload, '$.noahExecution.source.uploadId'),json_extract(payload, '$.noahExecution.invite.uploadId')) ELSE json_extract(payload, '$.noahExecution.agentId') END),
    COALESCE(source_name, json_extract(payload, '$.noahExecution.recipe')), user_id, 'account',
    CASE WHEN json_extract(payload, '$.noahExecution.state')='returned' AND json_extract(payload, '$.noahExecution.result.exitCode')=0 THEN 'succeeded'
      WHEN json_extract(payload, '$.noahExecution.state')='returned' AND json_extract(payload, '$.noahExecution.result.exitCode')!=0 THEN 'failed'
      ELSE json_extract(payload, '$.noahExecution.state') END,
    CASE WHEN json_type(payload, '$.noahExecution.startedAt') = 'integer' AND json_type(payload, '$.noahExecution.completedAt') = 'integer'
      AND json_extract(payload, '$.noahExecution.completedAt') >= json_extract(payload, '$.noahExecution.startedAt')
      THEN json_extract(payload, '$.noahExecution.completedAt') - json_extract(payload, '$.noahExecution.startedAt') ELSE NULL END,
    NULL, NULL, CAST(unixepoch(json_extract(payload, '$.createdAt'), 'subsec') * 1000 AS INTEGER)
  FROM local_work_owned WHERE json_extract(payload, '$.templateId') = 'noah-agent-local'
    AND json_extract(payload, '$.noahExecution.agentId') IS NOT NULL
  UNION ALL
  SELECT 'model', 'llm:' || id, owner_user_id, NULL, 'model:' || model_id, model_id, owner_user_id, 'account',
    CASE WHEN state='completed' THEN 'succeeded' ELSE state END, duration_ms, settled_minor,
    CASE WHEN settled_minor IS NOT NULL THEN currency ELSE NULL END, created_at
  FROM remote_ai_text_executions WHERE state IN ('sending','completed','unreconciled')
  UNION ALL
  SELECT 'reported', 'sdk:' || e.id, NULL, e.owner_user_id, e.package_key,
    COALESCE(CASE WHEN json_valid(u.manifest) THEN json_extract(u.manifest,'$.name') END,
      CASE WHEN json_valid(p.manifest) THEN json_extract(p.manifest,'$.name') END, e.tool_name),
    e.owner_user_id || ':' || e.installation_id, 'installation', e.outcome, e.duration_ms, NULL, NULL, e.created_at
  FROM sky_tool_events e
  LEFT JOIN sky_tool_packages p ON p.package_key=e.package_key AND p.user_id=e.owner_user_id
  LEFT JOIN noah_agent_uploads u ON ('noah-upload:' || u.id)=e.package_key AND u.owner_id=e.owner_user_id
), scoped AS (SELECT * FROM facts WHERE occurred_at >= ? AND occurred_at < ? AND __SCOPE__ AND (? = '' OR agent_ref = ?)) `;
const metrics = `COUNT(*) AS runs,
  COALESCE(SUM(CASE WHEN outcome='succeeded' THEN 1 ELSE 0 END),0) AS succeeded,
  COALESCE(SUM(CASE WHEN outcome IN ('failed','rejected') THEN 1 ELSE 0 END),0) AS failed,
  COALESCE(SUM(CASE WHEN outcome NOT IN ('succeeded','failed','rejected') THEN 1 ELSE 0 END),0) AS other,
  SUM(duration_ms) AS durationMs, COUNT(duration_ms) AS measuredDurationRuns, COUNT(cost_minor) AS knownCostRuns`;
export async function noahUsageReport(db: Pick<D1Database, 'prepare'>, owner: string, input: { scope?: string; days?: string; agent?: string }, adminConfig?: unknown, now = Date.now()): Promise<NoahUsageReport> {
  const scope = (input.scope || 'personal') as NoahUsageScope, days = Number(input.days || 30), agent = input.agent || '';
  if (!['personal','publisher','operator'].includes(scope) || ![7,30,90].includes(days) || agent.length > 500) throw new NoahAgentError('表示範囲・期間・Agent指定を確認してください。');
  const operatorAllowed = noahUsageOperatorAllowed(owner, adminConfig);
  if (scope === 'operator' && !operatorAllowed) throw new NoahAgentError('Noah全体の閲覧には運営権限が必要です。', 403);
  const from = now - days * 86400000, base = [from, now, ...(scope === 'operator' ? [] : [owner]), agent, agent];
  const sql = facts.replace('__SCOPE__', scope === 'personal' ? 'consumer_id = ?' : scope === 'publisher' ? 'publisher_id = ?' : '1=1');
  const identity = async (value: string, kind: string) => {
    if (kind === 'account' && scope === 'personal') return '自分';
    if (scope === 'operator' && kind === 'account') return value;
    const hash = await noahSha256(new TextEncoder().encode(`${scope === 'publisher' ? owner : 'operator'}\0${kind}\0${value}`));
    return `${kind === 'account' ? '利用者' : '利用元'}-${hash.slice(0,16)}`;
  };
  const sources: NoahUsageReport['sources'] = [];
  for (const source of ['platform_agent','local_agent','model','reported'] as const) {
    const params = [...base, source];
    const query = <T>(tail: string) => db.prepare(sql + tail).bind(...params).all<T>();
    const [total, costs, agents, users, recent] = await Promise.all([
      query<UsageMetrics>(`SELECT ${metrics} FROM scoped WHERE source=?`),
      query<{currency:string;amountMinor:number}>('SELECT currency, SUM(cost_minor) AS amountMinor FROM scoped WHERE source=? AND cost_minor IS NOT NULL GROUP BY currency ORDER BY currency'),
      query<UsageGroup>(`SELECT agent_ref AS agentRef, name, MAX(occurred_at) AS lastUsedAt, ${metrics} FROM scoped WHERE source=? GROUP BY agent_ref, name ORDER BY runs DESC, agent_ref LIMIT 50`),
      query<UsageGroup>(`SELECT agent_ref AS agentRef, name, actor_id AS actorId, actor_kind AS actorKind, MAX(occurred_at) AS lastUsedAt, ${metrics} FROM scoped WHERE source=? GROUP BY agent_ref, name, actor_id, actor_kind ORDER BY runs DESC, actor_id, agent_ref LIMIT 50`),
      query<UsageRow>('SELECT id, agent_ref AS agentRef, name, actor_id AS actorId, actor_kind AS actorKind, outcome, duration_ms AS durationMs, cost_minor AS costMinor, currency, occurred_at AS occurredAt FROM scoped WHERE source=? ORDER BY occurred_at DESC, id DESC LIMIT 50'),
    ]);
    sources.push({ source, metrics: total.results[0], costs: costs.results, agents: agents.results,
      users: await Promise.all(users.results.map(async r => ({ ...r, actorId: await identity(r.actorId!, r.actorKind!) }))),
      recent: await Promise.all(recent.results.map(async r => ({ ...r, actorId: await identity(r.actorId, r.actorKind) }))) });
  }
  return { scope, days, from, to: now, operatorAllowed, sources };
}
