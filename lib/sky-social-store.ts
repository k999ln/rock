import {
  communityKeyHash,
  communitySecret,
  unlockedCommunities,
  type CommunityKeys,
} from './community-access.ts';
import { catalog } from './catalog.ts';
import {
  SkySocialError,
  socialId,
  socialText,
  socialObject,
  socialAttachment,
  type SkyCommunity,
  type SkySocialProfile,
  type SkySocialPost,
  type SkySocialState,
} from './sky-social.ts';
type DB = Pick<D1Database, 'prepare' | 'batch'>;
type CommunityRow = {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  rules: string;
  visibility: 'public' | 'members';
  invite_hash: string | null;
  archived_at: number;
  member: number;
  members: number;
  recovery_hash: string | null;
  os_revision: number;
  post_mode: string;
};
type PostRow = {
  id: string;
  author_id: string;
  name: string;
  community_id: string | null;
  community_name: string | null;
  content: string;
  attachment: string | null;
  created_at: number;
  following: number;
  affinity: number;
  reply_to: string | null;
  replies: number;
  likes: number;
  reposts: number;
  liked: number;
  reposted: number;
  bookmarked: number;
};
async function digest(token: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
export function skySocialStore(
  db: DB,
  owner: string,
  keys: CommunityKeys = {},
) {
  const profile = () =>
    db
      .prepare('SELECT id,name FROM sky_social_profiles WHERE owner_id=?')
      .bind(owner)
      .first<SkySocialProfile>();
  async function requireProfile() {
    const p = await profile();
    if (!p)
      throw new SkySocialError(
        '公開名を設定すると、投稿やコミュニティーを作れます。',
        409,
      );
    return p;
  }
  async function community(id: string, p: SkySocialProfile) {
    return db
      .prepare(
        `SELECT c.*,EXISTS(SELECT 1 FROM sky_community_members WHERE community_id=c.id AND profile_id=?) AS member,(SELECT COUNT(*) FROM sky_community_members WHERE community_id=c.id) AS members FROM sky_communities c WHERE c.id=? AND c.archived_at=0`,
      )
      .bind(p.id, socialId(id))
      .first<CommunityRow>();
  }
  function communityView(c: CommunityRow, unlocked = false): SkyCommunity {
    return {
      id: c.id,
      name: c.name,
      description: unlocked ? c.description : '専用鍵で参加するコミュニティー',
      rules: unlocked ? c.rules : '',
      visibility: 'members',
      member: Boolean(c.member),
      owned: c.owner_id === owner,
      members: unlocked ? c.members : 0,
      unlocked,
      bootstrap: c.owner_id === owner && !c.recovery_hash,
      rulesVersion: c.os_revision,
    };
  }
  async function access(id: string, p: SkySocialProfile) {
    if (!(await unlockedCommunities(db, p.id, keys)).includes(id))
      throw new SkySocialError('このコミュニティーの専用鍵が必要です。', 403);
  }
  // The viewer is bound once. Counts and private bookmark flags are only returned
  // after the post's community has passed the current account + key check.
  const visibleSql = `SELECT s.*,a.name,c.name AS community_name,
    EXISTS(SELECT 1 FROM sky_social_follows f WHERE f.follower_id=viewer.id AND f.following_id=s.author_id) AS following,
    EXISTS(SELECT 1 FROM sky_community_members m WHERE m.community_id=s.community_id AND m.profile_id=viewer.id) AS joined,
    EXISTS(SELECT 1 FROM sky_social_reactions r JOIN sky_social_follows f ON f.following_id=r.profile_id WHERE r.post_id=s.id AND r.kind='repost' AND f.follower_id=viewer.id) AS followed_repost,
    (SELECT COUNT(*) FROM sky_social_posts r WHERE r.reply_to=s.id) AS replies,
    (SELECT COUNT(*) FROM sky_social_reactions r WHERE r.post_id=s.id AND r.kind='like') AS likes,
    (SELECT COUNT(*) FROM sky_social_reactions r WHERE r.post_id=s.id AND r.kind='repost') AS reposts,
    EXISTS(SELECT 1 FROM sky_social_reactions r WHERE r.post_id=s.id AND r.profile_id=viewer.id AND r.kind='like') AS liked,
    EXISTS(SELECT 1 FROM sky_social_reactions r WHERE r.post_id=s.id AND r.profile_id=viewer.id AND r.kind='repost') AS reposted,
    EXISTS(SELECT 1 FROM sky_social_reactions r WHERE r.post_id=s.id AND r.profile_id=viewer.id AND r.kind='bookmark') AS bookmarked
    FROM sky_social_posts s CROSS JOIN (SELECT ? AS id) viewer
    JOIN sky_social_profiles a ON a.id=s.author_id LEFT JOIN sky_communities c ON c.id=s.community_id
    WHERE (s.community_id IS NULL OR (c.archived_at=0 AND c.id IN (SELECT value FROM json_each(?))))`;
  function postView(r: PostRow, p: SkySocialProfile): SkySocialPost {
    return {
      id: r.id,
      author: { id: r.author_id, name: r.name },
      mine: r.author_id === p.id,
      following: Boolean(r.following),
      community: r.community_id
        ? { id: r.community_id, name: r.community_name! }
        : null,
      content: r.content,
      attachment: r.attachment ? JSON.parse(r.attachment) : null,
      createdAt: r.created_at,
      replyTo: r.reply_to,
      replies: r.replies,
      likes: r.likes,
      reposts: r.reposts,
      liked: Boolean(r.liked),
      reposted: Boolean(r.reposted),
      bookmarked: Boolean(r.bookmarked),
      reason:
        r.author_id === p.id
          ? '自分の投稿'
          : r.following
            ? 'フォロー中の人'
            : r.affinity % 2 === 1
              ? '参加コミュニティー'
              : 'Skyの新しい投稿',
    };
  }
  async function visiblePost(
    id: string,
    p: SkySocialProfile,
    allowed?: string[],
  ) {
    const row = await db
      .prepare(`${visibleSql} AND s.id=?`)
      .bind(
        p.id,
        JSON.stringify(allowed ?? (await unlockedCommunities(db, p.id, keys))),
        socialId(id),
      )
      .first<PostRow>();
    if (!row)
      throw new SkySocialError('投稿が見つからないか、専用鍵が必要です。', 404);
    return row;
  }
  async function state(
    mode = 'recommended',
    communityId = '',
    cursor = '',
    threadId = '',
  ): Promise<SkySocialState> {
    if (!['recommended', 'following', 'bookmarks'].includes(mode))
      throw new SkySocialError('タイムラインの種類を確認してください。');
    const p = await profile();
    if (!p)
      return {
        profile: null,
        communities: [],
        posts: [],
        cursor: null,
        thread: null,
      };
    const allowed = await unlockedCommunities(db, p.id, keys);
    if (communityId && !allowed.includes(communityId))
      throw new SkySocialError('このコミュニティーの専用鍵が必要です。', 403);
    let after: [number, number, string] | null = null;
    if (cursor) {
      try {
        if (cursor.length > 160) throw new Error();
        const v = JSON.parse(cursor);
        if (
          !Array.isArray(v) ||
          v.length !== 3 ||
          !Number.isSafeInteger(v[0]) ||
          !Number.isSafeInteger(v[1])
        )
          throw new Error();
        after = [v[0], v[1], socialId(v[2])];
      } catch {
        throw new SkySocialError('続きの位置を確認してください。');
      }
    }
    const communities = await db
      .prepare(
        `SELECT c.*,EXISTS(SELECT 1 FROM sky_community_members m WHERE m.community_id=c.id AND m.profile_id=?) AS member,(SELECT COUNT(*) FROM sky_community_members WHERE community_id=c.id) AS members FROM sky_communities c WHERE archived_at=0 AND (owner_id=? OR EXISTS(SELECT 1 FROM sky_community_members m WHERE m.community_id=c.id AND m.profile_id=?)) ORDER BY member DESC,created_at DESC,id DESC LIMIT 100`,
      )
      .bind(p.id, owner, p.id)
      .all<CommunityRow>();
    let thread: PostRow | null = null;
    if (threadId) {
      thread = await visiblePost(threadId, p, allowed);
      if (thread.reply_to)
        thread = await visiblePost(thread.reply_to, p, allowed);
    }
    const args: unknown[] = [p.id, JSON.stringify(allowed)];
    let filter = thread
      ? ' AND s.reply_to=?'
      : mode === 'bookmarks'
        ? ''
        : ' AND s.reply_to IS NULL';
    if (thread) args.push(thread.id);
    if (communityId) {
      filter += ' AND s.community_id=?';
      args.push(communityId);
    }
    const affinity =
      mode === 'recommended' && !thread ? 'following*2+joined' : '0';
    const selection = thread
      ? ''
      : mode === 'following'
        ? 'WHERE following=1 OR joined=1 OR followed_repost=1 OR author_id=?'
        : mode === 'bookmarks'
          ? 'WHERE bookmarked=1'
          : '';
    if (mode === 'following' && !thread) args.push(p.id);
    if (after) args.push(...after);
    const rows = await db
      .prepare(
        `WITH visible AS (${visibleSql}${filter}),ranked AS (SELECT *,${affinity} AS affinity FROM visible ${selection}) SELECT * FROM ranked ${after ? 'WHERE (affinity,created_at,id)<(?,?,?)' : ''} ORDER BY affinity DESC,created_at DESC,id DESC LIMIT 21`,
      )
      .bind(...args)
      .all<PostRow>();
    const page = rows.results.slice(0, 20),
      last = page.at(-1);
    return {
      profile: p,
      communities: communities.results.map((c) =>
        communityView(c, allowed.includes(c.id)),
      ),
      posts: page.map((r) => postView(r, p)),
      cursor:
        rows.results.length > 20 && last
          ? JSON.stringify([last.affinity, last.created_at, last.id])
          : null,
      thread: thread ? postView(thread, p) : null,
    };
  }
  async function mutate(raw: unknown) {
    const input = socialObject(raw, [
      'action',
      'id',
      'name',
      'description',
      'rules',
      'visibility',
      'content',
      'attachment',
      'communityId',
      'targetId',
      'enabled',
      'confirmRules',
      'token',
      'accessKey',
      'recoveryKey',
      'rulesVersion',
      'reaction',
      'replyTo',
    ]);
    const action = input.action;
    if (action === 'profile') {
      const name = socialText(input.name, 60),
        id = crypto.randomUUID();
      await db
        .prepare(
          'INSERT INTO sky_social_profiles(id,owner_id,name,created_at) VALUES(?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET name=excluded.name',
        )
        .bind(id, owner, name, Date.now())
        .run();
      return { profile: await profile() };
    }
    const p = await requireProfile(),
      now = Date.now();
    if (action === 'reaction') {
      const id = socialId(input.id),
        kind = input.reaction;
      if (
        !['like', 'bookmark', 'repost'].includes(String(kind)) ||
        typeof input.enabled !== 'boolean'
      )
        throw new SkySocialError('リアクションを確認してください。');
      const target = await visiblePost(id, p);
      if (input.enabled) {
        const keyHash = target.community_id
          ? await communityKeyHash(keys[target.community_id])
          : null;
        const r = await db
          .prepare(
            `INSERT INTO sky_social_reactions(profile_id,post_id,kind,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM sky_social_posts WHERE id=?) AND (? IS NULL OR EXISTS(SELECT 1 FROM sky_communities c JOIN sky_community_members m ON m.community_id=c.id JOIN sky_community_keys k ON k.community_id=c.id AND k.profile_id=m.profile_id WHERE c.id=? AND c.archived_at=0 AND m.profile_id=? AND k.key_hash=? AND k.revoked_at=0)) ON CONFLICT DO NOTHING`,
          )
          .bind(
            p.id,
            id,
            kind,
            now,
            id,
            target.community_id,
            target.community_id,
            p.id,
            keyHash,
          )
          .run();
        if (
          !r.meta.changes &&
          !(await db
            .prepare(
              'SELECT 1 FROM sky_social_reactions WHERE profile_id=? AND post_id=? AND kind=?',
            )
            .bind(p.id, id, kind)
            .first())
        )
          throw new SkySocialError('投稿または参加状態が更新されました。', 409);
      } else
        await db
          .prepare(
            'DELETE FROM sky_social_reactions WHERE profile_id=? AND post_id=? AND kind=?',
          )
          .bind(p.id, id, kind)
          .run();
      return { ok: true, post: postView(await visiblePost(id, p), p) };
    }
    if (action === 'createCommunity') {
      const id = socialId(input.id),
        name = socialText(input.name, 60),
        description = socialText(input.description, 300, true),
        rules = socialText(input.rules, 500);
      const accessHash = await communityKeyHash(
          communitySecret(input.accessKey),
        ),
        recoveryHash = await communityKeyHash(
          communitySecret(input.recoveryKey),
        );
      const prior = await community(id, p);
      if (prior) {
        if (
          prior.owner_id !== owner ||
          prior.name !== name ||
          prior.description !== description ||
          prior.rules !== rules
        )
          throw new SkySocialError(
            '同じIDで別のコミュニティーが作られています。',
            409,
          );
        if (
          !(
            await unlockedCommunities(db, p.id, {
              [id]: communitySecret(input.accessKey),
            })
          ).includes(id)
        )
          throw new SkySocialError('専用鍵を確認してください。', 403);
        return { community: communityView(prior, true) };
      }
      const result = await db.batch([
        db
          .prepare(
            'INSERT INTO sky_communities(id,owner_id,name,description,rules,visibility,recovery_hash,created_at) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM sky_communities WHERE owner_id=? AND archived_at=0)<50 ON CONFLICT(id) DO NOTHING',
          )
          .bind(
            id,
            owner,
            name,
            description,
            rules,
            'members',
            recoveryHash,
            now,
            owner,
          ),
        db
          .prepare(
            'INSERT INTO sky_community_members(community_id,profile_id,joined_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM sky_communities WHERE id=? AND owner_id=? AND archived_at=0) ON CONFLICT DO NOTHING',
          )
          .bind(id, p.id, now, id, owner),
        db
          .prepare(
            'INSERT INTO sky_community_keys(community_id,profile_id,key_hash,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM sky_communities WHERE id=? AND owner_id=? AND recovery_hash=?) ON CONFLICT DO NOTHING',
          )
          .bind(id, p.id, accessHash, now, id, owner, recoveryHash),
      ]);
      if (result[0].meta.changes !== 1)
        throw new SkySocialError(
          '作成上限または更新の競合です。再読み込みしてください。',
          409,
        );
      return { community: communityView((await community(id, p))!, true) };
    }
    if (
      [
        'join',
        'leave',
        'invite',
        'previewInvite',
        'archiveCommunity',
        'removeMember',
        'bootstrapKey',
        'recoverKey',
        'allowMember',
      ].includes(String(action))
    ) {
      const id = socialId(input.id),
        c = await community(id, p);
      if (!c) throw new SkySocialError('コミュニティーが見つかりません。', 404);
      const isOwner = c.owner_id === owner;
      if (action === 'bootstrapKey' || action === 'recoverKey') {
        if (!isOwner) throw new SkySocialError('作成者の鍵が必要です。', 403);
        const accessHash = await communityKeyHash(
            communitySecret(input.accessKey),
          ),
          recoveryHash = await communityKeyHash(
            communitySecret(input.recoveryKey),
          );
        if (
          action === 'recoverKey' &&
          (!c.recovery_hash ||
            typeof input.token !== 'string' ||
            (await communityKeyHash(input.token)) !== c.recovery_hash)
        )
          throw new SkySocialError('管理者の復旧鍵を確認してください。', 403);
        if (action === 'bootstrapKey' && c.recovery_hash)
          throw new SkySocialError(
            '発行済みです。専用鍵か管理者の復旧鍵を読み込んでください。',
            403,
          );
        const issued = await db.batch([
          db
            .prepare(
              'UPDATE sky_communities SET recovery_hash=? WHERE id=? AND owner_id=? AND recovery_hash IS ?',
            )
            .bind(recoveryHash, id, owner, c.recovery_hash),
          db
            .prepare(
              'INSERT INTO sky_community_keys(community_id,profile_id,key_hash,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM sky_communities WHERE id=? AND recovery_hash=?) ON CONFLICT(community_id,profile_id) DO UPDATE SET key_hash=excluded.key_hash,revoked_at=0',
            )
            .bind(id, p.id, accessHash, now, id, recoveryHash),
        ]);
        if (!issued[0].meta.changes)
          throw new SkySocialError(
            '鍵の状態が更新されました。再読み込みしてください。',
            409,
          );
        return { ok: true };
      }
      if (!['join', 'previewInvite'].includes(String(action)))
        await access(id, p);

      if (action === 'invite') {
        if (!isOwner)
          throw new SkySocialError('作成者だけが招待を発行できます。', 403);
        const token = Array.from(
          crypto.getRandomValues(new Uint8Array(32)),
          (b) => b.toString(16).padStart(2, '0'),
        ).join('');
        await db
          .prepare(
            'UPDATE sky_communities SET invite_hash=? WHERE id=? AND owner_id=? AND archived_at=0',
          )
          .bind(await digest(token), id, owner)
          .run();
        return { invite: { id, token } };
      }
      if (action === 'archiveCommunity') {
        if (!isOwner)
          throw new SkySocialError('作成者だけが終了できます。', 403);
        await db.batch([
          db
            .prepare(
              'DELETE FROM sky_social_reactions WHERE post_id IN (SELECT id FROM sky_social_posts WHERE community_id=?)',
            )
            .bind(id),
          db
            .prepare(
              'UPDATE sky_communities SET archived_at=?,invite_hash=NULL WHERE id=? AND owner_id=?',
            )
            .bind(now, id, owner),
          db
            .prepare('DELETE FROM sky_social_posts WHERE community_id=?')
            .bind(id),
          db
            .prepare('DELETE FROM sky_community_members WHERE community_id=?')
            .bind(id),
          db
            .prepare(
              'UPDATE sky_community_keys SET revoked_at=? WHERE community_id=?',
            )
            .bind(now, id),
        ]);
        return { ok: true };
      }
      if (action === 'leave') {
        if (isOwner)
          throw new SkySocialError(
            '作成者はコミュニティーを終了してください。',
            409,
          );
        await db.batch([
          db
            .prepare(
              'DELETE FROM sky_community_members WHERE community_id=? AND profile_id=?',
            )
            .bind(id, p.id),
          db
            .prepare(
              "UPDATE sky_community_keys SET key_hash='' WHERE community_id=? AND profile_id=?",
            )
            .bind(id, p.id),
        ]);
        return { ok: true };
      }
      if (action === 'removeMember') {
        if (!isOwner)
          throw new SkySocialError('作成者だけが参加を解除できます。', 403);
        const target = socialId(input.targetId);
        if (target === p.id)
          throw new SkySocialError('作成者は解除できません。');
        await db.batch([
          db
            .prepare(
              'DELETE FROM sky_community_members WHERE community_id=? AND profile_id=?',
            )
            .bind(id, target),
          db
            .prepare(
              'UPDATE sky_community_keys SET revoked_at=? WHERE community_id=? AND profile_id=?',
            )
            .bind(now, id, target),
        ]);
        return { ok: true };
      }
      if (action === 'allowMember') {
        if (!isOwner)
          throw new SkySocialError('作成者だけが再参加を許可できます。', 403);
        await db
          .prepare(
            "UPDATE sky_community_keys SET revoked_at=0,key_hash='' WHERE community_id=? AND profile_id=?",
          )
          .bind(id, socialId(input.targetId))
          .run();
        return { ok: true };
      }
      const revoked = await db
        .prepare(
          'SELECT revoked_at FROM sky_community_keys WHERE community_id=? AND profile_id=?',
        )
        .bind(id, p.id)
        .first<{ revoked_at: number }>();
      if (revoked?.revoked_at)
        throw new SkySocialError('管理者による再参加の許可が必要です。', 403);
      const validInvite = Boolean(
        typeof input.token === 'string' &&
        input.token.length <= 100 &&
        c.invite_hash &&
        (await digest(input.token)) === c.invite_hash,
      );
      if (!validInvite) throw new SkySocialError('有効な招待が必要です。', 403);
      if (action === 'previewInvite')
        return { community: communityView(c, true) };
      if (input.confirmRules !== true || input.rulesVersion !== c.os_revision)
        throw new SkySocialError(
          '最新のルールを確認して参加してください。',
          409,
        );
      const accessHash = await communityKeyHash(
        communitySecret(input.accessKey),
      );
      const joined = await db.batch([
        db
          .prepare(
            'INSERT INTO sky_community_members(community_id,profile_id,joined_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM sky_communities WHERE id=? AND archived_at=0 AND invite_hash=? AND os_revision=? AND NOT EXISTS(SELECT 1 FROM sky_community_keys k WHERE k.community_id=sky_communities.id AND k.profile_id=? AND k.revoked_at>0)) ON CONFLICT DO NOTHING',
          )
          .bind(id, p.id, now, id, c.invite_hash, c.os_revision, p.id),
        db
          .prepare(
            'INSERT INTO sky_community_keys(community_id,profile_id,key_hash,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM sky_community_members m JOIN sky_communities c ON c.id=m.community_id WHERE m.community_id=? AND m.profile_id=? AND c.invite_hash=? AND c.os_revision=? AND c.archived_at=0 AND NOT EXISTS(SELECT 1 FROM sky_community_keys k WHERE k.community_id=c.id AND k.profile_id=m.profile_id AND k.revoked_at>0)) ON CONFLICT(community_id,profile_id) DO UPDATE SET key_hash=excluded.key_hash,revoked_at=0',
          )
          .bind(
            id,
            p.id,
            accessHash,
            now,
            id,
            p.id,
            c.invite_hash,
            c.os_revision,
          ),
      ]);
      if (!joined[1].meta.changes)
        throw new SkySocialError(
          '招待かルールが更新されました。確認し直してください。',
          409,
        );
      return { ok: true };
    }
    if (action === 'follow') {
      const target = socialId(input.targetId);
      if (target === p.id || typeof input.enabled !== 'boolean')
        throw new SkySocialError('フォロー先を確認してください。');
      if (
        !(await db
          .prepare('SELECT id FROM sky_social_profiles WHERE id=?')
          .bind(target)
          .first())
      )
        throw new SkySocialError('アカウントが見つかりません。', 404);
      if (input.enabled) {
        await db
          .prepare(
            'INSERT INTO sky_social_follows(follower_id,following_id,created_at) SELECT ?,?,? WHERE (SELECT COUNT(*) FROM sky_social_follows WHERE follower_id=?)<500 ON CONFLICT DO NOTHING',
          )
          .bind(p.id, target, now, p.id)
          .run();
        if (
          !(await db
            .prepare(
              'SELECT following_id FROM sky_social_follows WHERE follower_id=? AND following_id=?',
            )
            .bind(p.id, target)
            .first())
        )
          throw new SkySocialError('フォローは500人までです。', 409);
      } else
        await db
          .prepare(
            'DELETE FROM sky_social_follows WHERE follower_id=? AND following_id=?',
          )
          .bind(p.id, target)
          .run();
      return { ok: true };
    }
    if (action === 'post') {
      const id = socialId(input.id),
        content = socialText(input.content, 1000),
        attachment = socialAttachment(input.attachment),
        replyTo = input.replyTo ? socialId(input.replyTo) : null;
      let communityId = input.communityId ? socialId(input.communityId) : null;
      if (replyTo) {
        const parent = await visiblePost(replyTo, p);
        if (parent.reply_to)
          throw new SkySocialError('元の投稿へ返信してください。');
        if (communityId && communityId !== parent.community_id)
          throw new SkySocialError('返信先の場所を確認してください。');
        communityId = parent.community_id;
      }
      if (
        attachment?.kind === 'agent' &&
        !catalog.some((t) => t.id === attachment.resource)
      )
        throw new SkySocialError('公開カタログにあるToolを選んでください。');
      if (communityId) {
        await access(communityId, p);
        const c = await community(communityId, p);
        if (c?.post_mode === 'owner' && c.owner_id !== owner)
          throw new SkySocialError(
            'この場所の投稿は作成者に限定されています。',
            403,
          );
        if (!c?.member)
          throw new SkySocialError('参加してから投稿してください。', 403);
      }
      if (attachment?.kind === 'community-os') {
        const target = attachment.resource.split(':')[0];
        await access(target, p);
        if (
          !(await db
            .prepare(
              'SELECT version FROM sky_community_editions WHERE community_id=? AND version=?',
            )
            .bind(target, Number(attachment.resource.split(':')[1]))
            .first())
        )
          throw new SkySocialError('公開済みのOS構成を選んでください。');
      }
      const encoded = attachment ? JSON.stringify(attachment) : null;
      const prior = await db
        .prepare('SELECT * FROM sky_social_posts WHERE id=?')
        .bind(id)
        .first<PostRow>();
      if (prior) {
        if (
          prior.author_id !== p.id ||
          prior.content !== content ||
          prior.attachment !== encoded ||
          prior.community_id !== communityId ||
          prior.reply_to !== replyTo
        )
          throw new SkySocialError('同じ投稿IDが使われています。', 409);
        return { ok: true };
      }
      const result = await db
        .prepare(
          `INSERT INTO sky_social_posts(id,author_id,community_id,content,attachment,created_at,reply_to) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM sky_social_posts WHERE author_id=? AND created_at>?)<100 AND (? IS NULL OR EXISTS(SELECT 1 FROM sky_social_posts WHERE id=? AND reply_to IS NULL)) AND (? IS NULL OR EXISTS(SELECT 1 FROM sky_communities c JOIN sky_community_members m ON m.community_id=c.id JOIN sky_community_keys k ON k.community_id=c.id AND k.profile_id=m.profile_id WHERE c.id=? AND c.archived_at=0 AND m.profile_id=? AND k.key_hash=? AND k.revoked_at=0 AND (c.post_mode='members' OR c.owner_id=?))) ON CONFLICT DO NOTHING`,
        )
        .bind(
          id,
          p.id,
          communityId,
          content,
          encoded,
          now,
          replyTo,
          p.id,
          now - 86400000,
          replyTo,
          replyTo,
          communityId,
          communityId,
          p.id,
          communityId ? await communityKeyHash(keys[communityId]) : null,
          owner,
        )
        .run();
      if (result.meta.changes !== 1)
        throw new SkySocialError(
          '投稿上限または参加状態の更新を確認してください。',
          409,
        );
      return { ok: true };
    }
    if (action === 'deletePost') {
      const id = socialId(input.id),
        target = await visiblePost(id, p);
      if (target.author_id !== p.id) {
        const c = target.community_id
          ? await community(target.community_id, p)
          : null;
        if (c?.owner_id !== owner)
          throw new SkySocialError('削除できる投稿が見つかりません。', 404);
      }
      await db.batch([
        db
          .prepare(
            'DELETE FROM sky_social_reactions WHERE post_id=? OR post_id IN (SELECT id FROM sky_social_posts WHERE reply_to=?)',
          )
          .bind(id, id),
        db
          .prepare('DELETE FROM sky_social_posts WHERE id=? OR reply_to=?')
          .bind(id, id),
      ]);
      return { ok: true };
    }
    throw new SkySocialError('操作を確認してください。');
  }
  return { state, mutate };
}
