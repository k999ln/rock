'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import WorkspaceShell from './workspace-shell';
import type { NoahUsageReport, NoahUsageScope, NoahUsageSource } from '@/lib/noah-usage';
import styles from './noah-agent-catalog.module.css';
const scopes: [NoahUsageScope,string][] = [['personal','自分の利用'],['publisher','提供したAgent'],['operator','Noah全体']];
const sourceLabels: Record<NoahUsageSource,string> = { platform_agent: 'Noah経由の外部Agent', local_agent: 'このMacで実行したAgent', model: 'LLMの利用', reported: 'Agentからの利用報告' };
const duration = (ms: number | null) => ms === null ? '未計測' : `${(ms / 1000).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}秒`;
function amount(minor: number, currency: string) {
  const format = new Intl.NumberFormat('ja-JP', { style: 'currency', currency });
  return format.format(minor / 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2));
}
export default function NoahUsageDashboard({ initialScope, agent }: { initialScope: 'personal' | 'publisher'; agent: string }) {
  const [scope, setScope] = useState<NoahUsageScope>(initialScope);
  const [days, setDays] = useState(30), [source, setSource] = useState<NoahUsageSource>('platform_agent');
  const [report, setReport] = useState<NoahUsageReport | null>(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(), query = new URLSearchParams({ scope, days: String(days), ...(agent ? { agent } : {}) });
    fetch(`/api/noah/usage?${query}`, { cache: 'no-store', signal: controller.signal }).then(async r => {
      const data = await r.json() as NoahUsageReport & { error?: string };
      if (!r.ok) throw new Error(data.error || '利用状況を読み込めません。');
      if (!controller.signal.aborted) setReport(data);
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [scope, days, agent, attempt]);
  function reset() { setReport(null); setError(''); }
  const selected = report?.sources.find(s => s.source === source);
  return <WorkspaceShell title="Noah" tone="sky"><div className={styles.page}>
    <nav className={styles.nav}><Link href="/noah/explore">Agent一覧</Link><Link href="/noah/saved?tab=agents">自分のAgent</Link><Link href="/noah/agents/new">Agentを追加</Link></nav>
    <header className={styles.hero}><div><span className={styles.eyebrow}>USAGE</span><h1>誰が、何を、<br />どのくらい使ったか。</h1><p>利用回数、結果、計測時間、確認できた費用を見渡す。</p></div>
      <label>期間 <select value={days} onChange={e => { reset(); setDays(Number(e.target.value)); }}><option value={7}>過去7日</option><option value={30}>過去30日</option><option value={90}>過去90日</option></select></label></header>
    <div className={styles.actions} aria-label="閲覧範囲">{scopes.map(([value,label]) => <button key={value} aria-pressed={scope === value} className={scope === value ? styles.primary : undefined} onClick={() => { if (value !== scope) { reset(); setScope(value); } }}>{label}</button>)}</div>
    {agent && <p className={styles.notice}>特定のAgentを表示中。<Link href="/noah/usage">すべて表示する</Link></p>}
    {scope === 'publisher' && <p className={styles.muted}>提供したAgentだけを表示します。Noahの利用者は匿名化ID、外部Agentの利用元は提供者からの申告として表示します。</p>}
    {scope === 'operator' && <p className={styles.muted}>全体表示はサーバーで許可された運営アカウント限定です。</p>}
    {error && <div role="alert" className={styles.error}>{error}<button onClick={() => { reset(); setAttempt(n => n + 1); }}>再確認</button></div>}
    {!report && !error && <output>記録を読み込んでいます…</output>}
    {report && <>
      <div className={styles.sectionTitle}><h2>記録の種類</h2><span>種類をまたいで実行回数を合算しません</span></div>
      <div className={styles.actions}>{report.sources.map(s => <button key={s.source} aria-pressed={source === s.source} onClick={() => setSource(s.source)}>{sourceLabels[s.source]} · {s.metrics.runs}</button>)}</div>
      {selected && <>
        <div className={styles.metrics}><div><small>記録数</small><strong>{selected.metrics.runs.toLocaleString()}</strong></div><div><small>成功 / 失敗</small><strong>{selected.metrics.succeeded} / {selected.metrics.failed}</strong></div><div><small>進行中・その他</small><strong>{selected.metrics.other}</strong></div><div><small>計測された実行時間</small><strong>{duration(selected.metrics.durationMs)}</strong></div></div>
        <div className={styles.notice}><h2>確認できた費用</h2><p>{selected.costs.length ? selected.costs.map(c => `${amount(c.amountMinor,c.currency)} (${c.currency})`).join(' / ') : '確定費用の記録はありません。'}</p><p className={styles.muted}>費用未計測・未確定：{selected.metrics.runs - selected.metrics.knownCostRuns}件。異なる通貨は別集計です。購入代金や月額契約の総額は含みません。</p></div>
        <p className={styles.muted}>{source === 'reported' ? 'Agent側から届いた利用報告です。利用元は匿名の導入IDで、Noahアカウントとの同一性や業務成果は未確認です。' : source === 'local_agent' ? '既存の仕事に保存されたAgent実行です。結果の返却を示し、業務成果の合格ではありません。電力・設備・契約の費用は未計測です。' : source === 'model' ? 'Agentとの対応が記録されていない利用は、モデル名で表示します。' : 'Noahが依頼を記録した外部Agentです。remote完了と業務成果の合格は別です。実行時間が取得できないものは未計測です。'}</p>
        {!selected.metrics.runs && <div className={styles.empty}><h3>この範囲の利用記録はまだありません。</h3><p>接続や画面を開いただけでは、利用回数は増えません。外部Agentは利用報告の接続が必要です。</p><Link href="/noah/explore">Agentを確認する →</Link></div>}
        <section><div className={styles.sectionTitle}><h2>Agent別</h2><span>利用回数の上位50件</span></div><div className={styles.tableWrap}><table><thead><tr><th>Agent / モデル</th><th>回数</th><th>成功</th><th>失敗</th><th>計測時間</th><th>最終記録</th></tr></thead><tbody>{selected.agents.map(a => <tr key={a.agentRef}><td>{a.name}<small>{a.agentRef}</small></td><td>{a.runs}</td><td>{a.succeeded}</td><td>{a.failed}</td><td>{duration(a.durationMs)}</td><td>{new Date(a.lastUsedAt).toLocaleString('ja-JP')}</td></tr>)}</tbody></table></div></section>
        <section><div className={styles.sectionTitle}><h2>利用者・利用元別</h2><span>Agentと利用元の組合せ・上位50件</span></div><div className={styles.tableWrap}><table><thead><tr><th>利用者 / 利用元</th><th>Agent</th><th>回数</th><th>計測時間</th><th>最終記録</th></tr></thead><tbody>{selected.users.map(u => <tr key={`${u.agentRef}:${u.actorId}`}><td>{u.actorId}<small>{u.actorKind === 'account' ? 'Noahアカウント' : '提供者申告の匿名利用元'}</small></td><td>{u.name}</td><td>{u.runs}</td><td>{duration(u.durationMs)}</td><td>{new Date(u.lastUsedAt).toLocaleString('ja-JP')}</td></tr>)}</tbody></table></div></section>
        <section><div className={styles.sectionTitle}><h2>実行履歴</h2><span>直近50件</span></div><div className={styles.tableWrap}><table><thead><tr><th>記録時刻</th><th>Agent</th><th>利用元</th><th>結果</th><th>費用</th></tr></thead><tbody>{selected.recent.map(r => <tr key={r.id}><td>{new Date(r.occurredAt).toLocaleString('ja-JP')}</td><td>{r.name}</td><td>{r.actorId}</td><td>{r.outcome === 'succeeded' ? '成功の記録' : ['failed','rejected'].includes(r.outcome) ? '失敗' : '進行中・その他'}</td><td>{r.costMinor === null || !r.currency ? '未計測・未確定' : amount(r.costMinor,r.currency)}</td></tr>)}</tbody></table></div></section>
      </>}
    </>}
  </div></WorkspaceShell>;
}
