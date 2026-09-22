import { SkySubmissionError } from './sky-submission.ts';
import type { SkyToolPackageStatus } from './sky-tool-package-store.ts';
import type { SkyToolPackage } from './sky-tool-package.ts';

type Database = Pick<D1Database, 'prepare'>;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_PATTERN = /^SKY(?:-[A-Z2-9]{4}){4}$/;

export type SkyActivationCode = {
  id: string;
  packageKey: string;
  label: string;
  maxUses: number;
  usedCount: number;
  status: 'active' | 'revoked';
  createdAt: number;
  expiresAt: number | null;
  revokedAt: number | null;
};

export type SkyTelegramTool = {
  packageKey: string;
  name: string;
  summary: string;
  version: string;
  connectionType: string;
  endpointUrl: string | null;
  sideEffects: string[];
  grantedAt: number;
  expiresAt: number | null;
};

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function codeHash(code: string) {
  return bytesToHex(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)),
  );
}

function randomCode() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const parts: string[] = [];
  for (let index = 0; index < bytes.length; index += 4) {
    let part = '';
    for (let offset = 0; offset < 4; offset += 1)
      part += CODE_ALPHABET[bytes[index + offset] % CODE_ALPHABET.length];
    parts.push(part);
  }
  return `SKY-${parts.join('-')}`;
}

export function normalizeSkyActivationCode(value: unknown) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

export function isSkyActivationCode(value: unknown): value is string {
  return CODE_PATTERN.test(normalizeSkyActivationCode(value));
}

function manifestFromRow(row: { manifest: string }) {
  return JSON.parse(row.manifest) as SkyToolPackage;
}

function packageInfo(row: {
  packageKey: string;
  manifest: string;
  status: SkyToolPackageStatus;
}) {
  const manifest = manifestFromRow(row);
  return {
    packageKey: row.packageKey,
    manifest,
    status: row.status,
  };
}

function validateTelegramIdentity(value: unknown, label: string) {
  if (
    (typeof value !== 'string' && typeof value !== 'number') ||
    !/^-?[0-9]{1,32}$/.test(String(value))
  )
    throw new SkySubmissionError(`${label}を確認してください。`);
  return String(value);
}

function activationStatus(row: {
  status: string;
  usedCount: number;
  maxUses: number;
  expiresAt: number | null;
  revokedAt: number | null;
}) {
  if (row.status !== 'active' || row.revokedAt != null)
    throw new SkySubmissionError('この有効化コードは停止されています。', 410);
  if (row.expiresAt != null && row.expiresAt <= Date.now())
    throw new SkySubmissionError('この有効化コードの期限が切れています。', 410);
  if (row.usedCount >= row.maxUses)
    throw new SkySubmissionError('この有効化コードは使用回数の上限に達しています。', 410);
}

export function skyActivationStore(db: Database) {
  return {
    async issue(
      userId: string,
      input: {
        packageKey: string;
        label: string;
        maxUses: number;
        expiresAt: number | null;
      },
    ) {
      const packageRow = await db
        .prepare(
          `SELECT package_key AS packageKey, manifest, status
           FROM sky_tool_packages
           WHERE package_key = ? AND user_id = ? AND status = 'verified'
             AND EXISTS (
               SELECT 1 FROM sky_tool_package_reviews r
               WHERE r.package_key = sky_tool_packages.package_key
                 AND r.manifest_sha256 = sky_tool_packages.manifest_sha256
                 AND r.decision = 'verified'
                 AND (r.expires_at IS NULL OR r.expires_at > ?)
             )`,
        )
        .bind(input.packageKey, userId, Date.now())
        .first<{ packageKey: string; manifest: string; status: SkyToolPackageStatus }>();
      if (!packageRow)
        throw new SkySubmissionError('有効な審査済みTool Packageが見つかりません。', 404);

      const code = randomCode();
      const id = crypto.randomUUID();
      const createdAt = Date.now();
      await db
        .prepare(
          `INSERT INTO sky_activation_codes
           (id, package_key, user_id, label, code_sha256, max_uses, used_count, status, created_at, expires_at, revoked_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, NULL)`,
        )
        .bind(
          id,
          input.packageKey,
          userId,
          input.label,
          await codeHash(code),
          input.maxUses,
          createdAt,
          input.expiresAt,
        )
        .run();
      return {
        id,
        code,
        package: packageInfo(packageRow),
        createdAt,
        expiresAt: input.expiresAt,
        maxUses: input.maxUses,
      };
    },

    async listOwner(userId: string): Promise<SkyActivationCode[]> {
      const rows = await db
        .prepare(
          `SELECT id, package_key AS packageKey, label, max_uses AS maxUses,
                  used_count AS usedCount, status, created_at AS createdAt,
                  expires_at AS expiresAt, revoked_at AS revokedAt
           FROM sky_activation_codes WHERE user_id = ?
           ORDER BY created_at DESC LIMIT 100`,
        )
        .bind(userId)
        .all<SkyActivationCode>();
      return rows.results;
    },

    async revoke(userId: string, id: string) {
      const result = await db
        .prepare(
          `UPDATE sky_activation_codes SET status = 'revoked', revoked_at = ?
           WHERE id = ? AND user_id = ? AND status = 'active'`,
        )
        .bind(Date.now(), id, userId)
        .run();
      return Number(result.meta.changes ?? 0) === 1;
    },

    async redeem(input: {
      code: string;
      telegramUserId: string;
      telegramChatId: string;
      botUsername?: string;
    }) {
      const telegramUserId = validateTelegramIdentity(
        input.telegramUserId,
        'Telegram利用者ID',
      );
      const telegramChatId = validateTelegramIdentity(
        input.telegramChatId,
        'TelegramチャットID',
      );
      const normalized = normalizeSkyActivationCode(input.code);
      if (!isSkyActivationCode(normalized))
        throw new SkySubmissionError('Sky有効化コードの形式を確認してください。');
      const row = await db
        .prepare(
          `SELECT c.id, c.package_key AS packageKey, c.status,
                  c.used_count AS usedCount, c.max_uses AS maxUses,
                  c.expires_at AS expiresAt, c.revoked_at AS revokedAt,
                  p.manifest, p.status AS packageStatus
           FROM sky_activation_codes c
           JOIN sky_tool_packages p ON p.package_key = c.package_key
           WHERE c.code_sha256 = ?`,
        )
        .bind(await codeHash(normalized))
        .first<{
          id: string;
          packageKey: string;
          status: string;
          usedCount: number;
          maxUses: number;
          expiresAt: number | null;
          revokedAt: number | null;
          manifest: string;
          packageStatus: SkyToolPackageStatus;
        }>();
      if (!row) throw new SkySubmissionError('有効化コードが見つかりません。', 404);

      if (row.packageStatus !== 'verified')
        throw new SkySubmissionError('このTool Packageは現在利用できません。', 410);
      const validReview = await db
        .prepare(
          `SELECT 1 FROM sky_tool_package_reviews
           WHERE package_key = ? AND manifest_sha256 = (
             SELECT manifest_sha256 FROM sky_tool_packages WHERE package_key = ?
           ) AND decision = 'verified'
             AND (expires_at IS NULL OR expires_at > ?)
           LIMIT 1`,
        )
        .bind(row.packageKey, row.packageKey, Date.now())
        .first();
      if (!validReview)
        throw new SkySubmissionError('このTool Packageの審査期限が切れています。', 410);

      const existing = await db
        .prepare(
          `SELECT id, granted_at AS grantedAt, expires_at AS expiresAt
           FROM sky_tool_grants
           WHERE package_key = ? AND telegram_user_id = ? AND status = 'active'`,
        )
        .bind(row.packageKey, telegramUserId)
        .first<{ id: string; grantedAt: number; expiresAt: number | null }>();
      if (existing)
        return {
          alreadyGranted: true,
          grantId: existing.id,
          package: packageInfo({
            packageKey: row.packageKey,
            manifest: row.manifest,
            status: row.packageStatus,
          }),
          grantedAt: existing.grantedAt,
          expiresAt: existing.expiresAt,
        };

      activationStatus(row);

      const grantId = crypto.randomUUID();
      const grantedAt = Date.now();
      const updated = await db
        .prepare(
          `UPDATE sky_activation_codes SET used_count = used_count + 1
           WHERE id = ? AND status = 'active' AND used_count < max_uses
             AND (expires_at IS NULL OR expires_at > ?)`,
        )
        .bind(row.id, grantedAt)
        .run();
      if (Number(updated.meta.changes ?? 0) !== 1)
        throw new SkySubmissionError('この有効化コードはすでに使用できません。', 409);

      try {
        await db
          .prepare(
            `INSERT INTO sky_tool_grants
             (id, package_key, activation_code_id, telegram_user_id, telegram_chat_id, bot_username, status, granted_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
          )
          .bind(
            grantId,
            row.packageKey,
            row.id,
            telegramUserId,
            telegramChatId,
            input.botUsername || null,
            grantedAt,
            row.expiresAt,
          )
          .run();
      } catch (error) {
        await db
          .prepare('UPDATE sky_activation_codes SET used_count = used_count - 1 WHERE id = ? AND used_count > 0')
          .bind(row.id)
          .run();
        throw error;
      }
      return {
        alreadyGranted: false,
        grantId,
        package: packageInfo({
          packageKey: row.packageKey,
          manifest: row.manifest,
          status: row.packageStatus,
        }),
        grantedAt,
        expiresAt: row.expiresAt,
      };
    },

    async listTelegramTools(telegramUserId: string): Promise<SkyTelegramTool[]> {
      const now = Date.now();
      const rows = await db
        .prepare(
          `SELECT g.package_key AS packageKey, p.manifest,
                  g.granted_at AS grantedAt, g.expires_at AS expiresAt
           FROM sky_tool_grants g
           JOIN sky_tool_packages p ON p.package_key = g.package_key
           WHERE g.telegram_user_id = ? AND g.status = 'active'
             AND p.status = 'verified'
             AND (g.expires_at IS NULL OR g.expires_at > ?)
             AND EXISTS (
               SELECT 1 FROM sky_tool_package_reviews r
               WHERE r.package_key = p.package_key
                 AND r.manifest_sha256 = p.manifest_sha256
                 AND r.decision = 'verified'
                 AND (r.expires_at IS NULL OR r.expires_at > ?)
             )
           ORDER BY g.granted_at DESC LIMIT 100`,
        )
        .bind(telegramUserId, now, now)
        .all<{ packageKey: string; manifest: string; grantedAt: number; expiresAt: number | null }>();
      return rows.results.map((row) => {
        const manifest = manifestFromRow(row);
        return {
          packageKey: row.packageKey,
          name: manifest.name,
          summary: manifest.summary,
          version: manifest.version,
          connectionType: manifest.adapter.connectionType,
          endpointUrl: manifest.adapter.endpointUrl,
          sideEffects: manifest.capabilities.sideEffects,
          grantedAt: row.grantedAt,
          expiresAt: row.expiresAt,
        };
      });
    },
  };
}
