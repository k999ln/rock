'use client';

import { type CSSProperties } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ToolIcon } from '@/components/tool-icon';
import styles from './tool-character.module.css';

const colors = ['#ed2045', '#087fea', '#9558ed', '#00ae9b', '#ffad08', '#a47742'];
const identities: Record<string, number> = {
  zema: 2, 'rockstar-csv-cleanup': 1, 'fashion-brand-ops': 0,
  coconala: 4, 'mr-free-article': 8, 'mr-citations': 3,
  'mr-delivery': 11, 'rockstar-ledger': 7, 'rockstar-legal-intake': 5,
  'rockstar-patent-assistant': 10, 'mercari-revenue': 6, 'jev-evaluation': 9,
};
function identity(id: string) {
  return identities[id] ?? Array.from(id).reduce((value, letter) => (value * 31 + letter.charCodeAt(0)) >>> 0, 7);
}

export function ToolCharacter({ id, size = 56 }: { id: string; size?: number }) {
  const seed = identity(id);
  const color = colors[seed % colors.length];
  return <span className={styles.character} style={{ width: size, height: size, backgroundColor: color }} aria-hidden="true">
    <ToolIcon id={id} size={Math.round(size * 0.48)} />
  </span>;
}

export default function ToolCharacterDetails({ id, name, description, status, result, next, request, size = 56 }: {
  id: string; name: string; description: string; status?: string; result?: string; next?: string; request?: string; size?: number;
}) {
  return <Dialog>
    <DialogTrigger className={styles.trigger} aria-label={`${name}の詳細を見る`} title={`${name}の詳細を見る`}><ToolCharacter id={id} size={size} /></DialogTrigger>
    <DialogContent className={styles.details} style={{ '--character-accent': colors[identity(id) % colors.length] } as CSSProperties}>
      <div className={styles.hero}><ToolCharacter id={id} size={120} /><DialogTitle className={styles.title}>{name}</DialogTitle></div>
      <section className={styles.activity}><h3>いま、していること</h3><p className={styles.status}><span aria-hidden="true" />{status ?? '依頼を待っています'}</p>{request && <p className={styles.request}>{request}</p>}</section>
      <section className={styles.next}><h3>あなたへのお願い</h3><p>{next ?? 'チャットでやりたいことを伝えてください。'}</p></section>
      {result && <section className={styles.result}><h3>できたもの</h3><p>{result}</p></section>}
      <details className={styles.about}><summary>この子ができること</summary><DialogDescription>{description}</DialogDescription></details>
    </DialogContent>
  </Dialog>;
}
