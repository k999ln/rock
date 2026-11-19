'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import WorkspaceShell from './workspace-shell';
import { researchKindLabels, type ResearchDetail, type ResearchSummary } from '@/lib/noah-research-types';
import styles from './noah-agent-catalog.module.css';
import NoahManagedInstallation from './noah-managed-installation';

export default function NoahResearchDetail({ id }: { id: string }) {
  const [entry, setEntry] = useState<ResearchDetail | null>(null);
  const [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/noah/catalog/${encodeURIComponent(id)}`, { signal: controller.signal, cache: 'no-store' });
        const data = await response.json() as { entry?: ResearchSummary; error?: string };
        if (!response.ok || !data.entry) throw new Error(data.error || '登録情報を読み込めませんでした。');
        if (!/^\/noah-research\/[a-f0-9]{16}\/[a-f0-9]{2}\.json$/.test(data.entry.detailPath)) throw new Error('詳細の保存先を確認できません。');
        const detail = await fetch(data.entry.detailPath, { signal: controller.signal });
        if (!detail.ok) throw new Error('詳細を読み込めませんでした。');
        const shard = await detail.json() as Record<string, ResearchDetail>;
        if (!shard[id] || shard[id].id !== id) throw new Error('詳細が見つかりません。');
        if (!controller.signal.aborted) setEntry(shard[id]);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '読み込めませんでした。'); }
    })();
    return () => controller.abort();
  }, [id, attempt]);
  const agent = entry?.kind === 'agent' || entry?.kind === 'candidate';
  return <WorkspaceShell title="Noah" tone="sky"><div className={`${styles.page} ${styles.formPage}`}>
    <nav className={styles.nav}><Link href="/noah/agents">← Agentタイムライン</Link><Link href="/noah/library">自分のAgent</Link></nav>
    {error && <div className={styles.error} role="alert">{error} <button onClick={() => { setError(''); setAttempt(n => n + 1); }}>再試行</button></div>}
    {!entry && !error && <output>詳細を読み込んでいます…</output>}
    {entry && <>
      <header className={styles.hero}><div><span className={styles.eyebrow}>WORLD AGENT CATALOG</span><h1>{entry.name}</h1><p>{entry.summary}</p></div></header>
      <div className={styles.facts}>
        <div><small>分類</small><strong>{researchKindLabels[entry.kind]}</strong></div>
        <div><small>資料の確認</small><strong>{entry.level === 'primary' ? '一次資料を確認' : '発見・分類確認待ち'}</strong></div>
        <div><small>Noahからの接続</small><strong>{agent ? '下の接続欄で確認' : '関連資産'}</strong></div>
      </div>
      <section className={styles.notice}><h2>{agent ? '利用開始までに必要なこと' : 'この資料について'}</h2>
        <p>{agent ? '公開された本体をNoahが取り寄せます。対応する起動手順があるAgentは、実行環境の準備と接続確認まで進みます。' : 'Agentを作る・動かすための関連資産として登録しています。単独の業務Agentとは区別しています。'}</p>
        <p>利用費用：{entry.price}</p>
        <p>ライセンス：{entry.license || '未確認'}{entry.license && '（配布元の表示。利用条件の個別確認は未実施）'}</p>
      </section>
      {agent && <NoahManagedInstallation key={id} id={id} />}
      <section className={styles.notice}><h2>配布元・出典</h2>
        <p>{entry.identity === 'name_group' ? '紹介サイトの名称グループです。同名の掲載が同一製品かは未確定です。' : '配布元・公式資料の確認先です。リンクを開いただけではNoahからの接続は完了しません。'}</p>
        <ul>{entry.sources.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.type === 'directory' ? '紹介記事を見る' : '配布元・資料を見る'} ↗</a><p>{s.url}</p></li>)}</ul>
      </section>
      <section className={styles.notice}><h2>確認した情報</h2>
        <p>{entry.tags.join(' · ')}</p><ul>{entry.notes.map((note, n) => <li key={n}>{note}</li>)}</ul>
        <p>調査日：{entry.asOf}。動作試験・継続運用・購入の完了を示すものではありません。</p>
        <details><summary>取込元の記録</summary><p>調査チャット：世界のagentを徹底調査</p><p>登録ID：{entry.id}</p><ul>{entry.references.map((r, n) => <li key={n}>{r.dataset} / {r.ref}</li>)}</ul></details>
      </section>
    </>}
  </div></WorkspaceShell>;
}
