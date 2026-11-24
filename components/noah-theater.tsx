'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';
import { noahTheaterFilms } from '@/lib/noah-theater-films';
import type { NoahFeedEntry } from '@/lib/noah-feed';
import { useNoahLocale } from './noah-locale';
import NoahTheaterAuthors, { NoahAuthorScreening } from './noah-theater-authors';
import styles from './noah-theater.module.css';

type Film = (typeof noahTheaterFilms)[number];
const sceneMs = 5000;

function posterStyle(film: Film): CSSProperties {
  return { backgroundImage: `url("${film.poster}")` };
}

// A scene's clock keeps the remaining time when playback is paused or the tab is hidden.
function SceneClock({ running, onEnd }: { running: boolean; onEnd: () => void }) {
  const remaining = useRef(sceneMs);
  const ended = useRef(onEnd);
  useEffect(() => { ended.current = onEnd; }, [onEnd]);
  useEffect(() => {
    if (!running) return;
    const start = performance.now();
    const timer = window.setTimeout(() => ended.current(), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (performance.now() - start));
    };
  }, [running]);
  return <span className={styles.clockFill} style={{ animationDuration: `${sceneMs}ms` }} />;
}

function Screening({ film }: { film: Film }) {
  const { t } = useNoahLocale();
  const screen = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState(0);
  const [ended, setEnded] = useState(false);
  const [intent, setIntent] = useState<'auto' | 'play' | 'pause'>('auto');
  const [reduced, setReduced] = useState(true);
  const [inView, setInView] = useState(false);
  const [tabVisible, setTabVisible] = useState(false);

  useEffect(() => {
    const element = screen.current;
    if (!element) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const readPreference = () => {
      setReduced(preference.matches);
      if (preference.matches) setIntent('pause');
    };
    const readVisibility = () => setTabVisible(!document.hidden);
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio >= 0.2),
      { threshold: [0, 0.2] },
    );
    const readPosition = () => {
      const bounds = element.getBoundingClientRect();
      setInView(bounds.top < window.innerHeight && bounds.bottom > 0);
    };
    readPreference();
    readVisibility();
    if (observer) observer.observe(element);
    else {
      readPosition();
      window.addEventListener('scroll', readPosition, { passive: true });
      window.addEventListener('resize', readPosition);
    }
    document.addEventListener('visibilitychange', readVisibility);
    preference.addEventListener('change', readPreference);
    return () => {
      observer?.disconnect();
      window.removeEventListener('scroll', readPosition);
      window.removeEventListener('resize', readPosition);
      document.removeEventListener('visibilitychange', readVisibility);
      preference.removeEventListener('change', readPreference);
    };
  }, []);

  const wantsPlayback = !ended && (intent === 'play' || (intent === 'auto' && !reduced));
  const running = wantsPlayback && inView && tabVisible;
  const scene = film.scenes[frame];
  const last = film.scenes.length - 1;
  const seconds = film.scenes.length * sceneMs / 1000;
  const toggleLabel = t(ended ? 'もう一度再生' : wantsPlayback ? '一時停止' : '再生');
  function togglePlayback() {
    if (ended) {
      setEnded(false);
      setFrame(0);
    }
    setIntent(wantsPlayback ? 'pause' : 'play');
  }
  function seek(next: number) {
    setIntent('pause');
    setEnded(false);
    setFrame(next);
  }

  return <>
    <div ref={screen} className={styles.monitor} data-film={film.id} data-scene={frame} data-running={running}>
      <div className={styles.screen}>
        <div key={frame} className={styles.picture} style={posterStyle(film)} aria-hidden="true" />
        <div className={styles.shade} aria-hidden="true" />
        <div key={`lines-${frame}`} className={styles.linework} aria-hidden="true"><i /><i /><i /></div>
        <div className={styles.credit}><span aria-hidden="true" />{t(film.agent)}</div>
        <time className={styles.duration} dateTime={`PT${seconds}S`}><bdi>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</bdi></time>
        <div className={styles.intertitle}>
          <h2>{t(film.title)}</h2>
          <p key={frame}>{t(scene.caption)}</p>
          {frame === last && <div className={styles.outcome}>
            {film.outcome.map(line => <bdi key={line}>{t(line)}</bdi>)}
          </div>}
        </div>
      </div>
      <div className={styles.transport}>
        <button type="button" className={styles.control} onClick={togglePlayback} aria-label={toggleLabel} title={toggleLabel}>
          {ended ? <RotateCcw size={17} /> : wantsPlayback ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
        </button>
        <div className={styles.timeline} aria-hidden="true">
          {film.scenes.map((item, i) => <span key={item.caption} className={styles.track} data-past={i < frame || ended}>
            {i === frame && !ended && <SceneClock running={running} onEnd={() => {
              if (frame === last) setEnded(true);
              else setFrame(frame + 1);
            }} />}
          </span>)}
        </div>
        <span className={styles.counter} aria-label={t('場面 {current} / {total}', { current: frame + 1, total: film.scenes.length })}>
          <bdi>{String(frame + 1).padStart(2, '0')} <span>/</span> {String(film.scenes.length).padStart(2, '0')}</bdi>
        </span>
        <button type="button" className={styles.control} disabled={frame === 0} onClick={() => seek(frame - 1)} aria-label={t('前の場面')} title={t('前の場面')}>
          <ChevronLeft size={20} />
        </button>
        <button type="button" className={styles.control} disabled={frame === last} onClick={() => seek(frame + 1)} aria-label={t('次の場面')} title={t('次の場面')}>
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
    <div className={styles.notes}>
      <details className={styles.script}>
        <summary>{t('使い方を読む')}<ChevronDown size={16} aria-hidden="true" /></summary>
        <ol>{film.scenes.map(item => <li key={item.caption}>
          <strong>{t(item.caption)}</strong><p>{t(item.detail)}</p>
        </li>)}</ol>
      </details>
      <Link className={styles.detailLink} href={film.href}>{t('Agentの詳細')}<ArrowUpRight size={17} aria-hidden="true" /></Link>
    </div>
  </>;
}

export default function NoahTheater() {
  const { t } = useNoahLocale();
  const [selected, setSelected] = useState<Film>(noahTheaterFilms[0]);
  const [authorFilm, setAuthorFilm] = useState<NoahFeedEntry | null>(null);
  const projector = useRef<HTMLElement>(null);
  function returnToScreen() {
    const element = projector.current;
    if (!element) return;
    element.focus({ preventScroll: true });
    const top = element.getBoundingClientRect().top;
    if (top < 52 || top >= window.innerHeight) {
      element.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
  }
  function showFilm(film: Film) {
    setAuthorFilm(null);
    setSelected(film);
    returnToScreen();
  }
  return <section className={styles.theater} aria-label={t('予告編')}>
    <section className={styles.projector} ref={projector} tabIndex={-1} aria-label={t(authorFilm?.name ?? selected.title)}>
      {authorFilm ? <NoahAuthorScreening key={authorFilm.digest} entry={authorFilm} onBack={() => showFilm(selected)} /> :
        <Screening key={selected.id} film={selected} />}
    </section>
    <div className={styles.program}>
      <h2>{t('上映作品')}</h2>
      <div className={styles.choices}>{noahTheaterFilms.map(film => (
        <button key={film.id} type="button" className={styles.choice} onClick={() => showFilm(film)} aria-pressed={!authorFilm && film.id === selected.id}>
          <span className={styles.thumb} style={posterStyle(film)} data-film={film.id} aria-hidden="true" />
          <span className={styles.choiceTitle}>{t(film.title)}</span>
          <span className={styles.choiceAgent}>{t(film.agent)}</span>
        </button>
      ))}</div>
    </div>
    <NoahTheaterAuthors selectedDigest={authorFilm?.digest ?? ''} onSelect={entry => {
      setAuthorFilm(entry);
      returnToScreen();
    }} />
  </section>;
}
