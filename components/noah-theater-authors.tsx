'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Play } from 'lucide-react';
import type { NoahFeedEntry, NoahFeedPage } from '@/lib/noah-feed';
import { noahReleaseCoverUrl } from '@/lib/noah-cover';
import { useNoahLocale } from './noah-locale';
import styles from './noah-theater-authors.module.css';

function AuthorGuide({ text }: { text: string }) {
  const blocks: { tag: 'p' | 'h4' | 'ul' | 'ol'; lines: string[] }[] = [];
  let previous: (typeof blocks)[number] | undefined;
  for (const line of text.split('\n')) {
    const value = line.trim();
    if (!value) { previous = undefined; continue; }
    const marker = /^(#{1,6}|[-*+]|\d+\.)\s+(.*)$/.exec(value);
    const prefix = marker?.[1] ?? '';
    const tag = !prefix ? 'p' : prefix.startsWith('#') ? 'h4' : /^\d/.test(prefix) ? 'ol' : 'ul';
    if (!previous || previous.tag !== tag || tag === 'h4') {
      previous = { tag, lines: [] };
      blocks.push(previous);
    }
    previous.lines.push(marker?.[2] ?? value);
  }
  // React escapes each string. Links, HTML and media in a guide are always plain text.
  return <div className={styles.guide}>{blocks.map(({ tag: Tag, lines }, index) =>
    <Tag key={index}>{Tag === 'ul' || Tag === 'ol'
      ? lines.map((line, i) => <li key={i}>{line}</li>) : lines.join('\n')}</Tag>)}</div>;
}

export function NoahAuthorScreening({ entry, onBack }: { entry: NoahFeedEntry; onBack: () => void }) {
  const { t } = useNoahLocale();
  const [failed, setFailed] = useState(false);
  const media = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const player = media.current;
    return () => { player?.pause(); };
  }, [entry.digest]);
  return <article className={styles.screening}>
    <div className={styles.heading}><h2>{entry.name}</h2><button type="button" onClick={onBack}>{t('上映作品に戻る')}</button></div>
    {failed ? <output>{t('この動画は現在再生できません。')}</output> :
      <video ref={media} controls muted playsInline preload="none" aria-label={entry.name}
        src={noahReleaseCoverUrl(entry.packageKey, entry.digest, true)} onError={() => setFailed(true)} />}
    <p>{entry.summary}</p>
    {entry.guideMarkdown && <details><summary>{t('使い方ガイド')}</summary><AuthorGuide text={entry.guideMarkdown} /></details>}
    <Link href={'/noah/marketplace?package=' + encodeURIComponent(entry.packageKey)}>{t('詳細・利用条件')} <ArrowUpRight size={15} aria-hidden="true" /></Link>
  </article>;
}

export default function NoahTheaterAuthors({ selectedDigest, onSelect }: { selectedDigest: string; onSelect: (entry: NoahFeedEntry) => void }) {
  const { t } = useNoahLocale();
  const [clips, setClips] = useState<NoahFeedEntry[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  const flight = useRef<AbortController | null>(null);

  const read = useCallback(async (cursor?: string | null) => {
    if (flight.current) return;
    const controller = new AbortController();
    flight.current = controller;
    try {
      const params = new URLSearchParams({ order: 'latest', media: 'video' });
      if (cursor) params.set('cursor', cursor);
      const response = await fetch('/api/noah/feed?' + params, { cache: 'no-store', credentials: 'omit', signal: controller.signal });
      if (!response.ok) {
        if (cursor && response.status === 400 && !controller.signal.aborted) setNext(null);
        throw new Error();
      }
      const page: NoahFeedPage = await response.json();
      if (!Array.isArray(page.entries)) throw new Error();
      if (controller.signal.aborted) return;
      const entries = page.entries.filter(entry => entry.isAgent && entry.cover?.type.startsWith('video/'));
      setClips(previous => [...new Map([...(cursor ? previous : []), ...entries].map(entry => [entry.packageKey, entry])).values()]);
      setNext(page.nextCursor);
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      if (flight.current === controller) { flight.current = null; setBusy(false); }
    }
  }, []);
  useEffect(() => {
    let mounted = true;
    void Promise.resolve().then(() => { if (mounted) void read(); });
    return () => { mounted = false; flight.current?.abort(); flight.current = null; };
  }, [read]);

  return <section className={styles.authors} aria-label={t('作者の上映室')}>
    <div className={styles.heading}><h2>{t('作者の上映室')}</h2>
      <Link href="/noah/publisher">{t('動画を掲載する')} <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
    {!clips.length && !busy && !failed && !next && <p className={styles.empty}>{t('公開された作者の動画はまだありません。')}</p>}
    {busy && <output>{t('動画を読み込み中…')}</output>}
    {clips.length > 0 && <ul>{clips.map(clip => <li key={clip.packageKey}>
      <button type="button" aria-pressed={clip.digest === selectedDigest} onClick={() => onSelect(clip)}>
        <Play size={16} aria-hidden="true" /><span><strong>{clip.name}</strong><small>{clip.author}</small></span>
      </button>
    </li>)}</ul>}
    {failed && <output>{t('上映作品を読み込めませんでした。')}</output>}
    {(failed || next) && <button type="button" className={styles.more} disabled={busy} onClick={() => {
      setBusy(true); setFailed(false); void read(next);
    }}>
      {t(failed ? '読み直す' : 'ほかの作品を見る')}</button>}
  </section>;
}
