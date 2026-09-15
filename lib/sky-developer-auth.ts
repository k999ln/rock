type Database = Pick<D1Database, 'prepare'>;

export type SkyDeveloperToken = {
  id: string;
  label: string;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
};

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function tokenHash(token: string) {
  return bytesToHex(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
  );
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const encoded = btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
  return `sky_dev_${encoded}`;
}

export function skyDeveloperTokenStore(db: Database) {
  return {
    async create(userId: string, label: string) {
      const token = randomToken();
      const hash = await tokenHash(token);
      const id = crypto.randomUUID();
      const createdAt = Date.now();
      await db
        .prepare(
          `INSERT INTO sky_developer_tokens
           (id, user_id, label, token_sha256, created_at, last_used_at, revoked_at)
           VALUES (?, ?, ?, ?, ?, NULL, NULL)`,
        )
        .bind(id, userId, label, hash, createdAt)
        .run();
      return { id, token, label, createdAt };
    },

    async list(userId: string): Promise<SkyDeveloperToken[]> {
      const rows = await db
        .prepare(
          `SELECT id, label, created_at AS createdAt, last_used_at AS lastUsedAt,
                  revoked_at AS revokedAt
           FROM sky_developer_tokens WHERE user_id = ?
           ORDER BY created_at DESC LIMIT 20`,
        )
        .bind(userId)
        .all<SkyDeveloperToken>();
      return rows.results;
    },

    async revoke(userId: string, id: string) {
      const result = await db
        .prepare(
          `UPDATE sky_developer_tokens SET revoked_at = ?
           WHERE id = ? AND user_id = ? AND revoked_at IS NULL`,
        )
        .bind(Date.now(), id, userId)
        .run();
      return Number(result.meta.changes ?? 0) === 1;
    },

    async authenticate(token: string) {
      const hash = await tokenHash(token);
      const row = await db
        .prepare(
          `SELECT id, user_id AS userId FROM sky_developer_tokens
           WHERE token_sha256 = ? AND revoked_at IS NULL`,
        )
        .bind(hash)
        .first<{ id: string; userId: string }>();
      if (!row) throw new Error('UNAUTHORIZED');
      await db
        .prepare('UPDATE sky_developer_tokens SET last_used_at = ? WHERE id = ?')
        .bind(Date.now(), row.id)
        .run();
      return row.userId;
    },
  };
}

export async function requestDeveloperUser(request: Request, db: Database) {
  const authorization = request.headers.get('authorization');
  if (authorization?.startsWith('Bearer sky_dev_'))
    return skyDeveloperTokenStore(db).authenticate(authorization.slice(7));
  const { requestUser } = await import('./fund-store.ts');
  return requestUser(request);
}
