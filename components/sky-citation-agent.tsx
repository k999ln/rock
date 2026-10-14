'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import WorkspaceShell from '@/components/workspace-shell';
import { runCitationAgent } from '@/lib/sky-citation-agent';
import styles from './sky-citation-agent.module.css';

type Output = {
  text: string;
  sourceCount: number;
  warnings: string[];
  execution: 'first-party-rules';
};

export default function SkyCitationAgent() {
  const [markdown, setMarkdown] = useState('');
  const [language, setLanguage] = useState<'ja' | 'en'>('en');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [signIn, setSignIn] = useState(false);
  const [result, setResult] = useState<{ jobId?: string; output: Output } | null>(null);
  const pending = useRef<{ input: string; id: string } | null>(null);

  function run() {
    if (busy || !markdown.trim()) return;
    setError('');
    setSignIn(false);
    try {
      const output = runCitationAgent({ markdown, language });
      setResult({ output: { ...output, execution: 'first-party-rules' } });
    } catch (cause) {
      setResult(null);
      setError(cause instanceof Error ? cause.message : '入力を確認してください。');
    }
  }

  async function save() {
    if (busy || !markdown.trim()) return;
    setBusy(true);
    setError('');
    setSignIn(false);
    const input = JSON.stringify({ markdown, language });
    if (pending.current?.input !== input) pending.current = { input, id: crypto.randomUUID() };
    try {
      const ownerResponse = await fetch('/api/work-jobs', { cache: 'no-store', credentials: 'same-origin' });
      if (ownerResponse.status === 401) { setSignIn(true); return; }
      if (!ownerResponse.ok) throw new Error('保存先を確認できません。少し待ってから再試行してください。');
      const owner = await ownerResponse.json() as { ownerScope?: string };
      if (!owner.ownerScope) throw new Error('本人の保存先を確認できません。');
      const response = await fetch('/api/sky/agents/citations', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': owner.ownerScope },
        body: JSON.stringify({ id: pending.current.id, input: { markdown, language }, saveResult: true }),
      });
      const data = await response.json() as { jobId?: string; output?: Output; error?: string; code?: string };
      if (response.status === 401) { setSignIn(true); return; }
      if (!response.ok || !data.jobId || !data.output) throw new Error(data.error || data.code || '実行結果を確認できません。');
      setResult({ jobId: data.jobId, output: data.output });
      pending.current = null;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '接続を確認して再試行してください。');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!result) return;
    try { await navigator.clipboard.writeText(result.output.text); }
    catch { setError('コピーできませんでした。端末の共有機能を確認してください。'); }
  }

  function download() {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([result.output.text], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sky-organized-sources.md';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <WorkspaceShell title="Sky" contentClassName={styles.shell} tone="sky">
    <main className={styles.page}>
      <nav className={styles.breadcrumb}><Link href="/sky">Sky</Link><span>/</span><Link href="/sky/marketplace">Agent</Link><span>/</span>出典整理</nav>
      <header className={styles.header}>
        <p>FIRST-PARTY AGENT · FREE</p>
        <h1>出典を整えて、成果として残す。</h1>
        <div>文章中の引用を整理し、重複をまとめてMarkdownにします。スマホのブラウザだけで試せます。アカウントへの保存は別操作です。</div>
      </header>
      <div className={styles.grid}>
        <section className={styles.panel} aria-label="Agentへの依頼">
          <div className={styles.panelHead}><span>01 / 依頼</span><strong>出典整理Agent</strong></div>
          <label htmlFor="citation-language">出力言語</label>
          <select id="citation-language" value={language} onChange={(event) => { setLanguage(event.target.value as 'ja' | 'en'); setResult(null); }}>
            <option value="en">English</option><option value="ja">日本語</option>
          </select>
          <label htmlFor="citation-markdown">引用を含む文章</label>
          <textarea id="citation-markdown" value={markdown} maxLength={20_000} rows={13}
            placeholder={'Example: This is a claim. (Source: [Paper](https://example.org/paper))'}
            onChange={(event) => { setMarkdown(event.target.value); setResult(null); }} />
          <p className={styles.hint}>{markdown.length.toLocaleString()} / 20,000文字。入力本文は成果を作るために処理し、保存するのは整理後の成果です。</p>
          <div className={styles.terms}>ブラウザ内の第一者ルール処理 · モデル推論なし · 入力の外部送信なし · 料金: 無料</div>
          <button className={styles.run} type="button" disabled={busy || !markdown.trim()} onClick={run}>
            ブラウザで実行する
          </button>
          {result && !result.jobId && <button className={styles.save} type="button" disabled={busy} onClick={() => void save()}>
            {busy ? '保存を確認中…' : 'Skyに成果を保存する'}
          </button>}
          {signIn && <p role="alert" className={styles.notice}>Skyへの保存には<Link href="/signin-with-chatgpt?return_to=%2Fos%2Fsky%2Fagents%2Fcitations" target="_blank" rel="noopener noreferrer">サインイン</Link>が必要です。結果はこの画面に残ります。</p>}
          {error && <p role="alert" className={styles.notice}>{error}</p>}
        </section>
        <section className={styles.panel} aria-label="Agentの成果">
          <div className={styles.panelHead}><span>02 / 成果</span><strong>{result ? (result.jobId ? 'Skyに保存済み' : 'この画面のみ・未保存') : '実行待ち'}</strong></div>
          {result ? <>
            <p className={styles.meta}>出典リンク {result.output.sourceCount}件 · {result.jobId ? '本人のSky成果へ保存しました' : '再読み込みすると結果は消えます。保存にはサインインが必要です'}</p>
            <pre className={styles.output}>{result.output.text}</pre>
            {result.output.warnings.map((warning) => <p className={styles.warning} key={warning}>{warning}</p>)}
            <div className={styles.actions}>
              <button type="button" onClick={() => void copy()}>コピー</button>
              <button type="button" onClick={download}>Markdownを保存</button>
              {result.jobId && <Link href={`/sky/outputs?job=${encodeURIComponent(result.jobId)}`}>成果一覧で開く →</Link>}
            </div>
          </> : <div className={styles.empty}>実行結果と、保存後に開ける成果リンクがここに表示されます。</div>}
        </section>
      </div>
      <p className={styles.footer}>このAgentは引用の形式を整えます。論文の内容、リンクの正確性、引用規則への適合は検証しません。</p>
    </main>
  </WorkspaceShell>;
}
