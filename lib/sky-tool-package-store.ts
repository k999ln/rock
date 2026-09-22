import {
  canonicalSkyToolPackage,
  skyToolPackageKey,
  skyToolPackageSha256,
  type SkyToolPackage,
} from './sky-tool-package.ts';

type Database = Pick<D1Database, 'prepare'>;

export type SkyToolPackageStatus =
  | 'submitted'
  | 'published_declared'
  | 'verified'
  | 'rejected'
  | 'revoked';

export type StoredSkyToolPackage = {
  packageKey: string;
  manifest: SkyToolPackage;
  manifestSha256: string;
  status: SkyToolPackageStatus;
  installable: boolean;
  createdAt: number;
  publishedAt: number | null;
};

function stored(row: {
  packageKey: string;
  manifest: string;
  manifestSha256: string;
  status: SkyToolPackageStatus;
  createdAt: number;
  publishedAt: number | null;
  reviewValid?: number;
}): StoredSkyToolPackage {
  return {
    packageKey: row.packageKey,
    manifest: JSON.parse(row.manifest) as SkyToolPackage,
    manifestSha256: row.manifestSha256,
    status: row.status,
    installable: row.status === 'verified' && row.reviewValid === 1,
    createdAt: row.createdAt,
    publishedAt: row.publishedAt,
  };
}

export function skyToolPackageStore(db: Database) {
  return {
    async create(
      userId: string,
      manifest: SkyToolPackage,
    ): Promise<StoredSkyToolPackage | null> {
      const packageKey = skyToolPackageKey(manifest);
      const manifestSha256 = await skyToolPackageSha256(manifest);
      const createdAt = Date.now();
      const result = await db
        .prepare(
          `INSERT OR IGNORE INTO sky_tool_packages
          (package_key, tool_id, version, user_id, manifest, manifest_sha256, status, created_at, updated_at, published_at)
          VALUES (?, ?, ?, ?, ?, ?, 'submitted', ?, ?, NULL)
          RETURNING package_key`,
        )
        .bind(
          packageKey,
          manifest.id,
          manifest.version,
          userId,
          canonicalSkyToolPackage(manifest),
          manifestSha256,
          createdAt,
          createdAt,
        )
        .all();
      return result.results.length
        ? {
            packageKey,
            manifest,
            manifestSha256,
            status: 'submitted',
            installable: false,
            createdAt,
            publishedAt: null,
          }
        : null;
    },

    async listOwner(userId: string): Promise<StoredSkyToolPackage[]> {
      const now = Date.now();
      const rows = await db
        .prepare(
          `SELECT package_key AS packageKey, manifest, manifest_sha256 AS manifestSha256,
                  status, created_at AS createdAt, published_at AS publishedAt,
                  EXISTS (
                    SELECT 1 FROM sky_tool_package_reviews r
                    WHERE r.package_key = sky_tool_packages.package_key
                      AND r.manifest_sha256 = sky_tool_packages.manifest_sha256
                      AND r.decision = 'verified'
                      AND (r.expires_at IS NULL OR r.expires_at > ?)
                  ) AS reviewValid
           FROM sky_tool_packages WHERE user_id = ?
           ORDER BY created_at DESC LIMIT 100`,
        )
        .bind(now, userId)
        .all<{
          packageKey: string;
          manifest: string;
          manifestSha256: string;
          status: SkyToolPackageStatus;
          createdAt: number;
          publishedAt: number | null;
          reviewValid: number;
        }>();
      return rows.results.map(stored);
    },

    async publishDeclared(
      userId: string,
      packageKey: string,
      expectedSha256: string,
    ): Promise<StoredSkyToolPackage | null> {
      const publishedAt = Date.now();
      const result = await db
        .prepare(
          `UPDATE sky_tool_packages
           SET status = 'published_declared', updated_at = ?, published_at = ?
           WHERE package_key = ? AND user_id = ? AND manifest_sha256 = ? AND status = 'submitted'
           RETURNING package_key AS packageKey, manifest, manifest_sha256 AS manifestSha256,
                     status, created_at AS createdAt, published_at AS publishedAt`,
        )
        .bind(
          publishedAt,
          publishedAt,
          packageKey,
          userId,
          expectedSha256,
        )
        .all<{
          packageKey: string;
          manifest: string;
          manifestSha256: string;
          status: SkyToolPackageStatus;
          createdAt: number;
          publishedAt: number | null;
        }>();
      const row = result.results[0];
      return row ? stored(row) : null;
    },

    async listRegistry(): Promise<StoredSkyToolPackage[]> {
      const now = Date.now();
      const rows = await db
        .prepare(
          `SELECT package_key AS packageKey, manifest, manifest_sha256 AS manifestSha256,
                  status, created_at AS createdAt, published_at AS publishedAt,
                  1 AS reviewValid
           FROM sky_tool_packages
           WHERE status = 'verified'
             AND EXISTS (
               SELECT 1 FROM sky_tool_package_reviews r
               WHERE r.package_key = sky_tool_packages.package_key
                 AND r.manifest_sha256 = sky_tool_packages.manifest_sha256
                 AND r.decision = 'verified'
                 AND (r.expires_at IS NULL OR r.expires_at > ?)
             )
           ORDER BY published_at DESC LIMIT 200`,
        )
        .bind(now)
        .all<{
          packageKey: string;
          manifest: string;
          manifestSha256: string;
          status: SkyToolPackageStatus;
          createdAt: number;
          publishedAt: number | null;
          reviewValid: number;
        }>();
      return rows.results.map(stored);
    },
  };
}
