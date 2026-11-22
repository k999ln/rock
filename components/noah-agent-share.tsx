'use client';
import { useState } from 'react';
import { Share2, Copy } from 'lucide-react';
import { noahAgentShareUrl } from '@/lib/noah-agent-share';
import styles from './noah-agent-share.module.css';

export default function NoahAgentShare({ id, name, summary }: { id: string; name: string; summary: string }) {
  const url = noahAgentShareUrl(id);
  const [message, setMessage] = useState('');
  const [manual, setManual] = useState(false);
  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(url);
      setManual(false); setMessage('このAgentのURLをコピーしました。');
    } catch { setManual(true); setMessage('下のURLを選択してコピーしてください。'); }
  }
  async function share() {
    if (!navigator.share) { await copy(); return; }
    try {
      await navigator.share({ title: `${name} — Noah`, text: summary.slice(0, 180), url });
      setMessage('');
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      await copy();
    }
  }
  return <div className={styles.share} aria-label="このAgentを共有">
    <div className={styles.actions}>
      <button type="button" onClick={() => void share()}><Share2 size={17} aria-hidden="true"/>共有</button>
      <button type="button" onClick={() => void copy()}><Copy size={17} aria-hidden="true"/>URLをコピー</button>
      <a href={`https://x.com/intent/post?${new URLSearchParams({ text: `${name} — Noah`, url })}`} target="_blank" rel="noopener noreferrer">Xで紹介</a>
    </div>
    <output className={styles.status}>{message}</output>
    {manual && <input className={styles.url} aria-label="このAgentの共有URL" readOnly value={url} onFocus={event => event.currentTarget.select()} />}
  </div>;
}
