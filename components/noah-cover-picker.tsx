'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { NOAH_COVER_LIMIT, NOAH_COVER_TYPES } from '@/lib/noah-cover';
import css from './noah-cover-picker.module.css';

export type CoverChoice =
  | { kind: 'later' | 'existing' }
  | { kind: 'upload'; file?: File }
  | { kind: 'generate'; brief?: string; file?: File; accepted?: boolean; variation?: number };

export function coverBrief(name: string, summary: string) {
  return JSON.stringify([name.trim(), summary.trim()]);
}
export function coverReady(choice: CoverChoice, name: string, summary: string) {
  if (choice.kind === 'upload') return Boolean(choice.file);
  if (choice.kind === 'generate') return Boolean(choice.accepted && choice.file && choice.brief === coverBrief(name, summary));
  return true;
}

const formats: readonly string[] = NOAH_COVER_TYPES;
function baseMime(type: string) { return type.split(';')[0].toLowerCase().trim(); }

export default function NoahCoverPicker({ name, summary, id, value, onChange, existing }: {
  name: string; summary: string; id?: string; value: CoverChoice; onChange: (v: CoverChoice) => void;
  existing?: { src: string; type: string };
}) {
  const group = useId();
  const [error, setError] = useState<{ brief: string; text: string }>();
  const [busyFor, setBusyFor] = useState('');
  const preview = useRef<HTMLElement>(null);
  const context = useRef<AbortController | null>(null), currentJob = useRef<AbortController | null>(null);
  const brief = coverBrief(name, summary);
  const busy = busyFor === brief;
  const file = value.kind === 'upload' || (value.kind === 'generate' && value.brief === brief) ? value.file : undefined;
  const media = file ? { type:file.type, src:undefined } : value.kind === 'existing' ? existing : undefined;
  useEffect(() => {
    const el = preview.current?.querySelector('video,img');
    if (!el || !file) return;
    const url = URL.createObjectURL(file);
    el.setAttribute('src', url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    const lifetime = new AbortController();
    context.current = lifetime;
    return () => lifetime.abort();
  }, [brief, id]);
  function setMessage(text: string) { setError({ brief, text }); }

  function choose(next: CoverChoice) {
    currentJob.current?.abort();
    setError(undefined);
    setBusyFor('');
    onChange(next);
  }
  function chooseFile(selected?: File) {
    if (!selected) return;
    choose({ kind: 'upload' });
    if (!formats.includes(baseMime(selected.type))) { setMessage('PNG・JPEG・WebP・MP4・WebMから選んでください。'); return; }
    if (selected.size < 16 || selected.size > NOAH_COVER_LIMIT) { setMessage('ファイルは8 MiBまでです。サイズを確認して選び直してください。'); return; }
    onChange({ kind: 'upload', file: selected });
  }

  async function generate() {
    const variation = value.kind === 'generate' && value.file && value.brief === brief ? (value.variation ?? 0) + 1 : 0;
    choose({ kind: 'generate' });
    if (!name.trim() || !summary.trim()) return;
    const task = new AbortController();
    currentJob.current = task;
    const lifetime = context.current;
    const signal = lifetime ? AbortSignal.any([task.signal, lifetime.signal]) : task.signal;
    const clearBusy = () => setBusyFor('');
    signal.addEventListener('abort', clearBusy, { once: true });
    setBusyFor(brief);
    try {
      const { generateNoahAgentCardVideo } = await import('@/lib/noah-card-video');
      if (signal.aborted) return;
      const blob = await generateNoahAgentCardVideo({ id, name: name.trim(), summary: summary.trim(), variation, signal });
      if (signal.aborted) return;
      const type = baseMime(blob.type);
      if (!formats.includes(type) || !type.startsWith('video/') || blob.size < 16 || blob.size > NOAH_COVER_LIMIT) throw new Error('動画を保存できる形式で用意できませんでした。');
      const movie = new File([blob], type === 'video/mp4' ? 'agent-cover.mp4' : 'agent-cover.webm', { type });
      onChange({ kind: 'generate', file: movie, brief, variation });
    } catch (error) {
      if (!signal.aborted) setMessage(error instanceof Error ? error.message : '動画を作れませんでした。もう一度試すか、自分のファイルを選んでください。');
    } finally {
      signal.removeEventListener('abort', clearBusy);
      if (!signal.aborted) clearBusy();
    }
  }

  return <fieldset className={css.picker}>
    <legend>Agentの表紙</legend>
    <div className={css.options}>
      <label><input type="radio" name={group} checked={value.kind === 'upload'} onChange={() => choose({ kind: 'upload' })} />自分の画像・動画を使う</label>
      <label><input type="radio" name={group} checked={value.kind === 'generate'} onChange={() => void generate()} />おまかせで動画を作る</label>
      {existing && <label><input type="radio" name={group} checked={value.kind === 'existing'} onChange={() => choose({ kind: 'existing' })} />登録済みの表紙を使う</label>}
      <label><input type="radio" name={group} checked={value.kind === 'later'} onChange={() => choose({ kind: 'later' })} />表紙を指定しない</label>
    </div>
    {value.kind === 'upload' && <label className={css.upload}>画像・動画を選ぶ
      <input type="file" accept={formats.join(',')} onChange={event => chooseFile(event.currentTarget.files?.[0])} />
      <small>PNG・JPEG・WebP・MP4・WebM、8 MiBまで</small>
    </label>}
    {value.kind === 'generate' && <div className={css.generate}>
      {!name.trim() || !summary.trim() ? <p>Agentの名前と説明を先に入力してください。</p> : busy ? <output aria-live="polite">Agentの表紙動画を作成中…</output> :
        <button type="button" onClick={() => void generate()}>{file ? '動画を作り直す' : '動画を作る'}</button>}
      <button type="button" onClick={() => choose({ kind: 'later' })}>やめる</button>
    </div>}
    {media && <figure ref={preview} className={css.preview}>
      {media.type.startsWith('video/') ? <video aria-label="Agentの表紙動画のプレビュー" src={media.src} controls muted playsInline preload="metadata" /> :
        /* oxlint-disable-next-line next/no-img-element -- The preview reads a selected local Blob or a private authenticated original. */
        <img src={media.src} alt="Agentの表紙のプレビュー" />}
      <figcaption>表紙のプレビュー</figcaption>
      {value.kind === 'generate' && (value.accepted ? <output>この動画を表紙に使います</output> :
        <button type="button" onClick={() => onChange({ ...value, accepted:true })}>この動画を使う</button>)}
    </figure>}
    {error?.brief === brief && <p role="alert">{error.text}</p>}
  </fieldset>;
}
