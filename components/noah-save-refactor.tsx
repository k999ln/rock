'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './noah-agent-catalog.module.css';
import ui from './noah-save-refactor.module.css';
type Session = { id: string; label: string; target: string; test: string; agentId: string; enabled: boolean; connected: boolean; generation: string; lastWorkId?: string };
export default function NoahSaveRefactor() {
  const [sessions, setSessions] = useState<Session[]>([]), [scope, setScope] = useState(''), [error, setError] = useState(''), [operationError, setOperationError] = useState(''), [pending, setPending] = useState(''), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const r = await fetch('/__noah/save-refactor', { cache: 'no-store', signal: controller.signal });
        const data = await r.json() as { sessions?: Session[]; ownerScope?: string; error?: string };
        if (!r.ok || !data.sessions || !data.ownerScope) throw new Error(data.error || 'このMacのNoahへ接続してください。');
        if (!controller.signal.aborted) { setSessions(data.sessions); setScope(data.ownerScope); setError(''); }
      } catch (e) { if (!controller.signal.aborted) { setSessions([]); setScope(''); setError(e instanceof Error ? e.message : '接続できません。'); } }
      if (!controller.signal.aborted) timer = setTimeout(poll, 3000);
    };
    void poll(); return () => { controller.abort(); clearTimeout(timer); };
  }, [refresh]);
  async function control(id: string, start: boolean) {
    if (!scope || pending) return; setPending(id); setOperationError('');
    try {
      const r = await fetch(`/__noah/save-refactor/${id}/${start ? 'start' : 'stop'}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': scope }, body: '{}' });
      const data = await r.json() as { session?: Session; ownerScope?: string; error?: string };
      if (!r.ok || data.ownerScope !== scope || !data.session) throw new Error(data.error || '操作を確認できません。');
      setSessions(rows => rows.map(row => row.id === id ? data.session! : row)); setRefresh(n => n + 1);
    } catch (e) { setOperationError(e instanceof Error ? e.message : '操作できません。'); }
    finally { setPending(''); }
  }
  return <div className={ui.surface}><main className={`${styles.page} ${ui.content}`}><header><Link href="/noah/explore">← Noah</Link><h1>保存時リファクタ</h1><p>VS Codeで保存したコードを、Aiderが整理して保存します。</p></header>
    <section className={styles.notice}><h2>使い始める</h2><ol><li><Link href="/noah/agents/research-ce4e58553bea6313acf7">Aiderの詳細</Link>で「接続する」を押します。</li><li>VS CodeにNoah拡張を入れ、対象コードを開いて「Noah: このファイルを保存時リファクタに接続」を実行します。</li><li>対応する .test.mjs を選び、この画面で「運用開始」を押します。</li></ol><p>最初の対応範囲は、外部依存なしの小さいJS/TSファイルとNodeテスト1つです。構文・TypeScriptの型・指定テストを検証します。元コードが失敗する場合や編集中の場合は反映しません。Mac・Noah・VS Codeの起動が必要です。</p></section>
    {operationError && <p role="alert" className={styles.error}>{operationError}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!sessions.length && !error && <p>VS Codeから接続した対象がここに表示されます。</p>}
    {sessions.map(row => <section key={row.id} className={styles.notice}><h2>{row.label}</h2><p><strong>{!row.connected ? 'VS Code未接続・待機中' : row.enabled ? '運用中・次の保存から処理' : '停止中'}</strong></p><p>対象：<code>{row.target}</code><br />テスト：<code>{row.test}</code></p><div className={styles.actions}><button disabled={Boolean(pending) || !scope} onClick={() => void control(row.id, !row.enabled)}>{pending === row.id ? '処理中…' : row.enabled ? '運用停止' : '運用開始'}</button><Link href={`/noah/agents/${row.agentId}`}>Agentと実行結果を見る</Link></div>{row.lastWorkId && <p>直近のWork：{row.lastWorkId}</p>}</section>)}
  </main></div>;
}
