import { SkySocialError, socialId } from './sky-social.ts';
export type CommunityKeys = Record<string, string>;
type DB = Pick<D1Database, 'prepare'>;
export async function communityKeyHash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
export function communitySecret(value: unknown) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    throw new SkySocialError('256bitの専用鍵を確認してください。');
  return value;
}
export function communityKeysHeader(request: Request): CommunityKeys {
  const raw = request.headers.get('x-rock-community-keys');
  if (!raw) return {};
  try {
    if (raw.length > 14000) throw new Error();
    const v = JSON.parse(raw);
    if (
      !v ||
      typeof v !== 'object' ||
      Array.isArray(v) ||
      Object.keys(v).length > 100
    )
      throw new Error();
    for (const [id, key] of Object.entries(v)) {
      socialId(id);
      communitySecret(key);
    }
    return v as CommunityKeys;
  } catch {
    throw new SkySocialError('専用鍵の形式を確認してください。');
  }
}
export async function unlockedCommunities(
  db: DB,
  profileId: string,
  keys: CommunityKeys,
): Promise<string[]> {
  const hashes = Object.fromEntries(
    await Promise.all(
      Object.entries(keys).map(async ([id, key]) => [
        socialId(id),
        await communityKeyHash(communitySecret(key)),
      ]),
    ),
  );
  const rows = await db
    .prepare(
      `SELECT k.community_id FROM sky_community_keys k JOIN json_each(?) supplied ON supplied.key=k.community_id AND supplied.value=k.key_hash JOIN sky_community_members m ON m.community_id=k.community_id AND m.profile_id=k.profile_id JOIN sky_communities c ON c.id=k.community_id WHERE k.profile_id=? AND k.revoked_at=0 AND c.archived_at=0`,
    )
    .bind(JSON.stringify(hashes), profileId)
    .all<{ community_id: string }>();
  return rows.results.map((r) => r.community_id);
}
export async function requireCommunityKey(
  db: DB,
  owner: string,
  id: string,
  keys: CommunityKeys,
  creator = false,
) {
  socialId(id);
  const p = await db
    .prepare('SELECT id FROM sky_social_profiles WHERE owner_id=?')
    .bind(owner)
    .first<{ id: string }>();
  if (!p || !(await unlockedCommunities(db, p.id, keys)).includes(id))
    throw new SkySocialError('このコミュニティーの専用鍵が必要です。', 403);
  const c = await db
    .prepare(
      'SELECT id,owner_id,name,rules,os_revision FROM sky_communities WHERE id=? AND archived_at=0',
    )
    .bind(id)
    .first<{
      id: string;
      owner_id: string;
      name: string;
      rules: string;
      os_revision: number;
    }>();
  if (!c || (creator && c.owner_id !== owner))
    throw new SkySocialError('作成者の操作が必要です。', 403);
  return { community: c, profileId: p.id };
}
