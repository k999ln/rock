/** Consistency contract only. No verified issuance root, production issuer or dispatch gate exists. */
export const WORK_TOOL_PACKAGE_AUTHORITY_ROOT_STATUS = 'unbound_fixture_only' as const;
export const WORK_TOOL_PACKAGE_AUTHORITY_REFERENCE_SCHEMA = 'rockstaros.work-tool-package-authority-ref/1' as const;

export type WorkToolPackageAuthorityReference = {
  schema: typeof WORK_TOOL_PACKAGE_AUTHORITY_REFERENCE_SCHEMA;
  authorityId: string;
  revision: number;
  ownerUserId: string;
  issuerId: string;
  claimId: string;
  offerId: string;
  packageKey: string;
  manifestSha256: string;
};

function validOwner(value: unknown): value is string {
  if (typeof value !== 'string' || !value.length || value.length > 256) return false;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) return false;
  }
  return true;
}

export function readWorkToolPackageAuthorityReference(value: unknown): WorkToolPackageAuthorityReference | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'authorityId,claimId,issuerId,manifestSha256,offerId,ownerUserId,packageKey,revision,schema' ||
      v.schema !== WORK_TOOL_PACKAGE_AUTHORITY_REFERENCE_SCHEMA ||
      !Number.isSafeInteger(v.revision) || Number(v.revision) < 1 ||
      ![v.authorityId, v.issuerId, v.claimId, v.offerId].every(id => typeof id === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(id)) ||
      !validOwner(v.ownerUserId) ||
      typeof v.packageKey !== 'string' || v.packageKey.length > 205 ||
      !/^[a-z0-9]+(?:[.-][a-z0-9]+)+@(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v.packageKey) ||
      typeof v.manifestSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(v.manifestSha256)) return null;
  return v as WorkToolPackageAuthorityReference;
}

/** Fixed, parameterized predicate for composition INSIDE a job CAS in a fixture DB.
 * A true result proves row consistency, not trust in an issuer, owner authentication,
 * Connector approval, runtime safety, budget, or permission to execute.
 * Valid only inside an UPDATE of the unaliased work_jobs table. The predicate
 * itself correlates all nine fields of the fixture-only server-stored
 * toolPackageAuthorityReference, the operation Package pins and the row owner.
 * Caller-provided references or prechecks cannot replace these correlations.
 * The caller still supplies authenticated owner/id/revision and active/pending
 * transition predicates; this is not the complete job-state or identity gate.
 * This JSON slot is not installed into the production WorkJob schema.
 * The fixture-only table has no production migration or public writer.
 */
export function workToolPackageAuthorityConsistency(value: unknown): { sql: string; bindings: readonly (string | number)[] } | null {
  const ref = readWorkToolPackageAuthorityReference(value);
  if (!ref) return null;
  return {
    sql: `EXISTS (
      SELECT 1 FROM work_tool_package_authorities g
      JOIN rockstar_service_entitlements e ON e.issuer_id = g.issuer_id AND e.claim_id = g.claim_id
      WHERE g.authority_id = ? AND g.revision = ? AND g.owner_user_id = ?
        AND g.issuer_id = ? AND g.claim_id = ? AND g.offer_id = ?
        AND g.package_key = ? AND g.manifest_sha256 = ?
        AND g.owner_user_id = work_jobs.user_id
        AND g.package_key = json_extract(work_jobs.payload, '$.packageKey')
        AND g.manifest_sha256 = json_extract(work_jobs.payload, '$.manifestSha256')
        AND json_type(work_jobs.payload, '$.toolPackageAuthorityReference') = 'object'
        AND (SELECT COUNT(*) FROM json_each(work_jobs.payload, '$.toolPackageAuthorityReference')) = 9
        AND json_type(work_jobs.payload, '$.toolPackageAuthorityReference.schema') = 'text'
        AND json_extract(work_jobs.payload, '$.toolPackageAuthorityReference.schema') = '${WORK_TOOL_PACKAGE_AUTHORITY_REFERENCE_SCHEMA}'
${([
  ['authorityId', 'authority_id', 'text'], ['revision', 'revision', 'integer'],
  ['ownerUserId', 'owner_user_id', 'text'], ['issuerId', 'issuer_id', 'text'],
  ['claimId', 'claim_id', 'text'], ['offerId', 'offer_id', 'text'],
  ['packageKey', 'package_key', 'text'], ['manifestSha256', 'manifest_sha256', 'text'],
] as const).map(([key, column, kind]) =>
  `        AND json_type(work_jobs.payload, '$.toolPackageAuthorityReference.${key}') = '${kind}'
        AND json_extract(work_jobs.payload, '$.toolPackageAuthorityReference.${key}') = g.${column}`).join('\n')}
        AND g.root_state = 'fixture_only' AND g.state = 'active' AND g.revoked_at IS NULL
        AND g.issued_at <= CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
        AND g.expires_at > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
        AND e.owner_user_id = g.owner_user_id AND e.offer_id = g.offer_id
        AND e.status = 'active' AND e.revoked_at IS NULL
        AND (e.expires_at IS NULL OR e.expires_at > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
    )`,
    bindings: [ref.authorityId, ref.revision, ref.ownerUserId, ref.issuerId, ref.claimId, ref.offerId, ref.packageKey, ref.manifestSha256],
  };
}
