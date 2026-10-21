'use client';

import { skyAppExport } from '@/lib/sky-app-foundation';
import { SkyNotice, SkyWorkProgress } from '@/components/sky-feedback';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ProductDomainNavigation } from './product-domain-navigation';
import type { WorkJob } from '@/lib/workflow';
import type { PrivateZoomAgent } from '@/lib/sky-zoom-recipe';
import type { rankSkyModels } from '@/lib/sky-model-selector';
import { SkyPortableExport } from '@/components/sky-portable-export';
import { SkyAppResultView } from '@/components/sky-app-result-view';
import styles from './sky-add-zoom-prototype.module.css';

type Ranked = ReturnType<typeof rankSkyModels>[number];
type Report = { ranked: Ranked[]; excluded: { name: string; reason: string }[]; scope: string; memoryBudget: number };
type Target = { index: number; key: string; title: string };
type Lease = { token: string; expiresAt: number; target: { title: string } };
const recipeDefault: PrivateZoomAgent = { schema: 'sky.private-zoom-recipe/1', name: '表示中のZoomから会議メモ',
  purpose: '今見えているZoomの文章から概要・決定・担当を整理する', outputs: ['summary', 'decisions', 'owners'], summaryLines: 3, decisionLabel: '決定', ownerLabel: '担当' };
function download(name: string, value: string) {
  const url = URL.createObjectURL(new Blob([value], { type: name.endsWith('.json') ? 'application/json' : 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function call<T>(action: string, data: Record<string, unknown> = {}, lease?: Lease | null, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/__sky/zoom-local', { method: 'POST', credentials: 'omit', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(lease ? { 'X-Sky-Zoom-Lease': lease.token } : {}) }, body: JSON.stringify({ action, ...data }), signal });
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('端末接続は新しい開発サーバーで有効になります。READMEの起動手順を確認してください。');
  const value = await response.json() as { error?: string }; if (!response.ok) throw new Error(value.error || '接続できません。'); return value as T;
}
export default function SkyZoomDeviceLab() {
  const [recipe, setRecipe] = useState(recipeDefault), [created, setCreated] = useState(false);
  const [report, setReport] = useState<Report | null>(null), [digest, setDigest] = useState('');
  const [targets, setTargets] = useState<Target[]>([]), [targetKey, setTargetKey] = useState('');
  const [approved, setApproved] = useState(false), [readConsent, setReadConsent] = useState(false);
  const [lease, setLease] = useState<Lease | null>(null), [snapshot, setSnapshot] = useState<{ text: string; hash: string; observedAt: number } | null>(null);
  const [job, setJob] = useState<WorkJob | null>(null), [busy, setBusy] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState('');
  const controller = useRef<AbortController | null>(null), activeLease = useRef<Lease | null>(null), version = useRef(0);
  useEffect(() => () => { controller.current?.abort(); const old = activeLease.current; if (old) void fetch('/__sky/zoom-local', {
    method: 'POST', credentials: 'omit', keepalive: true, headers: { 'Content-Type': 'application/json', 'X-Sky-Zoom-Lease': old.token }, body: JSON.stringify({ action: 'stop' }) }).catch(() => {}); }, []);
  useEffect(() => { if (!lease) return; const timer = setTimeout(() => {
    version.current++; controller.current?.abort(); controller.current = null; activeLease.current = null; setLease(null); setSnapshot(null); setJob(null); setBusy('');
    setMessage('15分の接続期限が切れました。Zoom画面の選択からやり直してください。');
  }, Math.max(0, lease.expiresAt - Date.now())); return () => clearTimeout(timer); }, [lease]);
  async function perform(label: string, fn: (signal: AbortSignal) => Promise<void>) {
    if (controller.current) return;
    const current = new AbortController(); controller.current = current; setBusy(label); setError(''); setMessage('');
    try { await fn(current.signal); } catch (cause) { if (!current.signal.aborted) setError((cause as Error).message); }
    finally { if (controller.current === current) { controller.current = null; setBusy(''); } }
  }
  async function stop() {
    version.current++; controller.current?.abort(); controller.current = null; setBusy(''); setSnapshot(null); setReadConsent(false);
    const old = activeLease.current; activeLease.current = null; setLease(null); setApproved(false);
    // Hide any potentially late result immediately, then verify the server-side stop receipt.
    setJob(null); setMessage('停止を要求しています。');
    try { if (old) { const result = await call<{ stopped: boolean; job: WorkJob | null }>('stop', {}, old); setJob(result.job); }
      setMessage("接続を停止しました。再実行は新しい追加から開始してください。モデルへの中断要求後のCPU/GPU停止は実行環境側の応答に依存します。");
    } catch { setError('停止の応答が未確認です。開発サーバーを終了するとこの接続も終了します。接続は最長15分で失効します。'); }
  }
  const selected = report?.ranked.find((r) => r.digest === digest);
  const edit = (patch: Partial<PrivateZoomAgent>) => { setRecipe((v) => ({ ...v, ...patch })); setCreated(false); setApproved(false); };
  const result = job?.skyApp?.result;
  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.header}><div className={styles.brand}><span className={styles.mark}>✦</span><div><strong>Sky Add</strong><small>自分のZoom / macOS Private Preview</small></div></div><span className={styles.host}>一般公開を保留</span></header>
    <section className={styles.hero}><p className={styles.eyebrow}>Sky → このPC → Zoom</p><h1>自分のZoomに、欲しいエージェントを。</h1>
      <p>表示中のZoom文章を読み、端末内AIモデルで会議メモの下書きを作ります。SkyとAIモデルへのログイン・接続用の秘密キーは不要です。</p></section>
    <section className={styles.devicePath}><strong>最初の対応機能</strong><p>本人が選んだZoomウィンドウの表示テキストを一度だけ取得し、私的な成果画面へ返します。字幕やチャットがAccessibilityへ文章を出す場合に使えます。Zoomへは外部の補助機能として接続します。</p>
      <p>会議への参加条件はZoom側に従います。音声の録音・非表示の会議データ取得・Chat投稿には対応していません。モデルは計画と文章を返し、操作権限はSkyが管理します。API料金は0円、端末の計算資源を使用します。</p></section>
    <div className={styles.content}>
      <section className={styles.work}><h2>1. エージェントを作る</h2>
        <label htmlFor="device-purpose">Zoomで欲しい機能</label><input id="device-purpose" className={styles.labInput} maxLength={240} disabled={!!lease || !!busy} value={recipe.purpose} onChange={(e) => edit({ purpose: e.target.value })}/>
        <label htmlFor="device-name">エージェント名</label><input id="device-name" className={styles.labInput} maxLength={80} disabled={!!lease || !!busy} value={recipe.name} onChange={(e) => edit({ name: e.target.value })}/>
      <p>この版の能力は文章の概要・明示された決定・担当の整理です。目的文は仕事の記録に使い、要約には取得したZoom文章だけを渡します。任意コードの生成・実行には使いません。</p>
        <button className={styles.addButton} disabled={!!lease || !!busy || !recipe.name.trim() || !recipe.purpose.trim()} onClick={() => setCreated(true)}>{created ? "エージェント作成済み" : "エージェントを作成"}</button>
      </section>
      {created && <><section className={styles.work}><h2>2. Skyが作業に適したAIモデルを選ぶ</h2>
        <p>このPCに入っているAIを試し、会議メモの作成に合格した候補を選びます。試験には架空の会議文を使います。実際の会議の本文は使いません。</p>
        <details><summary>AIの試し方とPCの負荷</summary><p>最大3候補に同じ3問を出し、95点以上で指定の形式を守ったものから選びます。このMacではCPUを使い、予想されるメモリ使用量がPC全体の25%以内の候補だけを試します。実際の使用量は変わります。試験の結果は1時間有効です。</p></details>
        <button disabled={!!busy || !!lease} onClick={() => void perform('候補を測定中', async (signal) => { const v = version.current; const r = await call<Report>('evaluate', {}, null, signal); if (signal.aborted || v !== version.current) return; setReport(r); setDigest(r.ranked[0]?.digest || ''); })}>候補を実測して自動選定</button>
        {report && <><p>このPCで試験しました。会議の本文は試験に使っていません。</p>
          <label htmlFor="device-model">この仕事に使うモデル</label><select id="device-model" className={styles.labInput} value={digest} disabled={!!lease || !!busy} onChange={(e) => setDigest(e.target.value)}>{!report.ranked.length && <option value="">合格候補なし</option>}{report.ranked.map((m, i) => <option key={m.digest + m.name} value={m.digest}>{i === 0 ? 'Sky推奨: ' : ''}{m.name} / {m.score}点</option>)}</select>
          {selected && <details><summary>選んだ理由と詳しい記録</summary><p>{selected.reason}</p><p>照合用の値: {selected.digest}</p></details>}
          {report.excluded.length > 0 && <details><summary>選ばなかった候補と理由</summary><ul>{report.excluded.map((m, i) => <li key={i}>{m.name}: {m.reason}</li>)}</ul></details>}
          {!report.ranked.length && <p>合格したモデルがありません。Ollamaに導入するモデルと利用条件を本人が選び、再測定してください。クラウドへの自動切替はありません。</p>}</>}
      </section>
      <section className={styles.work}><h2>3. Zoom画面を選んで追加</h2>
        <p>MacでZoomを開き、使う字幕・チャット等を表示してください。初回はSkyを動かす実行元へのmacOS「アクセシビリティ」許可が必要です。OS設定は本人が変更します。画面画像の許可は不要です。</p>
        <button disabled={!!busy || !!lease} onClick={() => void perform('Zoom画面を確認中', async (signal) => { const r = await call<{ windows: Target[] }>('windows', {}, null, signal); if (signal.aborted) return; setTargets(r.windows); setTargetKey(''); setApproved(false); })}>開いているZoom画面を取得</button>
        <label htmlFor="device-window">対象のZoomウィンドウ</label><select id="device-window" className={styles.labInput} value={targetKey} disabled={!!lease || !!busy} onChange={(e) => { setTargetKey(e.target.value); setApproved(false); }}><option value="">本人が選択してください</option>{targets.map((t) => <option key={t.key} value={t.key}>{t.title || `Zoom画面 ${t.index + 1}`}</option>)}</select>
        <label className={styles.labCheck}><input type="checkbox" checked={approved} disabled={!!lease || !!busy} onChange={(e) => setApproved(e.target.checked)}/>選んだZoom画面の文章を読み、このPCのAIモデルで処理するエージェントを15分間追加する。会議参加者・資料の利用条件を確認した。</label>
        <button className={styles.addButton} disabled={!!busy || !!lease || !approved || !selected || !targetKey} onClick={() => void perform("追加中", async (signal) => {
          const added = await call<Lease>('add', { recipe, targetKey }, null, signal); if (signal.aborted) return; activeLease.current = added; setLease(added); setJob(null); setSnapshot(null); setMessage("Zoom端末接続に追加しました。次に読む範囲を確認してください。");
        })}>{lease ? "Zoom端末接続に追加済み" : "このZoomにエージェントを追加"}</button>
      </section></>}
      {lease && <section className={styles.work}><h2>4. 読取 → 実行 → 成果確認</h2><p>対象: {lease.target.title} / 接続期限 {new Date(lease.expiresAt).toLocaleTimeString()}</p>
        <label className={styles.labCheck}><input type="checkbox" checked={readConsent} disabled={!!busy || !!job} onChange={(e) => setReadConsent(e.target.checked)}/>この画面の表示文章を今一度だけ読み、Skyのプレビューに表示する</label>
        <button disabled={!!busy || !!job || !readConsent} onClick={() => void perform('Zoomを読取り中', async (signal) => { const r = await call<{ text: string; hash: string; observedAt: number }>('capture', { consent: true }, lease, signal); if (!signal.aborted) { setSnapshot(r); setReadConsent(false); } })}>Zoomから表示文章を取得</button>
        {snapshot && <><h3>読み取った素材</h3><pre className={styles.labResult}>{snapshot.text}</pre><p>この素材だけを {selected?.name} へ渡します。取得後2分以内に実行してください。</p>
          <button className={styles.runButton} disabled={!!busy || !!job} onClick={() => void perform("ローカルAIモデルで実行中", async (signal) => { const r = await call<{ job: WorkJob }>('run', { modelDigest: digest }, lease, signal); if (!signal.aborted) { setJob(r.job); setSnapshot(null); } })}>この素材でエージェントを実行</button></>}
        <button disabled={!!busy} onClick={() => void perform('状態を読戻し中', async (signal) => { const r = await call<{ job: WorkJob | null }>('state', {}, lease, signal); if (!signal.aborted) setJob(r.job); })}>応答不明時に仕事を読戻す</button>
      </section>}
      {(lease || busy) && <div className={styles.labActions}><button onClick={() => void stop()}>停止してエージェントを外す</button></div>}
      {job && <section className={styles.work} aria-live="polite"><h2>成果と仕事の状態</h2><SkyWorkProgress job={job} />
        {result && <>{job.skyApp && <SkyAppResultView binding={job.skyApp} />}<p>AIモデルが作った下書きです。会議の事実と照合してください。</p>
          {lease && <button disabled={!!busy || job.status !== 'review'} onClick={() => void perform('成果を確認中', async (signal) => { const r = await call<{ job: WorkJob }>('confirm', {}, lease, signal); if (!signal.aborted) setJob(r.job); })}>成果を確認済みにする</button>}
          <button onClick={() => download('sky-zoom-result.md', skyAppExport(job))}>成果を持ち出す</button>
          <details><summary>詳しい記録も保存する</summary><button onClick={() => download('sky-zoom-job.json', JSON.stringify(job, null, 2))}>素材と履歴を保存（JSON）</button></details>
          <SkyPortableExport key={`${job.id}/${job.revision}`} job={job}/></>}
      </section>}
      {busy && <output>{busy}。停止できます。</output>}{message && <output>{message}</output>}{error && <SkyNotice className={styles.labError} message={error} />}
      <section className={styles.devicePath}><p>設定・取得素材・成果はタブと端末開発サーバーのメモリ内。15分の失効・サーバー終了で接続は破棄されます。Ollamaのログ・OSの権限履歴は各実行環境の設定に従います。Skyのアカウント保存や一般公開には移しません。</p></section>
      <div className={styles.labActions}><Link href="/sky/add/zoom/interpret">Zoom標準の翻訳設定を見る</Link><Link href="/sky/add/zoom/lab">手入力だけで試す</Link><Link href="/sky/apps/planner/lab">同じSky基盤のPlanner</Link></div><ProductDomainNavigation/>
    </div>
  </div></main>;
}
