'use client';

import { useEffect, useRef, useState } from 'react';
import type { LinuxLocalAgent, LinuxLocalRun } from '@/lib/sky-linux-local';
import styles from './sky-linux-local-lab.module.css';
import { SkyNotice } from '@/components/sky-feedback';

type Snapshot = {
  phase: string; phaseLabel: string; error: string | null;
  candidate: { id: string; name: string; bytes: number; license: string; source: string };
  models: { id: string; name: string; sha256: string }[]; agents: LinuxLocalAgent[];
  candidates: { id: string; name: string; bytes: number; license: string; source: string }[];
  selectedModelId: string; preparedModels: string[];
  preparation?: { label: string; receivedBytes: number; totalBytes: number } | null;
  inspectedModel?: Record<string, unknown>;
  runs: (LinuxLocalRun & { stateLabel: string })[];
};
async function api<T = Snapshot>(input: Record<string, unknown>): Promise<T> {
  const response = await fetch('/__sky/linux', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(12000) });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || '操作できませんでした。もう一度お試しください。');
  return result;
}
function download(filename: string, value: string) {
  const url = URL.createObjectURL(new Blob([value], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
export default function SkyLinuxLocalLab({ pixelLocal = false, eve = false }: { pixelLocal?: boolean; eve?: boolean }) {
  const [data, setData] = useState<Snapshot | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [connected, setConnected] = useState(false);
  const [name, setName] = useState('avokadoの開発の段取り担当');
  const [instructions, setInstructions] = useState('依頼を読んで、実行する順番、必要なもの、本人に確認することを短く整理する担当です。');
  const [agentId, setAgentId] = useState(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('agent') || ''), [input, setInput] = useState('');
  const [modelId, setModelId] = useState('');
  const [imported, setImported] = useState<Record<string, unknown> | null>(null);
  const [modelLink, setModelLink] = useState(''), [linkFormat, setLinkFormat] = useState('chatml');
  const [modelConsent, setModelConsent] = useState(false), [runConsent, setRunConsent] = useState(false);
  const request = useRef<{ id: string; fingerprint: string } | null>(null);
  const selected = agentId || data?.agents.at(-1)?.id || '';
  const candidates = data ? [...data.candidates, ...data.models.filter(m => !data.candidates.some(c => c.id === m.id))] : [];
  const chosenId = modelId || data?.selectedModelId || data?.candidate.id || '';
  const chosen = candidates.find(m => m.id === chosenId) as Snapshot['candidate'] | undefined;
  const agentModelId = data?.agents.find(a => a.id === selected)?.modelId;
  const readyForAgent = data?.phase === 'ready' && data.preparedModels.includes(agentModelId || '');
  useEffect(() => {
    let live = true;
    const refresh = () => api({ action: 'status' }).then(next => { if (live) { setData(next); setConnected(true); } }).catch(() => { if (live) { setConnected(false); setError('接続を確認できません。保存済みの記録を表示しています。実行結果は再接続後に確認してください。'); } });
    void refresh(); const timer = setInterval(() => void refresh(), 1500);
    return () => { live = false; clearInterval(timer); };
  }, []);
  async function act(value: Record<string, unknown>) {
    setBusy(true); setError('');
    try { const next = await api(value); setData(next); setConnected(true); if (next.inspectedModel) { setImported(next.inspectedModel); setModelConsent(false); } } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function run() {
    const bytes = new TextEncoder().encode(JSON.stringify([selected, input, eve]));
    const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    try { const previous = JSON.parse(sessionStorage.getItem('sky-linux-pending') || 'null'); if (previous?.fingerprint === fingerprint && /^[a-f0-9-]{36}$/.test(previous.id)) request.current = previous; } catch { setError('依頼番号を保存できません。保存設定を確認してください。'); return; }
    if (!request.current || request.current.fingerprint !== fingerprint) request.current = { id: crypto.randomUUID(), fingerprint };
    try { sessionStorage.setItem('sky-linux-pending', JSON.stringify(request.current)); } catch { setError('依頼番号を保存できません。実行は始めていません。'); return; }
    const selectedAgent = data?.agents.find(a => a.id === selected);
    const selectedModel = data?.models.find(m => m.id === selectedAgent?.modelId);
    await act({ action: 'run', agentId: selected, input, requestId: request.current.id, accepted: runConsent, ...(eve ? { surface: 'eve', agentSha256: selectedAgent?.sha256, modelSha256: selectedModel?.sha256 } : {}) });
  }
  async function exportRun(jobId: string, record = false) {
    setError('');
    try {
      const exported = await api<{ filename: string; text: string; record: unknown }>({ action: 'export', jobId });
      download(record ? 'Skyの仕事の記録.json' : exported.filename, record ? JSON.stringify(exported.record, null, 2) : exported.text);
    } catch (cause) { setError((cause as Error).message); }
  }
  async function readDefinition(file?: File) {
    setImported(null); setError('');
    if (!file) return;
    try {
      if (file.size > 16000) throw new Error('設定ファイルが大きすぎます。');
      const value = JSON.parse(await file.text());
      if (!['sky.local-model/1', 'sky.local-agent/1'].includes(value?.schema)) throw new Error('対応するAIか担当の設定ファイルを選んでください。');
      setImported(value); setModelConsent(false);
    } catch (cause) { setError((cause as Error).message.includes('。') ? (cause as Error).message : '設定ファイルを読み取れませんでした。'); }
  }
  const active = data?.runs.some(r => r.job.status === 'active' || r.stop === 'requested' || r.stop === 'unconfirmed');
  return <main className={styles.page}>
    <a href={pixelLocal ? '/' : '/sky'}>Skyへ戻る</a>
    {pixelLocal && <nav aria-label="仕事の入口"><button type="button" onClick={() => window.location.assign('/sky')}>Sky · 担当とAI</button><button type="button" onClick={() => window.location.assign(selected ? `/eve?agent=${encodeURIComponent(selected)}` : '/eve')}>Eve · 依頼と成果</button></nav>}
    <h1>{eve ? 'Eve · 何を進めますか？' : pixelLocal ? 'このPixelで、担当を動かす' : '自分のLinuxで、担当を動かす'}</h1>
    <p>{pixelLocal ? '計算・仕事の管理・保存は、このPixel本体のLinuxで行います。PCやクラウドへ依頼を送りません。本人用の試用で、一般公開はしていません。' : '本人用の試用画面です。計算は接続先PCの専用Linuxで行います。Pixelからも依頼・料金確認・成果保存・停止を操作できます。一般公開はしていません。'}</p>
    <p>対応範囲は文章の下書きです。アプリ操作や任意のプログラム実行は、別の対応が必要です。</p>
    {error && <SkyNotice message={error} className={styles.error} />}
    <section hidden={eve}><h2>1. モデルを追加する</h2>
      {data && chosen ? <><label>使うAI<select value={chosenId} onChange={e => { setModelId(e.target.value); setModelConsent(false); }}>{candidates.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><p>{chosen.name} · 約{Math.round(chosen.bytes / 1e6)}MB</p>
        <p>{pixelLocal ? "文章を作るためのAI本体です。初回の準備で取得し、Sky内部に保存します。保存済みなら確認して再利用します。取得時は通信を使います。" : "文章を作るためのAI本体です。接続先PCにあるAIを本人用Linuxへコピーし、同じAIは再利用します。"}</p>
        <p><a href={chosen.source} target="_blank" rel="noreferrer">配布元と使い方</a> · 利用条件：{chosen.license}</p>
        <label><input type="checkbox" checked={modelConsent} onChange={e => setModelConsent(e.target.checked)} />{pixelLocal ? '容量と利用条件を確認し、このPixelで使うAIとして登録します。' : '利用条件を確認し、接続先PCのモデルを本人用Linuxへコピーします。'}</label>
        <button disabled={busy || !modelConsent || data.models.some(m => m.id === chosenId)} onClick={() => void act({ action: 'add-model', modelId: chosenId, accepted: modelConsent })}>{data.models.some(m => m.id === chosenId) ? '追加済み' : 'このAIを追加'}</button>
      </> : <p>モデルを確認しています。</p>}
      <details><summary>リンクや設定ファイルからAI・担当を追加する</summary>
        <label>Hugging FaceのAIファイルのリンク<input type="url" value={modelLink} onChange={e => setModelLink(e.target.value)} /></label>
        <label>配布元で案内されている文章形式<select value={linkFormat} onChange={e => setLinkFormat(e.target.value)}><option value="chatml">Qwenなどの文章AI</option><option value="llama3">Llama 3系の文章AI</option></select></label>
        <button disabled={busy || !modelLink.trim()} onClick={() => void act({ action: 'inspect-model', link: modelLink.trim(), promptFormat: linkFormat })}>リンク先のAIを確認する</button>
        <input aria-label="AIか担当の設定ファイル" type="file" accept=".json,application/json" onChange={e => void readDefinition(e.target.files?.[0])} />
        {imported && <><p>{String(imported.name)} · {imported.schema === 'sky.local-model/1' ? `配布元：${String(imported.repository)}／利用条件：${String(imported.license)}／約${Math.round(Number(imported.bytes) / 1e6)}MB` : `使うAI：${String(imported.modelId)}／役割：${String(imported.instructions)}`}</p><p>文章作成だけに使います。AIの準備時は配布元から取得します。依頼の文章は送信しません。</p><label><input type="checkbox" checked={modelConsent} onChange={e => setModelConsent(e.target.checked)} />内容と利用条件を確認しました</label><button disabled={busy || !modelConsent} onClick={() => void act(imported.schema === 'sky.local-model/1' ? { action: 'add-model', model: imported, accepted: true } : { action: 'import-agent', agentFile: imported, accepted: true })}>確認して追加</button></>}
      </details>
    </section>
    <section hidden={eve}><h2>2. 使う環境を準備する</h2>
      <p>AIを動かす共通部品もSky内部で使い回します。取得に失敗した途中のファイルは片付けます。成果と担当設定は、保存を選んだときに書き出します。</p>
      <p>{pixelLocal ? 'このPixelのLinuxへ、確認済みの実行機能とモデルを配置します。初回は必要な標準ライブラリを取得する場合があります。' : '専用Linuxを用意し、確認済みの実行機能とモデルを配置します。初回は無料の配布ファイルを取得します。既存の仮想環境は変更しません。'}</p>
      <output>{data?.phaseLabel || '状態を確認しています'}</output>
      {data?.preparation && <p>{data.preparation.label}{data.preparation.receivedBytes > 0 ? ` · ${Math.round(data.preparation.receivedBytes / 1e6)} / ${Math.round(data.preparation.totalBytes / 1e6)}MB` : ''}</p>}
      {data?.error && <SkyNotice message={data.error} className={styles.error} />}
      <button disabled={busy || !data?.models.some(m => m.id === chosenId) || data.phase === 'preparing' || active} onClick={() => void act({ action: 'prepare', modelId: chosenId, accepted: true })}>選んだAIの環境を準備する</button>
      <button disabled={busy || !data || ['stopped', 'none', 'added'].includes(data.phase)} onClick={() => void act({ action: 'stop-environment' })}>{data?.phase === 'preparing' ? '準備を停止する' : pixelLocal ? 'AIの実行を停止する（成果は残す）' : 'Linuxを停止する（成果は残す）'}</button>
    </section>
    <section hidden={eve}><h2>3. 自分の担当を作る</h2>
      <label>担当の名前<input value={name} maxLength={80} onChange={e => setName(e.target.value)} /></label>
      <label>何を任せる担当か<textarea value={instructions} maxLength={1200} onChange={e => setInstructions(e.target.value)} /></label>
      <p>この担当が使うAI：{chosen?.name}</p>
      <button disabled={busy || !data?.models.some(m => m.id === chosenId)} onClick={() => void act({ action: 'add-agent', agent: { name, instructions, modelId: chosenId } })}>この担当を追加する</button>
      {data?.agents.map(a => <p key={a.id}>{a.name} — 追加済み</p>)}
    </section>
    <section><h2>{eve ? '選んだ担当に依頼する' : '4. 料金を確認して依頼する'}</h2>
      <p><strong>この試用のクラウドAI使用料：0円／自作の担当代：0円</strong></p>
      <p>本人用LinuxのCPU・メモリ・保存容量を使います。電気代・機器代は未計測です。基本月額は未確定で、この試用では契約や請求を開始しません。</p>
      <p>仕事が終わるとモデルの計算は終了します。Linuxと保存したファイルは残ります。</p>
      <label>任せる担当<select value={selected} onChange={e => { setAgentId(e.target.value); setRunConsent(false); }}><option value="" disabled>担当を選ぶ</option>{data?.agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label>今回の依頼<textarea value={input} maxLength={4000} placeholder="実際に任せたいことを入力してください" onChange={e => { setInput(e.target.value); setRunConsent(false); }} /></label>
      <label><input type="checkbox" checked={runConsent} onChange={e => setRunConsent(e.target.checked)} />{pixelLocal ? 'この料金と実行先を確認しました。依頼と成果をこのPixel内に保存して実行します。' : 'この料金と実行先を確認しました。依頼と成果を接続先PCと本人用Linuxへ保存して実行します。'}</label>
      {selected && !readyForAgent && <button disabled={busy || active || data?.phase === 'preparing'} onClick={() => void act({ action: 'prepare', modelId: agentModelId, accepted: true })}>担当が使うAIを準備する</button>}
      <button disabled={busy || !connected || !selected || !input.trim() || !runConsent || !readyForAgent || active} onClick={() => void run()}>この担当に依頼する</button>
      <button disabled={busy || !selected} onClick={() => void api<{ text: string }>({ action: 'export-agent', agentId: selected }).then(v => download('Skyの担当.json', v.text)).catch(cause => setError(cause.message))}>担当の設定を保存</button>
      <button disabled={busy || active} onClick={() => { request.current = null; sessionStorage.removeItem('sky-linux-pending'); setInput(''); setRunConsent(false); }}>別の依頼を作る</button>
    </section>
    <section><h2>{eve ? '進捗と成果' : '5. 成果を確認・保存する'}</h2>
      {!data?.runs.length && <p>まだ仕事はありません。</p>}
      {data?.runs.map(r => <article key={r.job.id} className={styles.run}>
        <h3>{r.agent.name}</h3><output>{r.stateLabel}</output>
        {r.error && <SkyNotice message={r.error} className={styles.error} />}
        {r.text && <><p>下書きです。内容を確認してください。</p><div className={styles.result}>{r.text.split('\n').map((line, index) => <p key={index}>{line.split(/(\*\*[^*]+\*\*)/u).map((part, partIndex) => part.startsWith('**') && part.endsWith('**') ? <strong key={partIndex}>{part.slice(2, -2)}</strong> : part)}</p>)}</div>
          <button onClick={() => void exportRun(r.job.id)}>成果を文章で保存</button>
          {r.job.status === 'review' && <button disabled={busy} onClick={() => void act({ action: 'confirm', jobId: r.job.id })}>内容を確認した</button>}</>}
        {r.job.status === 'active' && <button disabled={busy} onClick={() => void act({ action: 'stop', jobId: r.job.id })}>この仕事を停止する</button>}
        {r.stop === 'unconfirmed' && <button disabled={busy} onClick={() => void act({ action: 'stop', jobId: r.job.id })}>停止をもう一度確認する</button>}
        <p>この仕事のクラウドAI使用料：0円。電気代・機器代は未計測です。</p>
        <details><summary>詳しい記録</summary><p>依頼：{r.input}</p><p>仕事の状態：{r.job.status}／停止の確認：{r.stop}</p><p>モデル：{r.modelSha256}</p><p>実行時間：{r.durationMs === null ? '未確認' : `${(r.durationMs / 1000).toFixed(1)}秒`}</p>
          {r.text && <button onClick={() => void exportRun(r.job.id, true)}>仕事と担当の設定も保存</button>}
        </details>
      </article>)}
    </section>
    <p>成果は普通の文章ファイルで持ち出せます。SkyやLinuxを止めた後も読めます。</p>
  </main>;
}
