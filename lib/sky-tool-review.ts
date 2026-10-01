import { SkySubmissionError } from './sky-submission.ts';
import type {
  SkyToolPackageStatus,
  StoredSkyToolPackage,
} from './sky-tool-package-store.ts';

type Database = Pick<D1Database, 'prepare' | 'batch'>;

export const SKY_REVIEW_CHECKS = [
  'sourcePinned',
  'rights',
  'license',
  'permissions',
  'privacy',
  'pricing',
  'sandbox',
  'outputQuality',
] as const;

export type SkyReviewDecision = 'verified' | 'rejected' | 'revoked';
export type SkyReviewChecks = Record<(typeof SKY_REVIEW_CHECKS)[number], true>;

export type SkyToolReviewInput = {
  packageKey: string;
  manifestSha256: string;
  decision: SkyReviewDecision;
  sourceRevision: string | null;
  sourceSha256: string | null;
  checks: Partial<SkyReviewChecks>;
  evidenceUrls: string[];
  notes: string;
  expiresAt: number | null;
};

export type SkyToolPackageReview = SkyToolReviewInput & {
  id: string;
  reviewerId: string;
  reviewedAt: number;
};

function exactObject(value: unknown, keys: readonly string[], label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new SkySubmissionError(`${label}の形式を確認してください。`);
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !keys.includes(key)))
    throw new SkySubmissionError(`${label}に未対応の項目があります。`);
  return result;
}

function text(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== 'string')
    throw new SkySubmissionError(`${label}を入力してください。`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max)
    throw new SkySubmissionError(`${label}を${min}〜${max}文字で入力してください。`);
  for (const character of normalized) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127)
      throw new SkySubmissionError(`${label}に制御文字は使用できません。`);
  }
  return normalized;
}

function optionalPinnedHash(value: unknown, label: string) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = text(value, label, 40, 64).toLowerCase();
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(normalized))
    throw new SkySubmissionError(`${label}は固定commitまたはSHA-256にしてください。`);
  return normalized;
}

function evidenceUrls(value: unknown) {
  if (!Array.isArray(value) || value.length > 12)
    throw new SkySubmissionError('審査証拠URLを確認してください。');
  return value.map((item) => {
    const raw = text(item, '審査証拠URL', 8, 500);
    try {
      const url = new URL(raw);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.hash
      )
        throw new Error('unsafe');
      return url.toString();
    } catch {
      throw new SkySubmissionError(
        '審査証拠URLは認証情報を含まないHTTPS URLにしてください。',
      );
    }
  });
}

export function parseSkyToolReview(
  value: unknown,
  now = Date.now(),
): SkyToolReviewInput {
  const root = exactObject(
    value,
    [
      'packageKey',
      'manifestSha256',
      'decision',
      'sourceRevision',
      'sourceSha256',
      'checks',
      'evidenceUrls',
      'notes',
      'expiresAt',
    ],
    '審査記録',
  );
  const packageKey = text(root.packageKey, 'Package ID', 7, 220);
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)+@[0-9]+\.[0-9]+\.[0-9]+$/.test(packageKey))
    throw new SkySubmissionError('Package IDを確認してください。');
  const manifestSha256 = text(root.manifestSha256, 'Manifest SHA-256', 64, 64);
  if (!/^[0-9a-f]{64}$/.test(manifestSha256))
    throw new SkySubmissionError('Manifest SHA-256を確認してください。');
  if (!['verified', 'rejected', 'revoked'].includes(root.decision as string))
    throw new SkySubmissionError('審査結果を確認してください。');
  const decision = root.decision as SkyReviewDecision;
  const checksInput = exactObject(root.checks ?? {}, SKY_REVIEW_CHECKS, '審査項目');
  const checks = Object.fromEntries(
    SKY_REVIEW_CHECKS.filter((key) => checksInput[key] === true).map((key) => [key, true]),
  ) as Partial<SkyReviewChecks>;
  const sourceRevision = optionalPinnedHash(root.sourceRevision, '固定source revision');
  const sourceSha256 = optionalPinnedHash(root.sourceSha256, 'Source SHA-256');
  const urls = evidenceUrls(root.evidenceUrls ?? []);
  const notes = text(root.notes, '審査メモ', 20, 2_000);
  const expiresAtValue = root.expiresAt;
  if (
    expiresAtValue !== null &&
    expiresAtValue !== undefined &&
    (typeof expiresAtValue !== 'number' ||
      !Number.isSafeInteger(expiresAtValue) ||
      expiresAtValue < now + 24 * 60 * 60 * 1000 ||
      expiresAtValue > now + 366 * 24 * 60 * 60 * 1000)
  )
    throw new SkySubmissionError('審査期限は24時間後から366日以内にしてください。');
  const expiresAt = typeof expiresAtValue === 'number' ? expiresAtValue : null;
  if (decision === 'verified') {
    if (!sourceRevision || !sourceSha256)
      throw new SkySubmissionError('検証済み公開には固定sourceとSHA-256が必要です。');
    if (SKY_REVIEW_CHECKS.some((key) => checks[key] !== true))
      throw new SkySubmissionError('検証済み公開には全審査項目の合格が必要です。');
    if (!urls.length)
      throw new SkySubmissionError('検証済み公開には審査証拠URLが必要です。');
  }
  return {
    packageKey,
    manifestSha256,
    decision,
    sourceRevision,
    sourceSha256,
    checks,
    evidenceUrls: urls,
    notes,
    expiresAt,
  };
}

const packageColumns =
  'package_key AS packageKey, manifest, manifest_sha256 AS manifestSha256, status, created_at AS createdAt, published_at AS publishedAt';

export function skyToolReviewStore(db: Database) {
  return {
    async review(
      reviewerId: string,
      input: SkyToolReviewInput,
      now = Date.now(),
    ): Promise<{ package: StoredSkyToolPackage; review: SkyToolPackageReview }> {
      const current = await db
        .prepare(
          `SELECT status FROM sky_tool_packages
           WHERE package_key = ? AND manifest_sha256 = ?`,
        )
        .bind(input.packageKey, input.manifestSha256)
        .first<{ status: SkyToolPackageStatus }>();
      if (!current)
        throw new SkySubmissionError('審査対象のTool Packageが見つかりません。', 404);
      const allowed =
        input.decision === 'verified'
          ? ['submitted', 'published_declared']
          : input.decision === 'rejected'
            ? ['submitted', 'published_declared']
            : ['verified'];
      if (!allowed.includes(current.status))
        throw new SkySubmissionError('現在の状態からこの審査結果へ変更できません。', 409);

      const id = crypto.randomUUID();
      const checksJson = JSON.stringify(input.checks);
      const evidenceJson = JSON.stringify(input.evidenceUrls);
      const results = await db.batch([
        db
          .prepare(
            `INSERT INTO sky_tool_package_reviews
             (id, package_key, manifest_sha256, reviewer_id, decision,
              source_revision, source_sha256, checks_json, evidence_json,
              notes, reviewed_at, expires_at)
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
             WHERE EXISTS (
               SELECT 1 FROM sky_tool_packages
               WHERE package_key = ? AND manifest_sha256 = ? AND status = ?
             )`,
          )
          .bind(
            id,
            input.packageKey,
            input.manifestSha256,
            reviewerId,
            input.decision,
            input.sourceRevision,
            input.sourceSha256,
            checksJson,
            evidenceJson,
            input.notes,
            now,
            input.expiresAt,
            input.packageKey,
            input.manifestSha256,
            current.status,
          ),
        db
          .prepare(
            `UPDATE sky_tool_packages
             SET status = ?, updated_at = ?,
                 published_at = CASE WHEN ? = 'verified' THEN COALESCE(published_at, ?) ELSE published_at END
             WHERE package_key = ? AND manifest_sha256 = ? AND status = ?
               AND EXISTS (
                 SELECT 1 FROM sky_tool_package_reviews WHERE id = ?
               )
             RETURNING ${packageColumns}`,
          )
          .bind(
            input.decision,
            now,
            input.decision,
            now,
            input.packageKey,
            input.manifestSha256,
            current.status,
            id,
          ),
      ]);
      const row = results[1].results[0] as {
        packageKey: string;
        manifest: string;
        manifestSha256: string;
        status: SkyToolPackageStatus;
        createdAt: number;
        publishedAt: number | null;
      } | undefined;
      if (Number(results[0].meta.changes ?? 0) !== 1 || !row)
        throw new SkySubmissionError('審査中に状態が変わりました。再読込してください。', 409);
      return {
        package: {
          ...row,
          manifest: JSON.parse(row.manifest),
          installable: row.status === 'verified' &&
            (input.expiresAt === null || input.expiresAt > now),
        },
        review: { id, reviewerId, reviewedAt: now, ...input },
      };
    },

    async list(packageKey?: string): Promise<SkyToolPackageReview[]> {
      const where = packageKey ? 'WHERE package_key = ?' : '';
      const statement = db.prepare(
        `SELECT id, package_key AS packageKey, manifest_sha256 AS manifestSha256,
                reviewer_id AS reviewerId, decision, source_revision AS sourceRevision,
                source_sha256 AS sourceSha256, checks_json AS checksJson,
                evidence_json AS evidenceJson, notes, reviewed_at AS reviewedAt,
                expires_at AS expiresAt
         FROM sky_tool_package_reviews ${where}
         ORDER BY reviewed_at DESC LIMIT 200`,
      );
      const rows = packageKey
        ? await statement.bind(packageKey).all<{
            id: string; packageKey: string; manifestSha256: string; reviewerId: string;
            decision: SkyReviewDecision; sourceRevision: string | null; sourceSha256: string | null;
            checksJson: string; evidenceJson: string; notes: string; reviewedAt: number; expiresAt: number | null;
          }>()
        : await statement.all<{
            id: string; packageKey: string; manifestSha256: string; reviewerId: string;
            decision: SkyReviewDecision; sourceRevision: string | null; sourceSha256: string | null;
            checksJson: string; evidenceJson: string; notes: string; reviewedAt: number; expiresAt: number | null;
          }>();
      return rows.results.map((row) => ({
        id: row.id,
        packageKey: row.packageKey,
        manifestSha256: row.manifestSha256,
        reviewerId: row.reviewerId,
        decision: row.decision,
        sourceRevision: row.sourceRevision,
        sourceSha256: row.sourceSha256,
        checks: JSON.parse(row.checksJson) as Partial<SkyReviewChecks>,
        evidenceUrls: JSON.parse(row.evidenceJson) as string[],
        notes: row.notes,
        reviewedAt: row.reviewedAt,
        expiresAt: row.expiresAt,
      }));
    },
  };
}
