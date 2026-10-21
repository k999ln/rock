'use client';

import { SkyNotice, SkyWorkProgress } from '@/components/sky-feedback';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ProductDomainNavigation } from '@/components/product-domain-navigation';
import { SkyAppServerPanel } from '@/components/sky-app-server-panel';
import { beginPrivateZoomRun, cancelPrivateZoomRun, confirmPrivateZoomRun, executePrivateZoomRun,
  parsePrivateZoomAgent, privateZoomResultMarkdown, zoomLabOutputs,
  type PrivateZoomAgent, type PrivateZoomRun } from '@/lib/sky-private-zoom-lab';
import { SkyPortableExport } from '@/components/sky-portable-export';
import { SkyAppResultView } from '@/components/sky-app-result-view';
import styles from './sky-add-zoom-prototype.module.css';

const initialRecipe: PrivateZoomAgent = {
  schema: 'sky.private-zoom-recipe/1', name: '会議の決定と担当を整理',
  purpose: 'Zoom会議後の決定事項と担当を手元で確認したい',
  outputs: ['summary', 'decisions', 'owners'], summaryLines: 2, decisionLabel: '決定', ownerLabel: '担当',
};
const sample = '会議: Skyの本人用テスト\n決定: 一般公開せず、自分の環境で試す\n担当: Kai — 作成から停止まで確認する\n決定: 取得した成果を持ち出せるようにする';
const labels = { summary: '概要（先頭行の抜粋）', decisions: '決定事項', owners: '担当' };
const states = { active: '実行中', review: '成果の確認待ち', completed: '確認済み', cancelled: '停止済み' };

function download(name: string, value: string, type: string) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function SkyPrivateZoomLab() {
  const [form, setForm] = useState(initialRecipe);
  const [created, setCreated] = useState<PrivateZoomAgent | null>(null);
  const [approved, setApproved] = useState(false);
  const [added, setAdded] = useState(false);
  const [notes, setNotes] = useState(sample);
  const [run, setRun] = useState<PrivateZoomRun | null>(null);
  const [error, setError] = useState('');
  const [past, setPast] = useState<{ id: string; name: string; status: string }[]>([]);
  const current = useRef<PrivateZoomRun | null>(null);
  const controller = useRef<AbortController | null>(null);
  const editorVersion = useRef(0);
  const running = run?.job.status === 'active';

  useEffect(() => () => { controller.current?.abort(); }, []);
  function put(next: PrivateZoomRun | null) { current.current = next; setRun(next); }
  function stop() {
    controller.current?.abort(); controller.current = null;
    if (current.current) put(cancelPrivateZoomRun(current.current));
  }
  function archive() {
    const old = current.current;
    if (old) setPast((items) => [{ id: old.job.id, name: old.recipe.name, status: states[old.job.status] }, ...items].slice(0, 10));
  }
  function invalidate() {
    editorVersion.current += 1;
    stop(); archive(); put(null);
    setCreated(null); setAdded(false); setApproved(false); setError('');
  }
  function edit(patch: Partial<PrivateZoomAgent>) { invalidate(); setForm((value) => ({ ...value, ...patch })); }
  function create() {
    invalidate();
    try { setCreated(parsePrivateZoomAgent(form)); } catch (cause) { setError((cause as Error).message); }
  }
  async function importRecipe(file: File | undefined) {
    if (!file) return;
    invalidate();
    const version = editorVersion.current;
    try {
      if (file.size > 12000) throw new Error('設定ファイルは12KBまでです。');
      const recipe = parsePrivateZoomAgent(JSON.parse(await file.text()));
      if (version !== editorVersion.current) return;
      setForm(recipe); setCreated(recipe);
    } catch (cause) { if (version === editorVersion.current) setError((cause as Error).message); }
  }
  async function start() {
    if (!created || !added || controller.current || current.current?.job.status === 'review') return;
    setError('');
    try {
      const input = notes;
      const initial = beginPrivateZoomRun(created, input, crypto.randomUUID());
      archive();
      const active = new AbortController(); controller.current = active; put(initial);
      try {
        const result = await executePrivateZoomRun(initial, input, { signal: active.signal,
          onProgress: (progress) => { if (controller.current === active && !active.signal.aborted) put(progress); } });
        if (controller.current === active && !active.signal.aborted) put(result);
      } catch (cause) {
        if (controller.current === active && !active.signal.aborted) { stop(); setError((cause as Error).message); }
      } finally { if (controller.current === active) controller.current = null; }
    } catch (cause) { setError((cause as Error).message); }
  }
  function changeNotes(value: string) {
    if (running) return;
    stop(); archive(); put(null); setNotes(value); setError('');
  }
  function remove() { stop(); archive(); put(null); setAdded(false); setApproved(false); setError(''); }
  function clear() { invalidate(); setForm(initialRecipe); setNotes(''); setPast([]); }

  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.header}><div className={styles.brand}><span className={styles.mark}>✦</span><div><strong>Sky Add</strong><small>本人用 / Zoom エージェント Lab</small></div></div><span className={styles.host}>非公開・端末内テスト</span></header>
    <section className={styles.hero}>
      <p className={styles.eyebrow}>作る → 追加 → 試す → 確認 → 停止</p><h1>自分の欲しい機能を、エージェントに。</h1>
      <p>Zoom会議後に使う「メモ整理エージェント」を自分で設定して試せます。</p>
    </section>
    <section className={styles.devicePath}><strong>このLabでできること</strong>
      <p><Link href="/sky/add/zoom/device">実Zoomとログイン不要AIモデルで試す（Mac本人用）</Link></p>
      <p>手入力メモの整理をこのタブ内で実行します。Zoomの画面・音声・会議データへは未接続です。端末エージェントによる実Zoom操作は次の段階です。</p>
      <p>費用は0円。通常はメモ・設定・成果をこのタブ内だけで処理し、再読込みで消えます。本人用APIへの保存は成果欄の別操作です。残したい設定と成果は持ち出してください。一般公開・Registry登録は行いません。</p>
    </section>
    <div className={styles.content}>
      <section className={styles.work}>
        <h2>1. エージェントを作成</h2><p>対応する機能は概要の抜粋と、見出し付きの決定事項・担当の抽出です。目的文は説明として保存されます。自由な文章から新しい処理やコードを生成する機能は未接続です。</p>
        <label htmlFor="lab-purpose">Zoomで欲しい機能</label><input id="lab-purpose" className={styles.labInput} maxLength={240} value={form.purpose} onChange={(e) => edit({ purpose: e.target.value })} />
        <label htmlFor="lab-name">エージェント名</label><input id="lab-name" className={styles.labInput} maxLength={80} value={form.name} onChange={(e) => edit({ name: e.target.value })} />
        <fieldset className={styles.labFieldset}><legend>返してほしい成果</legend>{zoomLabOutputs.map((output) => <label key={output} className={styles.labCheck}><input type="checkbox" checked={form.outputs.includes(output)} onChange={(e) => edit({ outputs: e.target.checked ? [...form.outputs, output] : form.outputs.filter((v) => v !== output) })} />{labels[output]}</label>)}</fieldset>
        <div className={styles.labGrid}>
          <label htmlFor="lab-lines">概要の行数<input id="lab-lines" className={styles.labInput} type="number" min={1} max={5} value={form.summaryLines} onChange={(e) => edit({ summaryLines: Number(e.target.value) })} /></label>
          <label htmlFor="lab-decision">決定を示す見出し<input id="lab-decision" className={styles.labInput} maxLength={24} value={form.decisionLabel} onChange={(e) => edit({ decisionLabel: e.target.value })} /></label>
          <label htmlFor="lab-owner">担当を示す見出し<input id="lab-owner" className={styles.labInput} maxLength={24} value={form.ownerLabel} onChange={(e) => edit({ ownerLabel: e.target.value })} /></label>
        </div>
        <p>例: 「{form.decisionLabel || '決定'}: 月曜に確認」「{form.ownerLabel || '担当'}: Kai」。見出しは完全一致で抽出します。概要は先頭行の抜粋です。</p>
        <div className={styles.labActions}><button type="button" className={styles.addButton} onClick={create}>エージェントを作成</button>
          <label className={styles.labFile}>設定JSONを読み込む<input type="file" accept="application/json,.json" onChange={(e) => { void importRecipe(e.target.files?.[0]); e.target.value = ''; }} /></label></div>
      </section>
      {created && <section className={styles.work}><h2>2. 確認して追加</h2><h3>{created.name}</h3><p>{created.purpose}</p>
        <dl className={styles.details}><div><dt>実行先</dt><dd>このLabのブラウザー内</dd></div><div><dt>読む情報</dt><dd>本人が貼り付けたメモだけ・最大6000文字/120行</dd></div><div><dt>成果</dt><dd>{created.outputs.map((v) => labels[v]).join('、')}</dd></div><div><dt>権限・費用</dt><dd>Zoom操作なし・外部送信なし・保存先はこのタブ・0円</dd></div></dl>
        <label className={styles.labCheck}><input type="checkbox" checked={approved} disabled={added} onChange={(e) => setApproved(e.target.checked)} />この内容で、手入力メモをこのタブ内で処理する</label>
        <div className={styles.labActions}><button type="button" className={styles.addButton} disabled={!approved || added} onClick={() => setAdded(true)}>{added ? "このLabに追加済み" : "このLabに追加"}</button>
          <button type="button" onClick={() => download('sky-zoom-agent.json', JSON.stringify(created, null, 2), 'application/json')}>エージェント設定を持ち出す</button>
          {added && <button type="button" onClick={remove}>エージェントを外す</button>}</div>
        <p>設定を編集・読み込みすると追加は解除されます。再度確認して追加してください。</p>
      </section>}
      {added && <section className={styles.work}><h2>3. 実行して成果を確認</h2>
        <label htmlFor="lab-notes">会議メモ</label><textarea id="lab-notes" rows={7} maxLength={6000} disabled={running} value={notes} onChange={(e) => changeNotes(e.target.value)} />
        <small>{notes.length}/6000文字・{notes.split(/\r?\n/u).length}/120行</small>
        <div className={styles.labActions}><button type="button" className={styles.runButton} onClick={() => void start()} disabled={running || run?.job.status === 'review' || !notes.trim()}>エージェントを実行</button>
          <button type="button" onClick={stop} disabled={!run || !['active', 'review'].includes(run.job.status)}>停止して成果を破棄</button></div>
        {run && <div className={styles.result} aria-live="polite"><SkyWorkProgress job={run.job} />
          <ol>{run.job.steps.map((step) => <li key={step.id}>{step.title}: {step.passed ? '完了' : run.job.status === 'cancelled' ? '停止' : '待機'}</li>)}</ol>
          {run.artifact && <>{run.job.skyApp && <SkyAppResultView binding={run.job.skyApp} />}
            <div className={styles.labActions}><button type="button" disabled={run.job.status !== 'review'} onClick={() => { if (current.current) put(confirmPrivateZoomRun(current.current)); }}>成果を確認済みにする</button>
              <button type="button" onClick={() => download('sky-zoom-result.md', privateZoomResultMarkdown(run), 'text/markdown;charset=utf-8')}>成果を持ち出す（Markdown）</button>
              <button type="button" onClick={() => download('sky-zoom-run.json', JSON.stringify(run, null, 2), 'application/json')}>成果と履歴を持ち出す（JSON）</button></div></>}
          {run.job.status === 'cancelled' && <p>停止を記録しました。この実行の成果は表示・持出しされません。同じエージェントで新しい実行を始められます。</p>}
          <SkyPortableExport key={`${run.job.id}/${run.job.revision}`} job={run.job} /><SkyAppServerPanel key={run.job.id} local={run.job} />
        </div>}
      </section>}
      {error && <SkyNotice className={styles.labError} message={error} />}
      {past.length > 0 && <section className={styles.work}><h2>このタブの過去の実行（最大10件）</h2><ul>{past.map((item) => <li key={item.id}>{item.name} — {item.status}</li>)}</ul><p>過去の本文・成果は保持しません。再実行や編集の前に持ち出してください。</p></section>}
      <div className={styles.labActions}><button type="button" onClick={clear}>このタブのデータを消去</button><Link href="/sky/add/zoom">Sky 追加の入口</Link><Link href="/sky/apps/planner/lab">同じ基盤のPlanner Lab</Link></div>
      <ProductDomainNavigation />
    </div>
    <footer className={styles.footer}>developmentのこのPCだけで利用可能。Sky共通基盤の仕事状態・更新番号・成果・停止を使います。本人アカウント保存はサーバーの明示設定・認証・保存同意が必要です。Zoomへの追加・操作、任意機能の生成は未接続です。</footer>
  </div></main>;
}
