'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Copy, Download, FileText, Sparkles } from 'lucide-react';
import WorkspaceShell from '@/components/workspace-shell';
import {
  conversationDiagramToSvg, diagramConversation, formatConversationDiagrams,
  SKY_CONVERSATION_DIAGRAM_MAX_INPUT,
} from '@/lib/conversation-diagram';
import styles from './conversation-diagram-workspace.module.css';

const sample = `プリントンの選考も、その方向性で選んだ。自分がやりたいことがそれだから、その基準で判断した。\n\n最初は別の案も考えていた。でも、長く続けたいことを優先すると、今の方向が一番合っていると思った。`;

function safeDiagram(text: string) {
  try { return { result: diagramConversation(text), error: '' }; }
  catch (cause) { return { result: diagramConversation(''), error: cause instanceof Error ? cause.message : '入力を確認してください。' }; }
}

export default function ConversationDiagramWorkspace() {
  const [transcript, setTranscript] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [notice, setNotice] = useState('');
  const { result, error } = useMemo(() => safeDiagram(transcript), [transcript]);
  const active = result.paragraphs[activeIndex];

  function changeTranscript(value: string) {
    setTranscript(value);
    setActiveIndex(0);
    setNotice('');
  }

  async function loadTextFile(file?: File) {
    if (!file) return;
    setNotice('');
    if (file.size > 150_000) { setNotice('テキストファイルは150KB以内にしてください。'); return; }
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      changeTranscript(text);
    } catch { setNotice('UTF-8のテキストファイルを選んでください。'); }
  }

  async function copyAll() {
    if (!result.paragraphs.length) return;
    try { await navigator.clipboard.writeText(formatConversationDiagrams(result)); setNotice('全段落のテキスト図解をコピーしました。'); }
    catch { setNotice('コピーできませんでした。ブラウザの権限を確認してください。'); }
  }

  function downloadSvg() {
    if (!active) return;
    const url = URL.createObjectURL(new Blob([conversationDiagramToSvg(active)], { type: 'image/svg+xml;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `sky-conversation-diagram-${active.index + 1}.svg`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(`段落${active.index + 1}のSVGを保存しました。`);
  }

  return <WorkspaceShell title="Sky" contentClassName={styles.shell} tone="sky">
    <div className={styles.page}>
      <nav className={styles.breadcrumb}><Link href="/sky">Sky</Link><span>/</span><Link href="/sky/marketplace">Tool</Link><span>/</span>会話図解 · Visual Scribe</nav>
      <header className={styles.header}>
        <p>VISUAL SCRIBE · BROWSER ONLY</p>
        <h1>話したことを、<br />段落ごとの流れにする。</h1>
        <div>会話や文字起こしを貼ると、空行ごとに分けて「話題 → 展開 → 判断 → 着地」の図へ自動変換します。</div>
      </header>

      <div className={styles.grid}>
        <section className={styles.inputPanel} aria-label="会話の入力">
          <div className={styles.panelHead}><span>01 / INPUT</span><strong>会話・文字起こし</strong></div>
          <label htmlFor="conversation-transcript">図解したい文章</label>
          <textarea id="conversation-transcript" value={transcript} maxLength={SKY_CONVERSATION_DIAGRAM_MAX_INPUT} rows={18}
            placeholder={'話した内容をここに貼り付けます。\n\n空行を入れると、段落ごとに別の図になります。'}
            onChange={(event) => changeTranscript(event.target.value)} />
          <div className={styles.inputMeta}><span>{transcript.length.toLocaleString()} / {SKY_CONVERSATION_DIAGRAM_MAX_INPUT.toLocaleString()}文字</span><span>{result.paragraphs.length}段落</span></div>
          <div className={styles.inputActions}>
            <label className={styles.fileButton}><FileText size={16} /> .txtを開く<input type="file" accept=".txt,text/plain" onChange={(event) => void loadTextFile(event.target.files?.[0])} /></label>
            <button type="button" onClick={() => changeTranscript(sample)}><Sparkles size={16} /> サンプル</button>
            {transcript && <button type="button" onClick={() => changeTranscript('')}>クリア</button>}
          </div>
          <div className={styles.terms}>入力・図解ともこの画面だけ · 外部送信なし · モデル推論なし · 無料 · 再読み込みで消去</div>
          {error && <p role="alert" className={styles.notice}>{error}</p>}
        </section>

        <section className={styles.outputPanel} aria-label="段落ごとの図解" aria-live="polite">
          <div className={styles.panelHead}><span>02 / DIAGRAM</span><strong>{active ? `段落 ${active.index + 1} / ${result.paragraphs.length}` : '入力待ち'}</strong></div>
          {active ? <>
            <div className={styles.diagramNav}>
              <button type="button" aria-label="前の段落" disabled={activeIndex === 0} onClick={() => setActiveIndex((value) => value - 1)}><ChevronLeft size={18} /></button>
              <select aria-label="表示する段落" value={activeIndex} onChange={(event) => setActiveIndex(Number(event.target.value))}>
                {result.paragraphs.map((paragraph) => <option key={paragraph.id} value={paragraph.index}>{paragraph.index + 1}. {paragraph.title}</option>)}
              </select>
              <button type="button" aria-label="次の段落" disabled={activeIndex === result.paragraphs.length - 1} onClick={() => setActiveIndex((value) => value + 1)}><ChevronRight size={18} /></button>
            </div>
            <div className={styles.diagramCard}>
              <p>PARAGRAPH {active.index + 1}</p>
              <h2>{active.title}</h2>
              <div className={styles.flow}>
                {active.nodes.map((node, index) => <div className={styles.flowItem} key={`${node.kind}-${index}`}>
                  <article><span>{node.kind}</span><div>{node.text}</div></article>
                  {index < active.nodes.length - 1 && <div className={styles.arrow} aria-hidden="true">↓</div>}
                </div>)}
              </div>
            </div>
            <details className={styles.original}><summary>元の段落を確認</summary><p>{active.original}</p></details>
            <div className={styles.outputActions}>
              <button type="button" onClick={() => void copyAll()}><Copy size={16} /> 全段落をコピー</button>
              <button type="button" onClick={downloadSvg}><Download size={16} /> この図をSVG保存</button>
            </div>
          </> : <div className={styles.empty}><div>文章を貼ると、ここに図解が自動で現れます。</div><small>空行ごとに1つの図を作ります。</small></div>}
          {notice && <output className={styles.notice}>{notice}</output>}
        </section>
      </div>
      <p className={styles.footer}>{result.warnings[0] ?? '図解は入力後に自動生成されます。'} 元の段落を確認してから共有してください。</p>
    </div>
  </WorkspaceShell>;
}
