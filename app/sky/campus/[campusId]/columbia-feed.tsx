'use client';

import {
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type SyntheticEvent,
} from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  Bookmark,
  BriefcaseBusiness,
  Clock3,
  FileText,
  GraduationCap,
  Home,
  House,
  Laptop,
  Lightbulb,
  MoreHorizontal,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { SKY_CAMPUS_ENTRIES } from '@/lib/sky-campus';
import styles from './page.module.css';

type FeedMode = 'recommended' | 'saved';

const SAVE_KEY = 'sky-columbia-saved-tools';

const feedCopy = {
  'mr-citations': {
    author: 'Sky Research Desk',
    handle: '@sky_citations · 12m',
    description:
      'Bring paper and article links together, remove duplicates, and turn them into a clean Sources section.',
    reason: 'Popular with researchers',
    info: 'Browser · Free',
    cta: 'Open',
    variant: 'citations',
    accent: '#397fa9',
    soft: '#e9f4fb',
    art: 'linear-gradient(135deg, #f4eee8, #e7eef3)',
  },
  'rockstar-amc': {
    author: 'Sky Planning Desk',
    handle: '@sky_amc · 1h',
    description:
      'Turn a goal into a reviewable plan with clear work, milestones, and check points.',
    reason: 'Plan your next milestone',
    info: 'No LLM · Free',
    cta: 'Plan',
    variant: 'amc',
    accent: '#357caa',
    soft: '#e7f3fb',
    art: 'linear-gradient(135deg, #e2f2fb, #d9ecf5)',
  },
  'rockstar-patent-assistant': {
    author: 'Sky Invention Desk',
    handle: '@sky_patents · 3h',
    description:
      'Structure an idea into an invention assessment and an English draft packet for your next review.',
    reason: 'US invention draft',
    info: 'Browser draft · Free',
    cta: 'Draft',
    variant: 'patent',
    accent: '#2c816b',
    soft: '#e3f4ef',
    art: 'linear-gradient(135deg, #17202a, #293b4c)',
  },
} as const;

function ToolArt({
  variant,
}: {
  variant: (typeof feedCopy)[keyof typeof feedCopy]['variant'];
}) {
  if (variant === 'citations') {
    return (
      <>
        <div className={styles.paperStack}>
          <span>PAPER</span>
        </div>
        <div className={styles.sourceRows}>
          <span />
          <span />
          <span />
        </div>
      </>
    );
  }
  if (variant === 'amc') {
    return (
      <div className={styles.planBoard}>
        <span />
        <span />
        <span />
      </div>
    );
  }
  return (
    <div className={styles.patentArt}>
      <FileText size={48} strokeWidth={1.45} />
      <Lightbulb size={64} strokeWidth={1.55} />
      <ShieldCheck size={50} strokeWidth={1.45} />
    </div>
  );
}

export default function ColumbiaFeed() {
  const entry = SKY_CAMPUS_ENTRIES.columbia;
  const [mode, setMode] = useState<FeedMode>('recommended');
  const [request, setRequest] = useState('');

  const subscribeToSavedTools = useCallback((notify: () => void) => {
    window.addEventListener('storage', notify);
    window.addEventListener('sky-columbia-saved', notify);
    return () => {
      window.removeEventListener('storage', notify);
      window.removeEventListener('sky-columbia-saved', notify);
    };
  }, []);
  const savedValue = useSyncExternalStore(
    subscribeToSavedTools,
    () => window.localStorage.getItem(SAVE_KEY) ?? '[]',
    () => '[]',
  );
  const saved = useMemo(() => {
    try {
      return JSON.parse(savedValue) as string[];
    } catch {
      return [];
    }
  }, [savedValue]);

  const visibleTools = useMemo(
    () =>
      mode === 'saved'
        ? entry.tools.filter((tool) => saved.includes(tool.id))
        : entry.tools,
    [entry.tools, mode, saved],
  );

  function toggleSaved(id: string) {
    const next = saved.includes(id)
      ? saved.filter((toolId) => toolId !== id)
      : [...saved, id];
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event('sky-columbia-saved'));
    } catch {
      // Saving stays optional when browser storage is unavailable.
    }
  }

  function submitRequest(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const query = request.trim().toLowerCase();
    if (!query) return;
    const tool =
      query.includes('patent') || query.includes('invention')
        ? entry.tools[2]
        : query.includes('plan') ||
            query.includes('goal') ||
            query.includes('project')
          ? entry.tools[1]
          : entry.tools[0];
    window.location.assign(tool.href);
  }

  return (
    <main lang="en" className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <Link className={styles.home} href="/sky" aria-label="Sky home">
            <House size={28} strokeWidth={1.8} />
          </Link>
          <div className={styles.brand}>
            <strong>Sky</strong>
            <span>Columbia students</span>
          </div>
          <Link
            className={styles.profile}
            href="/signin-with-chatgpt?return_to=%2Fsky%2Fcampus%2Fcolumbia"
            aria-label="Create an account or sign in"
          >
            <UserRound size={28} strokeWidth={1.8} />
          </Link>
        </header>

        <div className={styles.tabs} role="tablist" aria-label="Feed view">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'recommended'}
            onClick={() => setMode('recommended')}
          >
            For you
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'saved'}
            onClick={() => setMode('saved')}
          >
            Saved
          </button>
        </div>

        <div className={styles.composerWrap}>
          <form className={styles.composer} onSubmit={submitRequest}>
            <Sparkles size={27} strokeWidth={1.75} aria-hidden="true" />
            <input
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              placeholder="What are you working on?"
              aria-label="Tell Sky what you are working on"
            />
            <button
              disabled={!request.trim()}
              aria-label="Find the right Sky tool"
            >
              <Send size={21} strokeWidth={1.8} />
            </button>
          </form>
        </div>
        <p className={styles.context}>
          <GraduationCap size={15} aria-hidden="true" />
          <strong>Made for Columbia students.</strong> No sign-in needed to
          start.
        </p>

        {visibleTools.length ? (
          <section
            className={styles.feed}
            aria-label={
              mode === 'saved' ? 'Saved Sky tools' : 'Recommended Sky tools'
            }
          >
            {visibleTools.map((tool) => {
              const copy = feedCopy[tool.id as keyof typeof feedCopy];
              const isSaved = saved.includes(tool.id);
              const customStyle = {
                '--accent-strong': copy.accent,
                '--accent-soft': copy.soft,
                '--art-background': copy.art,
              } as CSSProperties;
              return (
                <article
                  className={styles.post}
                  key={tool.id}
                  style={customStyle}
                >
                  <div
                    className={styles.avatar}
                    data-variant={copy.variant}
                    aria-hidden="true"
                  >
                    {copy.variant === 'citations' ? (
                      <FileText size={34} strokeWidth={1.5} />
                    ) : copy.variant === 'amc' ? (
                      <BriefcaseBusiness size={33} strokeWidth={1.5} />
                    ) : (
                      <Lightbulb size={34} strokeWidth={1.5} />
                    )}
                  </div>
                  <div className={styles.postBody}>
                    <div className={styles.meta}>
                      <strong>{copy.author}</strong>
                      <BadgeCheck
                        className={styles.verified}
                        size={18}
                        aria-label="Available on Sky"
                      />
                      <span className={styles.handle}>{copy.handle}</span>
                      <button
                        className={styles.more}
                        type="button"
                        aria-label={`More information about ${tool.title}`}
                        title={tool.processing}
                      >
                        <MoreHorizontal size={20} />
                      </button>
                    </div>
                    <p className={styles.description}>{copy.description}</p>
                    <span className={styles.reason}>{copy.reason}</span>
                    <div className={styles.art} aria-hidden="true">
                      <ToolArt variant={copy.variant} />
                    </div>
                    <p className={styles.info}>
                      {copy.variant === 'amc' ? (
                        <Clock3 size={16} />
                      ) : (
                        <Laptop size={16} />
                      )}
                      {copy.info}
                    </p>
                    <div className={styles.actions}>
                      <Link
                        className={styles.secondary}
                        href={tool.href}
                        aria-label={`View ${tool.title} details`}
                      >
                        <FileText size={18} />
                        <span>Details</span>
                      </Link>
                      <button
                        className={styles.secondary}
                        data-saved={isSaved}
                        type="button"
                        onClick={() => toggleSaved(tool.id)}
                        aria-pressed={isSaved}
                        aria-label={
                          isSaved
                            ? `Remove ${tool.title} from saved tools`
                            : `Save ${tool.title}`
                        }
                      >
                        <Bookmark
                          size={18}
                          fill={isSaved ? 'currentColor' : 'none'}
                        />
                        <span>{isSaved ? 'Saved' : 'Save'}</span>
                      </button>
                      <Link className={styles.primary} href={tool.href}>
                        {copy.cta}
                        <ArrowRight size={18} />
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <section className={styles.empty}>
            <div className={styles.emptyIcon}>
              <Bookmark size={31} />
            </div>
            <h2>Your saved tools will appear here.</h2>
            <p>Save a tool from the feed so you can get back to it quickly.</p>
            <button type="button" onClick={() => setMode('recommended')}>
              Browse recommendations
            </button>
          </section>
        )}

        <footer className={styles.footerNote}>
          <p>
            The NFC card only opens this page. It stores no personal data,
            access rights, or account permissions.
          </p>
          <a href={entry.privacyUrl} target="_blank" rel="noreferrer">
            Privacy and processing details
          </a>
        </footer>

        <nav className={styles.bottomNav} aria-label="Sky navigation">
          <Link className={styles.active} href="/sky/campus/columbia">
            <Home size={24} fill="currentColor" />
            <span>Home</span>
          </Link>
          <Link href="/sky">
            <Search size={24} />
            <span>Explore</span>
          </Link>
          <Link href="/zema">
            <BriefcaseBusiness size={24} />
            <span>Work</span>
          </Link>
          <button type="button" onClick={() => setMode('saved')}>
            <Bookmark size={24} />
            <span>Saved</span>
          </button>
          <Link href="/signin-with-chatgpt?return_to=%2Fsky%2Fcampus%2Fcolumbia">
            <UserRound size={24} />
            <span>You</span>
          </Link>
        </nav>
      </div>
    </main>
  );
}
