'use client';

import { useId, type CSSProperties } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
  const uid = useId().replace(/:/g, '');
  const silhouette = [
    'M48 7C44 7 39 16 31 25C18 40 11 51 11 62C11 79 26 89 48 89C70 89 85 79 85 62C85 51 78 40 65 25C57 16 52 7 48 7Z',
    'M29 11C40 8 60 8 71 12C83 16 85 28 85 47C85 68 83 78 73 83C62 88 34 88 23 83C12 78 10 66 10 47C10 27 13 15 29 11Z',
    'M39 12C43 5 53 5 57 12L88 69C93 79 87 87 76 87H20C9 87 3 79 8 69Z',
    'M43 7Q48 4 53 7L81 23Q86 26 86 32V65Q86 71 81 74L53 90Q48 93 43 90L15 74Q10 71 10 65V32Q10 26 15 23Z',
    'M32 21H64C80 21 91 31 91 48C91 66 80 77 64 77H32C16 77 5 66 5 48C5 31 16 21 32 21Z',
  ][seed % 5];
  return <svg className={styles.character} width={size} height={size} viewBox="0 0 96 96" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${uid}-body`} x1=".2" y1="0" x2=".75" y2="1">
        <stop stopColor={color} /><stop offset=".48" stopColor={color} /><stop offset="1" stopColor={color} style={{ stopColor: `color-mix(in srgb, ${color} 68%, #142039)` }} />
      </linearGradient>
      <radialGradient id={`${uid}-light`} cx=".28" cy=".17" r=".72">
        <stop stopColor="#fff" stopOpacity=".48" /><stop offset=".55" stopColor="#fff" stopOpacity=".05" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${uid}-shine`} x1="0" y1="0" x2=".4" y2="1">
        <stop stopColor="#fff" stopOpacity=".85" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      <clipPath id={`${uid}-clip`}><path d={silhouette} /></clipPath>
    </defs>
    <path d={silhouette} fill={`url(#${uid}-body)`} />
    <path d={silhouette} fill={`url(#${uid}-light)`} />
    <g clipPath={`url(#${uid}-clip)`}>
      <ellipse cx="32" cy={seed % 5 === 4 ? 28 : 23} rx="17" ry="6" transform="rotate(-28 32 23)" fill={`url(#${uid}-shine)`} />
      <path d={silhouette} fill="none" stroke="#fff" strokeOpacity=".16" strokeWidth="2" />
    </g>
    <g className={styles.eyes} fill="#121923">
      <g transform="rotate(-14 57 44)"><rect x="44" y="36" width="7" height="15" rx="3.5" /><rect x="65" y="36" width="7" height="15" rx="3.5" /></g>
    </g>
  </svg>;
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
