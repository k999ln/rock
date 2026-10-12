'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { collectSelectedData, collectedFileBytes, decryptDataCollection, encryptDataCollection, MAX_COLLECTION_BYTES, MAX_COLLECTION_ENVELOPE_BYTES, MAX_COLLECTION_FILES, type DataCollection } from '@/lib/data-collection';
import styles from './rockstar-addons.module.css';

function download(bytes: BlobPart, name: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const size = (bytes: number) => `${(bytes / 1024).toLocaleString('ja-JP', { maximumFractionDigits: 1 })} KiB`;

export default function DataCollectionWorkspace() {
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [archive, setArchive] = useState<File | null>(null);
  const [restored, setRestored] = useState<DataCollection | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const running = useRef(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const total = files.reduce((sum, file) => sum + file.size, new TextEncoder().encode(note).byteLength);
  async function run(action: 'export' | 'restore') {
    if (running.current) return;
    running.current = true; setBusy(true); setError(''); setMessage('');
    const current = ++generation.current;
    try {
      if (action === 'export') {
        const data = await collectSelectedData(files, note);
        const encrypted = await encryptDataCollection(data, passphrase);
        if (current !== generation.current) return;
        download(encrypted, `rockstar-data-${data.createdAt.slice(0, 10)}.rockdata`);
        setMessage('暗号化ファイルのダウンロードを開始しました。復旧パスフレーズは別に保管してください。');
      } else {
        if (!archive || archive.size > MAX_COLLECTION_ENVELOPE_BYTES) throw new Error('8 MiB以内のデータ回収ファイルを選んでください。');
        const data = await decryptDataCollection(await archive.text(), passphrase);
        if (current !== generation.current) return;
        setRestored(data);
        setMessage('暗号とファイル内容を確認しました。必要なファイルを取り出せます。');
      }
      setPassphrase('');
    } catch (reason) {
      if (current === generation.current) setError(reason instanceof Error ? reason.message : '処理できませんでした。選択したデータを確認してください。');
    } finally { if (current === generation.current) { running.current = false; setBusy(false); } }
  }
  function clear() {
    generation.current++; running.current = false; setBusy(false);
    setFiles([]); setNote(''); setArchive(null); setRestored(null); setPassphrase(''); setMessage('画面内のデータを消去しました。'); setError('');
  }
  return <main className={styles.page}>
    <Link href="/">← RockstarOS Home</Link>
    <header><p className={styles.eyebrow}>SELECTED DATA</p><h1>必要なデータを、手元に回収。</h1><p>選んだファイルとメモを、暗号化した一つのファイルにまとめます。この画面の処理は端末内で完結します。</p></header>
    <section className={styles.panel} aria-labelledby="collection-title"><h2 id="collection-title">1. 回収するものを選ぶ</h2>
      <p>最大20ファイル、メモを含めて合計2 MiB。SkyやLLMの成果は、各画面でダウンロードしたものを選べます。</p>
      <label>ファイル<input aria-label="回収するファイル" type="file" multiple disabled={busy} onChange={event => { setFiles(Array.from(event.target.files ?? [])); event.target.value = ''; setError(''); }} /></label>
      {files.length > 0 && <ul className={styles.list}>{files.map((file, index) => <li key={`${index}-${file.name}`}><span>{file.name} · {size(file.size)}</span><button disabled={busy} onClick={() => setFiles(current => current.filter((_, i) => i !== index))}>選択から外す</button></li>)}</ul>}
      <label>メモ<textarea rows={4} maxLength={65536} disabled={busy} value={note} onChange={event => setNote(event.target.value)} placeholder="一緒に残したい内容" /></label>
      <p>{files.length}件 · 合計 {size(total)}</p>
      {(total > MAX_COLLECTION_BYTES || files.length > MAX_COLLECTION_FILES) && <p role="alert">件数または容量の上限を超えています。選択を減らしてください。</p>}
    </section>
    <section className={styles.panel} aria-labelledby="collection-password"><h2 id="collection-password">2. パスフレーズを決めて保存する</h2>
      <label>復旧パスフレーズ（10文字以上）<input type="password" autoComplete="new-password" minLength={10} maxLength={256} value={passphrase} disabled={busy} onChange={event => setPassphrase(event.target.value)} /></label>
      <p className={styles.hint}>復元には同じパスフレーズが必要です。こちらでは保管・再発行できません。</p>
      <button className={styles.primary} disabled={busy || passphrase.length < 10 || (!files.length && !note.trim()) || total > MAX_COLLECTION_BYTES || files.length > MAX_COLLECTION_FILES} onClick={() => void run('export')}>{busy ? '処理中…' : '暗号化して書き出す'}</button>
    </section>
    <section className={styles.panel} aria-labelledby="collection-restore"><h2 id="collection-restore">保存したデータを復元する</h2>
      <p>上の欄に保存時のパスフレーズを入力して、回収ファイルを開きます。</p>
      <label>データ回収ファイル<input aria-label="復元するデータ回収ファイル" type="file" accept=".rockdata,application/json" disabled={busy} onChange={event => { setArchive(event.target.files?.[0] ?? null); setRestored(null); event.target.value = ''; setError(''); }} /></label>
      {archive && <p>{archive.name} · {size(archive.size)}</p>}
      <button disabled={busy || !archive || archive.size > MAX_COLLECTION_ENVELOPE_BYTES || passphrase.length < 10} onClick={() => void run('restore')}>内容を確認して復元</button>
      {restored && <div><p>保存日: {new Date(restored.createdAt).toLocaleString('ja-JP')}</p>{restored.note && <pre className={styles.note}>{restored.note}</pre>}<ul className={styles.list}>{restored.files.map(file => <li key={file.id}><span>{file.name} · {size(file.size)}</span><button onClick={() => download(Uint8Array.from(collectedFileBytes(file)).buffer, file.name)}>ファイルを取り出す</button></li>)}</ul>{restored.note && <button onClick={() => download(restored.note, 'rockstar-note.txt')}>メモを取り出す</button>}</div>}
    </section>
    <output aria-live="polite">{message}</output>{error && <p role="alert">{error}</p>}
    <div className={styles.actions}><button onClick={clear}>画面内のデータを消去</button><Link href="/add">追加機能を管理</Link><Link href="/chat?view=work">Sky・LLMの仕事と成果</Link></div>
    <p className={styles.hint}>再読込すると、保存前の選択内容と復元した内容は消えます。回収ファイルとパスフレーズは本人が管理してください。</p>
  </main>;
}
