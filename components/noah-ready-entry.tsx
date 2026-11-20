'use client';
/**
 * 「Agentを探す」（/noah/explore）の一番上に出す、「すぐ使える Agent」（/noah/ready）への入口。
 * 見せてよい時（切り替えが開いている・審査者）にだけ出す。それ以外の時は、何も出さない（探す画面は、今のまま）。
 * menu（components/noah-shell.tsx）には、行を足さない: menu は、本人の指示で 4 つにまとめた所で、
 * その file は、応答の header を測った記録（data/web-security-response-current.json）の入力でもある。
 * 仕様: docs/noah/spec-74-one-click-connect.md の 11.5。
 */
import Link from 'next/link';
import { NOAH_READY_TEXT } from '@/lib/noah-ready-view';
import styles from './noah-ready.module.css';
import { useNoahReadyOpen } from './use-noah-ready';

export default function NoahReadyEntry() {
  const { open, count } = useNoahReadyOpen();
  if (!open) return null;
  return <Link className={styles.entry} href="/noah/ready">
    <span className={styles.entryText}><strong>{NOAH_READY_TEXT.title}</strong><small>{NOAH_READY_TEXT.entryNote}</small></span>
    <span className={styles.entryCount}>{count !== null && count > 0 ? `${count} 件 ` : ''}→</span>
  </Link>;
}
