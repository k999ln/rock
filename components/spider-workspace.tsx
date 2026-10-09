'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, FileCode2, Play, RotateCcw, ShieldCheck, Square } from 'lucide-react';
import type { ProgramLanguage, ProgramReport } from '@/toolkits/spider-guard/program-inspector.mjs';
import { MAX_PROGRAM_BYTES, MAX_PROGRAM_LINES } from '@/toolkits/spider-guard/program-inspector.mjs';
import { acknowledgeSpiderInspection, cancelSpiderInspection, finishSpiderInspection, startSpiderInspection } from '@/lib/spider-workflow';
import type { WorkJob } from '@/lib/workflow';
import styles from './spider-workspace.module.css';

const sampleSource: Record<ProgramLanguage, string> = {
  javascript: '// 架空データのサンプルです\nconst password = "spider-demo-only";\neval(userInput);',
  python: '# 架空データのサンプルです\npassword = "spider-demo-only"\neval(user_input)',
  text: '架空データのサンプルです\npassword = "spider-demo-only"\n担当者: sample@example.com',
};

export default function SpiderWorkspace() {
  const [source, setSource] = useState('');
  const [language, setLanguage] = useState<ProgramLanguage>('javascript');
  const [sample, setSample] = useState(false);
  const [report, setReport] = useState<ProgramReport | null>(null);
  const [job, setJob] = useState<WorkJob | null>(null);
  const [phase, setPhase] = useState<'idle' | 'checking' | 'ready' | 'stopped' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const worker = useRef<Worker | null>(null);
  const deadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revision = useRef(0);
  const mounted = useRef(true);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function stopWorker() {
    worker.current?.terminate();
    worker.current = null;
    if (deadline.current) clearTimeout(deadline.current);
    deadline.current = null;
  }

  useEffect(() => {
    const mountedRef = mounted, revisionRef = revision, workerRef = worker, deadlineRef = deadline;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      revisionRef.current++;
      workerRef.current?.terminate();
      if (deadlineRef.current) clearTimeout(deadlineRef.current);
    };
  }, []);

  function invalidate() {
    revision.current++;
    stopWorker();
    setReport(null);
    setJob(null);
    setMessage('');
    setPhase('idle');
  }

  function changeSource(value: string, isSample = false) {
    invalidate();
    setSource(value);
    setSample(isSample);
  }

  function inspect() {
    invalidate();
    if (!source.trim()) return;
    if (new TextEncoder().encode(source).length > MAX_PROGRAM_BYTES || source.split('\n').length > MAX_PROGRAM_LINES) {
      setPhase('error');
      setMessage('64 KiB・2,000行以内に分けて検査してください。入力はこの画面に残っています。');
      return;
    }
    const current = revision.current;
    const inspection = startSpiderInspection(crypto.randomUUID());
    const started = performance.now();
    setJob(inspection);
    setPhase('checking');
    const fail = (text: string) => {
      if (!mounted.current || current !== revision.current) return;
      revision.current++;
      stopWorker();
      setJob(cancelSpiderInspection(inspection));
      setPhase('error');
      setMessage(text);
    };
    try {
      const task = new Worker(new URL('../lib/spider-inspector-worker.ts', import.meta.url), { type: 'module' });
      worker.current = task;
      task.onmessage = ({ data }) => {
        if (!mounted.current || current !== revision.current || data.id !== current) return;
        if (data.failed) { fail('検査を完了できませんでした。入力と言語を確認し、もう一度検査してください。'); return; }
        stopWorker();
        const result: ProgramReport = data.report;
        setJob(finishSpiderInspection(inspection, result, performance.now() - started, sample));
        setReport(result);
        setPhase('ready');
      };
      task.onerror = () => fail('検査処理を起動できませんでした。このブラウザの設定を確認してください。');
      deadline.current = setTimeout(() => fail('検査に時間がかかったため停止しました。入力を小さく分けて再検査してください。'), 4000);
      task.postMessage({ id: current, source, language });
    } catch {
      fail('検査処理を起動できませんでした。入力はこの画面に残っています。');
    }
  }

  async function loadFile(file?: File) {
    if (!file) return;
    invalidate();
    const current = revision.current;
    if (file.size > MAX_PROGRAM_BYTES) {
      setPhase('error'); setMessage('ファイルは64 KiB以内にしてください。現在の入力は保持しています。'); return;
    }
    try {
      const content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      if (!mounted.current || current !== revision.current) return;
      if (content.includes('\0')) throw new Error('binary');
      // Match textarea newline normalization so finding selections stay aligned.
      setSource(content.replace(/\r\n?/g, '\n'));
      setSample(false);
      setLanguage(/\.py$/i.test(file.name) ? 'python' : /\.[cm]?[jt]sx?$/i.test(file.name) ? 'javascript' : 'text');
    } catch {
      if (!mounted.current || current !== revision.current) return;
      setPhase('error'); setMessage('UTF-8のテキストファイルを選んでください。現在の入力は保持しています。');
    }
  }

  function download() {
    if (!report || phase !== 'ready') return;
    // Reports contain only rule/line/count metadata, never source or filenames.
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'spider-inspection-report.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function jump(line: number, endLine: number) {
    const lines = source.split('\n');
    const start = lines.slice(0, line - 1).reduce((sum, row) => sum + row.length + 1, 0);
    const end = lines.slice(0, endLine).reduce((sum, row) => sum + row.length + 1, 0) - 1;
    input.current?.focus(); input.current?.setSelectionRange(start, Math.min(source.length, end));
    if (input.current) input.current.scrollTop = Math.max(0, (line - 3) * 23);
  }

  const headline = phase === 'checking' ? '入力を検査しています' : phase === 'error' ? '検査は未完了です' : phase === 'stopped' ? '検査を停止しました' : report ? report.counts.total ? `${report.counts.total}件の確認ポイント` : '対応ルールでは候補が見つかりませんでした' : '送る前に、SPIDERで確認。';
  return (
    <section className={styles.panel} aria-label="SPIDER セキュリティ検査">
      <header className={styles.hero}>
        <div className={`${styles.spider} ${phase === 'checking' ? styles.checking : ''} ${report?.counts.total ? styles.review : ''}`} aria-hidden="true">
          <svg viewBox="0 0 200 156" fill="none" stroke="currentColor" strokeWidth="1.1">
            <path d="M100 78 Q62 81 30 40 M100 78 Q72 56 61 23 M100 78 Q92 54 111 18 M100 78 Q111 42 157 38 M100 78 Q126 84 183 66 M100 78 Q150 109 161 132 M100 78 Q108 92 110 144 M100 78 Q71 115 46 126" />
            {[[30,40],[61,23],[111,18],[157,38],[183,66],[161,132],[110,144],[46,126]].map(([cx,cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3" stroke="#829fee" />)}
            <rect x="93" y="71" width="14" height="14" transform="rotate(45 100 78)" /><circle cx="100" cy="78" r="3.5" fill="currentColor" /><circle cx="100" cy="78" r="17" opacity=".2" />
          </svg>
        </div>
        <div><p className={styles.eyebrow}>SPIDER / SECURITY</p><h2 aria-live="polite">{headline}</h2><p>コードやテキストの秘密情報・個人情報・危険な処理の候補を、このブラウザ内で確認します。</p></div>
      </header>
      <p className={styles.privacy}><ShieldCheck size={17} aria-hidden="true" /> 入力は送信・保存しません。画面を閉じると入力と結果は消えます。</p>
      <div className={styles.grid}>
        <section className={styles.editor} aria-label="検査する入力">
          <div className={styles.toolbar}>
            <label>検査する言語<select value={language} onChange={(event) => { invalidate(); setLanguage(event.target.value as ProgramLanguage); }}><option value="javascript">JavaScript / TypeScript</option><option value="python">Python</option><option value="text">テキスト</option></select></label>
            <button type="button" onClick={() => fileInput.current?.click()}><FileCode2 size={16} /> ファイルを選ぶ</button>
            <input ref={fileInput} type="file" accept=".js,.jsx,.ts,.tsx,.mjs,.cjs,.py,.txt,.json,.md,.csv,.env" className={styles.fileInput} aria-label="検査するテキストファイル" onChange={(event) => { void loadFile(event.target.files?.[0]); event.target.value = ''; }} />
          </div>
          <label className={styles.inputLabel} htmlFor="spider-source">検査するコード・テキスト</label>
          <textarea id="spider-source" ref={input} value={source} onChange={(event) => changeSource(event.target.value)} placeholder="ここへコードやテキストを貼り付けてください" spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off" data-gramm="false" data-lpignore="true" />
          <div className={styles.inputInfo}><span>64 KiB / 2,000行まで</span><button type="button" onClick={() => changeSource(sampleSource[language], true)}>サンプルで試す</button></div>
          <div className={styles.actions}>
            <button className={styles.primary} type="button" disabled={!source.trim() || phase === 'checking'} onClick={inspect}><Play size={16} /> 検査する</button>
            {phase === 'checking' && <button type="button" onClick={() => { revision.current++; stopWorker(); if (job) setJob(cancelSpiderInspection(job)); setPhase('stopped'); }}><Square size={15} /> 停止</button>}
            <button type="button" onClick={() => changeSource('')}><RotateCcw size={15} /> 入力を消す</button>
          </div>
          {sample && <p className={styles.note}>架空データのサンプルです。実際の漏えいや攻撃の記録ではありません。</p>}
          {message && <p className={styles.error} role="alert">{message}</p>}
        </section>
        <section className={styles.results} aria-label="検査結果">
          <div className={styles.counts}>{([['secret','秘密情報'],['personal','個人情報'],['code','コード']] as const).map(([kind,label]) => <div key={kind}><span>{label}</span><strong>{report ? report.counts[kind] : '—'}</strong></div>)}</div>
          {!report ? <p className={styles.empty}>検査すると、確認すべき行と理由・対処方法がここに表示されます。</p> : <>
            {report.coverageLimited && <output className={styles.error}>一部を検査できませんでした。検査範囲を確認してください。</output>}
            {report.findings.length === 0 && <p className={styles.empty}>検出ゼロは安全の保証ではありません。実行環境や他のファイルも確認してください。</p>}
            <div className={styles.findings}>{report.findings.map((finding) => <article key={finding.id} className={styles.finding}><div className={styles.findingTop}><span>{finding.kind === 'secret' ? '秘密情報' : finding.kind === 'personal' ? '個人情報' : '危険な処理の候補'}</span><button type="button" onClick={() => jump(finding.line, finding.endLine)}>{finding.line}行目を見る</button></div><h3>{finding.title}</h3><p>{finding.why}</p><p className={styles.remediation}>対処：{finding.remediation}</p></article>)}</div>
            <div className={styles.actions}><button type="button" onClick={download}><Download size={16} /> 値を含まないレポート</button>{job?.status === 'review' && <button type="button" onClick={() => setJob(acknowledgeSpiderInspection(job))}>結果を確認しました</button>}</div>
            {job?.status === 'completed' && <output className={styles.note}>この画面での確認が完了しました。安全認定や外部送信の許可ではありません。</output>}
            <details className={styles.limits}><summary>今回の検査範囲</summary><ul>{report.limitations.map((item) => <li key={item}>{item}</li>)}</ul></details>
          </>}
        </section>
      </div>
      <p className={styles.note}>本人が入力した内容の静的検査です。他のアプリ・端末全体の監視や通信遮断は行いません。候補を確認して修正したら、再検査してください。</p>
    </section>
  );
}
