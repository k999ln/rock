'use client';

import { ArrowUpRight, KeyRound, LockKeyhole, Plus, Users } from 'lucide-react';
import type { SkyCommunity } from '@/lib/sky-social';
import styles from './sky-community-directory.module.css';

/** Navigation only. Existing social/key APIs keep ownership and membership authoritative. */
export default function SkyCommunityDirectory({
  communities, busy, onSelect, onCreate, onJoin,
}: {
  communities: SkyCommunity[];
  busy: boolean;
  onSelect: (community: SkyCommunity) => void;
  onCreate: () => void;
  onJoin: () => void;
}) {
  return <section className={styles.directory} aria-labelledby="community-directory-title">
    <header>
      <h2 id="community-directory-title">あなたのコミュニティー</h2>
      <p>仲間と投稿を共有する場所です。会話履歴や認証情報は共有されません。</p>
      <div className={styles.actions}>
        <button type="button" disabled={busy} onClick={onCreate}><Plus size={18} />コミュニティーを作る</button>
        <button type="button" disabled={busy} onClick={onJoin}><KeyRound size={18} />招待鍵で参加する</button>
      </div>
    </header>
    <div className={styles.list} aria-label="コミュニティーの一覧">
      {communities.map(community => <button type="button" key={community.id}
        className={styles.card} disabled={busy} onClick={() => onSelect(community)}
        aria-label={`${community.name}を開く${community.unlocked ? '' : '・専用鍵が必要'}`}>
        <span className={styles.icon}><Users size={24} /></span>
        <span className={styles.details}>
          <strong>{community.name}</strong>
          {community.description && <span>{community.description}</span>}
          <small><LockKeyhole size={13} />{community.unlocked ? `${community.members}人 · ${community.owned ? '管理している場所' : '参加中'}` : '専用鍵でアクセス'}</small>
        </span>
        <ArrowUpRight size={18} />
      </button>)}
      {!communities.length && <div className={styles.empty}>
        <Users size={32} />
        <h3>参加中のコミュニティーはありません</h3>
        <p>新しく作るか、招待鍵を使って参加できます。</p>
      </div>}
    </div>
  </section>;
}
