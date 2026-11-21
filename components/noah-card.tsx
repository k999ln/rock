import Link from 'next/link';
import { ArrowUpRight, Check, Zap } from 'lucide-react';
import type { NoahReadyItem } from '@/lib/noah-remote-client';
import styles from './noah-ready.module.css';
export default function NoahCard({ item }: { item: NoahReadyItem }) {
  return (
    <article className={styles.card}>
      <div className={styles.cardMeta}>
        <span>{item.provider}</span>
        <span>
          {item.section === 'ran' ? (
            <>
              <Check size={14} />1 クリック
            </>
          ) : (
            'まだ誰も動かしていない'
          )}
        </span>
      </div>
      <h3>
        <Link href={`/noah/ready/agent?id=${encodeURIComponent(item.id)}`}>
          {item.name}
        </Link>
      </h3>
      <p>{item.summary}</p>
      <small>相手のサーバー（{item.host}）</small>
      <div className={styles.cardFooter}>
        <span>
          {item.oneTap ? (
            <>
              <Zap size={14} />
              押すだけで試せる
            </>
          ) : (
            `道具 ${item.tools}個`
          )}{' '}
          · 無料
        </span>
        <Link
          href={`/noah/ready/agent?id=${encodeURIComponent(item.id)}`}
          className={styles.cardAction}
        >
          使う <ArrowUpRight size={16} />
        </Link>
      </div>
    </article>
  );
}
