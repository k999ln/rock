import type { SkyPackageRuntimeBinding } from './sky-package-runtime-binding.ts';
import { skyPackageRuntimeBindingDigest } from './sky-package-runtime-binding.ts';

type Database = Pick<D1Database, 'prepare'>;

export type StoredSkyPackageRuntimeBinding = {
  bindingId: string;
  providerId: string;
  keyId: string;
  agentOrigin: string;
  packageKey: string;
  manifestSha256: string;
  digest: string;
  bindingJson: string;
  status: 'active' | 'revoked';
  createdAt: number;
  createdBy: string;
  revokedAt: number | null;
  revokedBy: string | null;
};

export class SkyPackageRuntimeBindingStoreError extends Error {
  readonly code: 'BINDING_ID_CONFLICT' | 'BINDING_REVOKED' | 'BINDING_NOT_FOUND' | 'BINDING_STORE_UNAVAILABLE';
  constructor(code: SkyPackageRuntimeBindingStoreError['code']) {
    super(code);
    this.name = 'SkyPackageRuntimeBindingStoreError';
    this.code = code;
  }
}

const columns = `binding_id AS bindingId, provider_id AS providerId, key_id AS keyId,
  agent_origin AS agentOrigin, package_key AS packageKey,
  manifest_sha256 AS manifestSha256, digest, binding_json AS bindingJson,
  status, created_at AS createdAt, created_by AS createdBy,
  revoked_at AS revokedAt, revoked_by AS revokedBy`;

/** Immutable D1 registry for already signature-verified cloud operation bindings. */
export class SkyPackageRuntimeBindingStore {
  private readonly db: Database;
  constructor(db: Database) { this.db = db; }

  async register(binding: SkyPackageRuntimeBinding, operatorId: string, now = Date.now()) {
    const digest = await skyPackageRuntimeBindingDigest(binding);
    const select = () => this.db.prepare(
      `SELECT ${columns} FROM sky_package_runtime_bindings WHERE binding_id = ?`,
    ).bind(binding.bindingId).first<StoredSkyPackageRuntimeBinding>();
    let existing = await select();
    if (existing) {
      if (existing.digest !== digest) throw new SkyPackageRuntimeBindingStoreError('BINDING_ID_CONFLICT');
      if (existing.status === 'revoked') throw new SkyPackageRuntimeBindingStoreError('BINDING_REVOKED');
      return { inserted: false, digest, status: existing.status };
    }
    const result = await this.db.prepare(`INSERT OR IGNORE INTO sky_package_runtime_bindings
      (binding_id, provider_id, key_id, agent_origin, package_key, manifest_sha256,
       digest, binding_json, status, created_at, created_by, revoked_at, revoked_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL, NULL)`)
      .bind(binding.bindingId, binding.providerId, binding.keyId, binding.agentOrigin,
        binding.packageKey, binding.manifestSha256, digest, JSON.stringify(binding), now, operatorId).run();
    existing = await select();
    if (!existing) throw new SkyPackageRuntimeBindingStoreError('BINDING_STORE_UNAVAILABLE');
    if (existing.digest !== digest) throw new SkyPackageRuntimeBindingStoreError('BINDING_ID_CONFLICT');
    if (existing.status === 'revoked') throw new SkyPackageRuntimeBindingStoreError('BINDING_REVOKED');
    return { inserted: (result.meta?.changes ?? 0) > 0, digest, status: existing.status };
  }

  async revoke(bindingId: string, operatorId: string, now = Date.now()) {
    const result = await this.db.prepare(`UPDATE sky_package_runtime_bindings
      SET status = 'revoked', revoked_at = ?, revoked_by = ?
      WHERE binding_id = ? AND status = 'active'`).bind(now, operatorId, bindingId).run();
    if ((result.meta?.changes ?? 0) > 0) return { revoked: true, alreadyRevoked: false };
    const existing = await this.db.prepare(
      'SELECT status FROM sky_package_runtime_bindings WHERE binding_id = ?',
    ).bind(bindingId).first<{ status: string }>();
    if (!existing) throw new SkyPackageRuntimeBindingStoreError('BINDING_NOT_FOUND');
    return { revoked: true, alreadyRevoked: true };
  }

  async get(bindingId: string) {
    return this.db.prepare(
      `SELECT ${columns} FROM sky_package_runtime_bindings WHERE binding_id = ?`,
    ).bind(bindingId).first<StoredSkyPackageRuntimeBinding>();
  }

  async findActive(agentOrigin: string, packageKey: string, manifestSha256: string, now = Date.now()) {
    const result = await this.db.prepare(`SELECT ${columns} FROM sky_package_runtime_bindings
      WHERE agent_origin = ? AND package_key = ? AND manifest_sha256 = ?
        AND status = 'active' AND created_at <= ?
      ORDER BY created_at DESC, binding_id LIMIT 32`)
      .bind(agentOrigin, packageKey, manifestSha256, now).all<StoredSkyPackageRuntimeBinding>();
    return result.results ?? [];
  }
}

export function parseStoredSkyPackageRuntimeBinding(row: StoredSkyPackageRuntimeBinding) {
  try {
    const value: unknown = JSON.parse(row.bindingJson);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const binding = value as SkyPackageRuntimeBinding;
    return binding.bindingId === row.bindingId && binding.providerId === row.providerId &&
      binding.keyId === row.keyId && binding.agentOrigin === row.agentOrigin &&
      binding.packageKey === row.packageKey && binding.manifestSha256 === row.manifestSha256
      ? binding : null;
  } catch { return null; }
}
