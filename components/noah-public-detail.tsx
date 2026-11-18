'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { researchKindLabels, type ResearchDetail, type ResearchSummary } from '@/lib/noah-research-types';
import styles from './noah-agent-catalog.module.css';
import { noahActionHref } from '@/lib/noah-surface';

export default function NoahPublicDetail({ id, basePath = '/noah' }: { id: string; basePath?: string }) {
  const [result, setResult] = useState<{ key: string; entry?: ResearchDetail; error?: string } | null>(null), [attempt, setAttempt] = useState(0);
  const key = `${id}:${attempt}`, current = result?.key === key ? result : null;
  const entry = current?.entry, error = current?.error;
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/noah/public-catalog/${encodeURIComponent(id)}`, { signal: controller.signal });
        const data = await response.json() as { entry?: ResearchSummary; error?: string };
        if (!response.ok || !data.entry) throw new Error(data.error || '詳細を読み込めませんでした。');
        if (!/^\/noah-research\/[a-f0-9]{16}\/[a-f0-9]{2}\.json$/.test(data.entry.detailPath)) throw new Error('詳細の保存先を確認できません。');
        const details = await fetch(data.entry.detailPath, { signal: controller.signal });
        if (!details.ok) throw new Error('詳細を読み込めませんでした。');
        const shard = await details.json() as Record<string, ResearchDetail>;
        if (!shard[id] || shard[id].id !== id) throw new Error('詳細が見つかりません。');
        if (!controller.signal.aborted) setResult({ key, entry: shard[id] });
      } catch (e) { if (!controller.signal.aborted) setResult({ key, error: e instanceof Error ? e.message : '読み込めませんでした。' }); }
    })();
    return () => controller.abort();
  }, [id, key]);
  const agent = entry?.kind === 'agent' || entry?.kind === 'candidate';
  return <div><main className={`${styles.page} ${styles.formPage}`}>
    <nav className={styles.nav}><Link href={`${basePath}/agents`}>← Agentを探す</Link></nav>
    {error && <div role="alert" className={styles.error}>{error} <button onClick={() => setAttempt(n => n + 1)}>再試行</button></div>}
    {!entry && !error && <output>詳細を読み込んでいます…</output>}
    {entry && <>
      <header className={styles.hero}><div><span className={styles.eyebrow}>NOAH · AGENT CATALOG</span><h1>{entry.name}</h1><p>{entry.summary}</p></div></header>
      <div className={styles.facts}><div><small>分類</small><strong>{researchKindLabels[entry.kind]}</strong></div><div><small>確認状況</small><strong>{entry.level === 'primary' ? '一次資料を確認' : '資料確認待ち'}</strong></div></div>
      <section className={styles.notice}><h2>{agent ? 'このAgentを使う' : 'この関連資産について'}</h2>
        <p>{agent ? '接続条件と実行対応はMacのNoahで確認できます。この公開ページを開いただけではAgentは起動しません。' : 'Agentを作る・動かすための関連資産です。単独の業務Agentとは区別しています。'}</p>
        <p>利用費用：{entry.price}</p><p>ライセンス：{entry.license || '未確認'}。利用条件は配布元で確認してください。</p>
        {agent && <><a className={styles.primary} href={noahActionHref('public', basePath, 'agent', id)}>Mac版で接続条件を確認</a><p>Noahを起動したMacで開いてください。スマホからMacへの接続・クラウドでの実行は準備中です。</p></>}
      </section>
      <section className={styles.notice}><h2>配布元・出典</h2><ul>{entry.sources.filter(source => /^https?:\/\//.test(source.url)).map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label || '配布元・資料を見る'} ↗</a><p>{source.url}</p></li>)}</ul></section>
      <section className={styles.notice}><h2>確認した情報</h2><p>{entry.tags.join(' · ')}</p><ul>{entry.notes.map((note, n) => <li key={n}>{note}</li>)}</ul><p>調査日：{entry.asOf}。掲載は動作試験・購入・継続運用の完了を示しません。</p></section>
    </>}
  </main></div>;
}
