import { parseSkyAgentSettings } from '@/lib/sky-agent-library';
import { reviewSkyAgentPackageContract } from '@/lib/sky-agent-requirements';
import { parseSkyToolPackage, skyToolPackageKey, skyToolPackageSha256 } from '@/lib/sky-tool-package';
import { skyPackageSchemaSha256 } from '@/lib/sky-package-runtime';
import { dispatchAuthorityAvailable } from '@/app/api/work-jobs/tool-observations/authority';
import { readBoundedStream } from '@/lib/bounded-stream';
import { ownerScopeFor, readOwnerScope } from '@/lib/owner-intent';
import { database } from '@/lib/fund-store';
import { workStore } from '@/lib/work-store';
import { parseWorkToolApprovalContext, parseWorkToolExecutionReview, workToolExecutionReviewDigest, workToolCreationRelation, objectInput, workId, workToolCapabilityHash } from '@/lib/workflow';

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const deny = () => json({ error: '実行状態を確認できません。' }, 403);
function equalDigest(a: string, b: string) {
  if (!/^[a-f0-9]{64}$/.test(a) || !/^[a-f0-9]{64}$/.test(b)) return false;
  let difference = 0;
  for (let i = 0; i < 64; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

/** A narrowly scoped, one-use bearer capability; it does not replace Tool approval. */
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) return deny();
    const reader = request.body?.getReader();
    if (!reader) return deny();
    const bytes = await readBoundedStream(reader, 4096, () => new Error('INVALID_CLAIM'));
    const input = objectInput(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown,
      ['jobId', 'attemptId', 'agentId', 'agentRevision', 'ownerScope', 'inputSha256', 'connectorId', 'toolName', 'token', 'inputSchemaSha256', 'outputSchemaSha256', 'transport', 'executionReviewDigest', 'executionContext']);
    const hasReview = Object.hasOwn(input, 'executionReviewDigest') || Object.hasOwn(input, 'executionContext');
    if ((Object.keys(input).length !== (hasReview ? 14 : 12)) ||
        (hasReview && (typeof input.executionReviewDigest !== 'string' || !/^[a-f0-9]{64}$/.test(input.executionReviewDigest))) ||
        typeof input.inputSchemaSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.inputSchemaSha256) ||
        typeof input.outputSchemaSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.outputSchemaSha256) ||
        !['stdio', 'local_http'].includes(String(input.transport)) || typeof input.agentId !== 'string' ||
        !/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,119}$/.test(input.agentId) ||
        !Number.isSafeInteger(input.agentRevision) || Number(input.agentRevision) < 1 ||
        !readOwnerScope(input.ownerScope) || typeof input.inputSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.inputSha256) ||
        typeof input.connectorId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.connectorId) ||
        typeof input.toolName !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.toolName) ||
        typeof input.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.token)) return deny();
    const jobId = workId(input.jobId), attemptId = workId(input.attemptId), db = database();
    // The opaque capability selects one pre-existing owner-scoped job. Neither
    // caller-provided ownerScope nor job ID is authentication by itself.
    const ownerRow = await db.prepare('SELECT user_id AS owner FROM work_jobs WHERE id = ?').bind(jobId).first<{ owner: string }>();
    if (!ownerRow || typeof ownerRow.owner !== 'string' || !dispatchAuthorityAvailable(request, ownerRow.owner, false) ||
        await ownerScopeFor(ownerRow.owner) !== input.ownerScope) return deny();
    const current = await workStore(db).get(ownerRow.owner, jobId), binding = current?.agentBinding;
    const target = current?.toolAttempts?.find(row => row.id === attemptId);
    if (!current || current.status !== 'active' || !binding || binding.schema !== 'rockstaros.work-agent-binding/1' ||
        binding.agentId !== input.agentId || binding.agentRevision !== input.agentRevision ||
        !target || target.schema !== 'rockstaros.work-tool-attempt/1' || target.state !== 'pending' ||
        target.inputSha256 !== input.inputSha256 || target.connectorId !== input.connectorId || target.toolName !== input.toolName ||
        typeof target.capabilityHash !== 'string' || !Number.isSafeInteger(target.capabilityExpiresAt) ||
        Number(target.capabilityExpiresAt) <= Date.now()) return deny();
    const roleRow = await db.prepare('SELECT settings FROM sky_agent_settings WHERE owner_user_id = ? AND id = ? AND revision = ?')
      .bind(ownerRow.owner,binding.agentId,binding.agentRevision).first<{settings:string}>();
    const roleRequirements = roleRow ? parseSkyAgentSettings(JSON.parse(roleRow.settings)).requirements : undefined;
    const contractRequirements = roleRequirements?.contract ? roleRequirements : undefined;
    if (contractRequirements && !hasReview) return deny();
    const targetHasReview = Object.hasOwn(target, 'executionReview') || Object.hasOwn(target, 'executionReviewDigest') || Object.hasOwn(target, 'creationRelation');
    if (targetHasReview !== hasReview || (Object.hasOwn(binding, 'creationReview') && !hasReview)) return deny();
    const review = hasReview ? parseWorkToolExecutionReview(target.executionReview) : undefined;
    const executionDigest = review ? await workToolExecutionReviewDigest(review) : undefined;
    if (review && (executionDigest !== target.executionReviewDigest || executionDigest !== input.executionReviewDigest ||
        review.ownerScope !== input.ownerScope || review.jobId !== jobId || review.jobRevision + 1 !== current.revision ||
        review.agentId !== binding.agentId || review.agentRevision !== binding.agentRevision ||
        review.packageKey !== target.packageKey || review.manifestSha256 !== target.manifestSha256 ||
        review.approvalContext.connectorId !== target.connectorId || review.approvalContext.toolName !== target.toolName ||
        review.approvalContext.inputSha256 !== target.inputSha256 || review.approvalContext.transport !== input.transport ||
        review.approvalContext.expiresAt <= Date.now() ||
        JSON.stringify(parseWorkToolApprovalContext(input.executionContext)) !== JSON.stringify(review.approvalContext) ||
        JSON.stringify(target.creationRelation) !== JSON.stringify(workToolCreationRelation(binding, review)))) return deny();
    const expected = await workToolCapabilityHash({ owner: ownerRow.owner, jobId, attemptId,
      inputSha256: input.inputSha256, expiresAt: target.capabilityExpiresAt!, token: input.token, executionReviewDigest: executionDigest });
    if (!equalDigest(expected, target.capabilityHash)) return deny();
    const packageRow = await db.prepare('SELECT manifest FROM sky_tool_packages WHERE package_key = ? AND manifest_sha256 = ? AND status = ?')
      .bind(target.packageKey, target.manifestSha256, 'verified').first<{ manifest: string }>();
    if (!packageRow || typeof packageRow.manifest !== 'string') return deny();
    const manifest = parseSkyToolPackage(JSON.parse(packageRow.manifest));
    if (contractRequirements) {
      const check=reviewSkyAgentPackageContract(contractRequirements,manifest),runtime=contractRequirements.contract!.runtime;
      if (check.state !== 'candidate' || runtime?.serverId !== input.connectorId || runtime.toolName !== input.toolName) return deny();
    }

    if (skyToolPackageKey(manifest) !== target.packageKey || await skyToolPackageSha256(manifest) !== target.manifestSha256 ||
        manifest.pricing.model !== 'free' || (review && manifest.pricing.note !== review.packagePricing.note) || !manifest.capabilities.executionTargets.includes('pc') ||
        !((manifest.adapter.connectionType === 'mcp_stdio' && input.transport === 'stdio') ||
          (manifest.adapter.connectionType === 'mcp_streamable_http' && input.transport === 'local_http')) ||
        await skyPackageSchemaSha256(manifest.io.inputSchema) !== input.inputSchemaSha256 ||
        await skyPackageSchemaSha256(manifest.io.outputSchema) !== input.outputSchemaSha256) return deny();
    const now = new Date().toISOString();
    const next = { ...current, revision: current.revision + 1, updatedAt: now,
      toolAttempts: current.toolAttempts!.map(row => row.id === attemptId ? { ...row, state: 'claimed' as const, claimedAt: now, claimedRevision: current.revision + 1 } : row) };
    // The same row/revision serializes claim vs cancellation. Check the Agent
    // revision and expiry in the same update, not merely on a prior read.
    const update = await db.prepare(`UPDATE work_jobs SET payload = ?, revision = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND revision = ? AND json_extract(payload, '$.status') = 'active'
        AND CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER) < ?
        AND EXISTS (SELECT 1 FROM sky_agent_settings a
          WHERE a.owner_user_id = ? AND a.id = ? AND a.revision = ? AND json_extract(a.settings, '$.enabled') = 1
            AND json_extract(a.settings, '$.requirements.packageKey') = ?
            AND json_extract(a.settings, '$.requirements.executionTarget') = 'pc'
            ${contractRequirements ? `AND a.settings = ?` : ''}
            AND (a.source_tool IS NULL OR EXISTS (SELECT 1 FROM sky_connections c
              WHERE c.user_id = a.owner_user_id AND c.tool = a.source_tool)))
        AND EXISTS (SELECT 1 FROM sky_tool_packages p WHERE p.package_key = ? AND p.manifest_sha256 = ? AND p.manifest = ? AND p.status = 'verified'
          AND EXISTS (SELECT 1 FROM sky_tool_package_reviews r WHERE r.package_key = p.package_key
            AND r.manifest_sha256 = p.manifest_sha256 AND r.decision = 'verified'
            AND (r.expires_at IS NULL OR r.expires_at > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))))
        ${!review ? `AND json_type(payload, '$.agentBinding.creationReview') IS NULL` : ''}
        ${review ? `AND payload = ? AND EXISTS (SELECT 1 FROM json_each(work_jobs.payload, '$.toolAttempts') a
          WHERE json_extract(a.value, '$.id') = ? AND json_extract(a.value, '$.state') = 'pending'
            AND json_extract(a.value, '$.executionReviewDigest') = ?
            AND json_extract(a.value, '$.executionReview') = json(?)
            AND json_extract(a.value, '$.creationRelation') = json(?))` : ''}`)
      .bind(JSON.stringify(next), next.revision, next.updatedAt, jobId, ownerRow.owner, current.revision,
        target.capabilityExpiresAt, ownerRow.owner, binding.agentId, binding.agentRevision, target.packageKey, ...(contractRequirements ? [roleRow!.settings] : []), target.packageKey, target.manifestSha256, packageRow.manifest,
        ...(review ? [JSON.stringify(current), target.id, executionDigest!, JSON.stringify(review), JSON.stringify(target.creationRelation)] : [])).run();
    if (update.meta.changes !== 1) return deny();
    return json({ claimed: true, jobId, attemptId, inputSha256: input.inputSha256, jobRevision: next.revision, ...(review ? { executionReviewDigest: executionDigest } : {}) });
  } catch { return deny(); }
}
