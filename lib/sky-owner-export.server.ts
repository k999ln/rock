import { workStore } from './work-store.ts';
import { a2aDelegationStore, A2A_MAX_DELEGATIONS_PER_PARENT_JOB } from './a2a-delegation-store.ts';
import { RemoteAiTextStore } from './remote-ai-text-store.ts';
import { decryptA2AArtifact } from './a2a-input-crypto.ts';
import { buildSkyOwnerExport, ownerExportArtifact, SkyOwnerExportError, SKY_OWNER_EXPORT_MAX_BYTES } from './sky-owner-export.ts';

/** A read-only recovery operation over existing stores, not a new job or execution path. */
export async function exportSkyOwnerWork(
  db: Pick<D1Database, 'prepare' | 'batch'>,
  owner: string,
  jobId: string,
  expectedRevision: number,
  encryptionKey?: string,
) {
  const works = workStore(db);
  const agents = a2aDelegationStore(db);
  const cloud = new RemoteAiTextStore(db);
  const job = await works.get(owner, jobId);
  if (!job || job.id !== jobId) throw new SkyOwnerExportError('NOT_FOUND');
  if (job.revision !== expectedRevision) throw new SkyOwnerExportError('REVISION_CONFLICT');

  async function readSources() {
    const [currentJob, delegations, executions, budget, reservations] = await Promise.all([
      works.get(owner, jobId), agents.listForParent(owner, jobId), cloud.listForExport(owner, jobId),
      agents.getBudget(owner, jobId), agents.listBudgetReservations(owner, jobId),
    ]);
    // The existing stores have bounded queries. Reject at their limit rather than silently exporting a prefix.
    if (delegations.length > A2A_MAX_DELEGATIONS_PER_PARENT_JOB || executions.length > 50 || reservations.length > 200)
      throw new SkyOwnerExportError('TOO_LARGE');
    const records = await Promise.all(delegations.map(async (delegation) => {
      const [artifacts, receipt] = await Promise.all([
        agents.listArtifacts(owner, delegation.id), agents.getUsageReceipt(owner, delegation.id),
      ]);
      if (artifacts.length >= 32) throw new SkyOwnerExportError('TOO_LARGE');
      if (delegation.artifactsCaptured === 1 && artifacts.length === 0)
        throw new SkyOwnerExportError('INVALID_ARTIFACT');
      return { delegation, artifacts, receipt };
    }));
    const savedBytes = records.flatMap((record) => record.artifacts).reduce((sum, artifact) => sum + artifact.byteLength, 0) +
      executions.reduce((sum, execution) => sum + new TextEncoder().encode(execution.saveResult ? execution.resultText ?? '' : '').byteLength, 0);
    if (!Number.isSafeInteger(savedBytes) || savedBytes > SKY_OWNER_EXPORT_MAX_BYTES)
      throw new SkyOwnerExportError('TOO_LARGE');
    return { job: currentJob, agents: records, cloud: executions, budget, reservations };
  }
  const source = await readSources();
  if (!source.job || source.job.revision !== expectedRevision)
    throw new SkyOwnerExportError('REVISION_CONFLICT');
  const decoded = await Promise.all(source.agents.map(async (record) => ({
    delegation: record.delegation,
    receipt: record.receipt,
    artifacts: await Promise.all(record.artifacts.map(async (artifact) => {
      if (!encryptionKey) throw new SkyOwnerExportError('UNAVAILABLE');
      const serialized = await decryptA2AArtifact({
        ciphertext: artifact.ciphertext, nonce: artifact.nonce,
        artifactSha256: artifact.artifactSha256, keyVersion: artifact.keyVersion as 'aes-256-gcm-v1',
      }, encryptionKey, owner, record.delegation.id, artifact.remoteTaskId);
      if (new TextEncoder().encode(serialized).byteLength !== artifact.byteLength)
        throw new SkyOwnerExportError('INVALID_ARTIFACT');
      return { id: artifact.id, sha256: artifact.artifactSha256, byteLength: artifact.byteLength,
        createdAt: artifact.createdAt, document: ownerExportArtifact(JSON.parse(serialized)) };
    })),
  })));
  // Do not publish a mixture of revisions or a missing artifact as a complete snapshot.
  const readback = await readSources();
  if (JSON.stringify(source) !== JSON.stringify(readback)) throw new SkyOwnerExportError('REVISION_CONFLICT');
  return buildSkyOwnerExport({ ...source, job: source.job, agents: decoded });
}
