'use client';
/* oxlint-disable next/no-html-link-for-pages -- The Mac runtime is a separate origin. */
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Laptop, ArrowUpRight } from 'lucide-react';
import { noahMacPath } from '@/lib/noah-surface';
import styles from './noah-shell.module.css';

export default function NoahMacHandoff() {
  const params = useSearchParams(), [notice, setNotice] = useState('');
  const url = `http://127.0.0.1:3107${noahMacPath(params.get('target') ?? 'library', params.get('agent') ?? '')}`;
  return <main className={styles.handoff}><Laptop size={36} /><h2>MacのNoahで続きを開く</h2><p>Agentの登録・管理と、対応Agentの接続・実行・停止はMac版で行います。</p>
    <ol><li>NoahをインストールしたMacで、Noahを起動します。</li><li>そのMacで下のリンクを開きます。</li></ol>
    <a className={styles.add} href={url}>このMacで開く <ArrowUpRight size={17} /></a>
    <button onClick={() => { void navigator.clipboard.writeText(url).then(() => setNotice('リンクをコピーしました。Macで開いてください。')).catch(() => setNotice('コピーできませんでした。下のリンクを選択してコピーしてください。')); }}>Macで開くリンクをコピー</button>
    <code>{url}</code>{notice && <output>{notice}</output>}
    <p>スマホから見ている場合は、リンクをMacへ送って開いてください。このリンクは開いた端末自身を指します。認証付きのスマホ→Mac接続は準備中です。</p>
    <details><summary>Macで開けないとき</summary><p>MacのNoahが起動しているか確認し、起動後にもう一度リンクを開いてください。画面を開くだけでAgentが勝手に実行されることはありません。</p></details>
  </main>;
}
