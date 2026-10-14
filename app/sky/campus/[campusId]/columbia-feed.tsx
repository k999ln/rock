'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type SyntheticEvent,
} from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  BrainCircuit,
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
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { catalog } from '@/lib/catalog';
import { SKY_CAMPUS_ENTRIES } from '@/lib/sky-campus';
import { rankSkyFeed } from '@/lib/sky-feed-ranking';
import {
  appendSkyPhoenixEvent,
  clearSkyPhoenixHistory,
  emptySkyPhoenixState,
  readSkyPhoenixState,
  setSkyPhoenixEnabled,
  SKY_PHOENIX_VERSION,
  type SkyPhoenixEvent,
  type SkyPhoenixEventType,
  type SkyPhoenixState,
  writeSkyPhoenixState,
} from '@/lib/sky-phoenix';
import { operationRequest } from '@/lib/operations-client';
import {
  createLinkedInCampusDecision,
  linkedinCampusDecisionStorageKey,
  parseLinkedInCampusDecision,
  serializeLinkedInCampusDecision,
  type LinkedInCampusDecision,
} from '@/lib/campus-linkedin-consent';
import campusStyles from '@/components/campus-workspace.module.css';
import styles from './page.module.css';

type FeedMode = 'recommended' | 'saved';

const SAVE_KEY = 'sky-columbia-saved-tools';
const LINKEDIN_CHOICE_EVENT = 'avocado-campus-linkedin-choice';
const SKY_MAIN = 'https://avoado.si';

type SkyFeedHistoryResponse = {
  enabled: boolean;
  algorithmVersion: string;
  events: SkyPhoenixEvent[];
  retentionDays: number;
};

function phoenixStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
function dwellBucket(duration: number) {
  if (duration >= 30_000) return 30_000;
  if (duration >= 10_000) return 10_000;
  return 1_000;
}

const rankingReason = {
  'current-request': 'Related to your request',
  saved: 'Saved by you',
  connected: 'Connected by you',
  history: 'Based on your recommendation history',
  available: 'Available now',
  curated: 'Selected for Columbia students',
  candidate: 'New on Sky',
} as const;

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
  const [reviewingConsent, setReviewingConsent] = useState(false);
  const [learningOpen, setLearningOpen] = useState(false);
  const [phoenix, setPhoenix] = useState<SkyPhoenixState>(emptySkyPhoenixState);
  const [learningSync, setLearningSync] = useState<
    'local' | 'synced' | 'saving'
  >('local');
  const phoenixSession = useRef('');
  const pendingPhoenixEvents = useRef<SkyPhoenixEvent[]>([]);
  const phoenixSyncTimer = useRef<number | null>(null);
  const impressedThisSession = useRef(new Set<string>());

  const flushPhoenixEvents = useCallback(() => {
    if (phoenixSyncTimer.current !== null) {
      window.clearTimeout(phoenixSyncTimer.current);
      phoenixSyncTimer.current = null;
    }
    if (!pendingPhoenixEvents.current.length) return;
    void (async () => {
      while (pendingPhoenixEvents.current.length) {
        const events = pendingPhoenixEvents.current.splice(0, 20);
        try {
          await operationRequest('/api/sky/feed-history', 'POST', { events });
          setLearningSync('synced');
        } catch {
          setLearningSync('local');
          return;
        }
      }
    })();
  }, []);

  const recordPhoenix = useCallback(
    (
      toolId: string,
      type: SkyPhoenixEventType,
      detail: Pick<SkyPhoenixEvent, 'dwellMs' | 'position'> = {},
      refreshRanking = true,
    ) => {
      if (!phoenix.enabled) return;
      const storage = phoenixStorage();
      if (!storage) return;
      const event: SkyPhoenixEvent = {
        id: crypto.randomUUID(),
        sessionId: phoenixSession.current || crypto.randomUUID(),
        toolId,
        type,
        at: Date.now(),
        ...(detail.dwellMs === undefined ? {} : { dwellMs: detail.dwellMs }),
        ...(detail.position === undefined ? {} : { position: detail.position }),
      };
      const next = appendSkyPhoenixEvent(storage, event);
      if (refreshRanking) setPhoenix(next);
      pendingPhoenixEvents.current.push(event);
      setLearningSync('saving');
      if (phoenixSyncTimer.current === null)
        phoenixSyncTimer.current = window.setTimeout(flushPhoenixEvents, 1_200);
    },
    [flushPhoenixEvents, phoenix.enabled],
  );

  useEffect(() => {
    let active = true;
    phoenixSession.current = crypto.randomUUID();
    const storage = phoenixStorage();
    if (!storage) return;
    const local = readSkyPhoenixState(storage);
    queueMicrotask(() => {
      if (active) setPhoenix(local);
    });
    void operationRequest<SkyFeedHistoryResponse>('/api/sky/feed-history')
      .then((remote) => {
        if (!active || remote.algorithmVersion !== SKY_PHOENIX_VERSION) return;
        const remoteState: SkyPhoenixState = {
          version: SKY_PHOENIX_VERSION,
          enabled: remote.enabled,
          events: remote.events,
        };
        writeSkyPhoenixState(storage, remoteState);
        setPhoenix(readSkyPhoenixState(storage));
        setLearningSync('synced');
      })
      .catch(() => setLearningSync('local'));
    return () => {
      active = false;
      if (phoenixSyncTimer.current !== null)
        window.clearTimeout(phoenixSyncTimer.current);
    };
  }, []);

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
  const subscribeToLinkedInChoice = useCallback((notify: () => void) => {
    window.addEventListener('storage', notify);
    window.addEventListener(LINKEDIN_CHOICE_EVENT, notify);
    return () => {
      window.removeEventListener('storage', notify);
      window.removeEventListener(LINKEDIN_CHOICE_EVENT, notify);
    };
  }, []);
  const linkedinChoiceValue = useSyncExternalStore(
    subscribeToLinkedInChoice,
    () =>
      window.localStorage.getItem(
        linkedinCampusDecisionStorageKey('columbia'),
      ) ?? '',
    () => '',
  );
  const linkedinDecision = useMemo(
    () => parseLinkedInCampusDecision('columbia', linkedinChoiceValue),
    [linkedinChoiceValue],
  );

  const rankedRecommendations = useMemo(() => {
    const campusTools = entry.tools.flatMap((card) => {
      const tool = catalog.find((item) => item.id === card.id);
      return tool ? [tool] : [];
    });
    const savedAt = Object.fromEntries(saved.map((id) => [id, 1]));
    return rankSkyFeed(campusTools, 'recommended', {
      savedAt,
      history: phoenix.enabled ? phoenix.events : [],
    });
  }, [entry.tools, phoenix.enabled, phoenix.events, saved]);
  const rankingReasons = useMemo(
    () =>
      new Map(
        rankedRecommendations.map(({ tool, reasonCode }) => [
          tool.id,
          rankingReason[reasonCode],
        ]),
      ),
    [rankedRecommendations],
  );
  const visibleTools = useMemo(() => {
    if (mode === 'saved')
      return entry.tools.filter((tool) => saved.includes(tool.id));
    const ranked = rankedRecommendations.flatMap(({ tool }) => {
      const card = entry.tools.find((item) => item.id === tool.id);
      return card ? [card] : [];
    });
    return ranked.length === entry.tools.length ? ranked : entry.tools;
  }, [entry.tools, mode, rankedRecommendations, saved]);
  const rankedToolSignature = visibleTools.map((tool) => tool.id).join('|');

  useEffect(() => {
    if (!phoenix.enabled || mode !== 'recommended') return;
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>('[data-sky-tool-id]'),
    );
    if (!nodes.length || typeof IntersectionObserver === 'undefined') return;
    const visible = new Set<HTMLElement>();
    const startedAt = new Map<HTMLElement, number>();
    const commit = (node: HTMLElement, now = Date.now()) => {
      const toolId = node.dataset.skyToolId;
      const started = startedAt.get(node);
      startedAt.delete(node);
      if (!toolId || !started || impressedThisSession.current.has(toolId))
        return;
      const duration = now - started;
      if (duration < 1_000) return;
      impressedThisSession.current.add(toolId);
      recordPhoenix(
        toolId,
        'impression',
        {
          dwellMs: dwellBucket(duration),
          position: Number(node.dataset.skyPosition ?? 0),
        },
        false,
      );
    };
    const observer = new IntersectionObserver(
      (entries) => {
        const now = Date.now();
        for (const item of entries) {
          const node = item.target as HTMLElement;
          if (item.isIntersecting && item.intersectionRatio >= 0.55) {
            visible.add(node);
            if (document.visibilityState !== 'hidden' && !startedAt.has(node))
              startedAt.set(node, now);
          } else {
            visible.delete(node);
            commit(node, now);
          }
        }
      },
      { threshold: [0, 0.55, 1] },
    );
    const visibility = () => {
      const now = Date.now();
      if (document.visibilityState === 'hidden') {
        for (const node of visible) commit(node, now);
      } else {
        for (const node of visible) {
          if (!impressedThisSession.current.has(node.dataset.skyToolId ?? ''))
            startedAt.set(node, now);
        }
      }
    };
    for (const node of nodes) observer.observe(node);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      const now = Date.now();
      for (const node of visible) commit(node, now);
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [mode, phoenix.enabled, rankedToolSignature, recordPhoenix]);

  function toggleSaved(id: string) {
    const next = saved.includes(id)
      ? saved.filter((toolId) => toolId !== id)
      : [...saved, id];
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event('sky-columbia-saved'));
      recordPhoenix(id, next.includes(id) ? 'save' : 'unsave');
    } catch {
      // Saving stays optional when browser storage is unavailable.
    }
  }

  function openLearningPanel() {
    const storage = phoenixStorage();
    if (storage) setPhoenix(readSkyPhoenixState(storage));
    setLearningOpen(true);
  }

  async function toggleLearning() {
    const storage = phoenixStorage();
    if (!storage) return;
    const enabled = !phoenix.enabled;
    const next = enabled
      ? setSkyPhoenixEnabled(storage, true)
      : setSkyPhoenixEnabled(storage, false);
    const finalState = enabled ? next : clearSkyPhoenixHistory(storage);
    setPhoenix(finalState);
    pendingPhoenixEvents.current = enabled ? pendingPhoenixEvents.current : [];
    setLearningSync('saving');
    try {
      await operationRequest('/api/sky/feed-history', 'PUT', { enabled });
      setLearningSync('synced');
    } catch {
      setLearningSync('local');
    }
  }

  async function clearLearning() {
    const storage = phoenixStorage();
    if (storage) setPhoenix(clearSkyPhoenixHistory(storage));
    pendingPhoenixEvents.current = [];
    setLearningSync('saving');
    try {
      await operationRequest('/api/sky/feed-history', 'DELETE');
      setLearningSync('synced');
    } catch {
      setLearningSync('local');
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
    recordPhoenix(tool.id, 'route');
    recordPhoenix(tool.id, 'launch');
    window.location.assign(tool.href);
  }

  function showSavedTools() {
    setMode('saved');
    window.requestAnimationFrame(() => {
      document
        .getElementById('sky-feed-tabs')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function decideLinkedIn(status: LinkedInCampusDecision['status']) {
    const decision = createLinkedInCampusDecision('columbia', status);
    window.localStorage.setItem(
      linkedinCampusDecisionStorageKey('columbia'),
      serializeLinkedInCampusDecision(decision),
    );
    window.dispatchEvent(new Event(LINKEDIN_CHOICE_EVENT));
    setReviewingConsent(false);
  }

  return (
    <main lang="en" className={styles.page}>
      <div className={styles.shell}>
        <aside className={styles.leftRail} aria-label="Primary Sky navigation">
          <Link className={styles.sideBrand} href={`${SKY_MAIN}/os/sky`} aria-label="Sky home">
            <Sparkles size={29} strokeWidth={1.8} aria-hidden="true" />
            <span>Sky</span>
          </Link>
          <nav className={styles.sideNav} aria-label="Sky sections">
            <Link href="/sky/campus/columbia" aria-current="page">
              <Home size={25} fill="currentColor" aria-hidden="true" />
              <span>Home</span>
            </Link>
            <Link href={`${SKY_MAIN}/os/sky`}>
              <Search size={25} aria-hidden="true" />
              <span>Explore</span>
            </Link>
            <Link href={`${SKY_MAIN}/chat`}>
              <BriefcaseBusiness size={25} aria-hidden="true" />
              <span>Work</span>
            </Link>
            <button type="button" onClick={showSavedTools}>
              <Bookmark size={25} aria-hidden="true" />
              <span>Saved</span>
            </button>
            <button type="button" onClick={() => setReviewingConsent(true)}>
              <ShieldCheck size={25} aria-hidden="true" />
              <span>Data choice</span>
            </button>
          </nav>
          <a className={styles.askButton} href="#sky-request">
            <Sparkles size={20} aria-hidden="true" />
            <span>Ask Sky</span>
          </a>
          <button
            type="button"
            className={styles.sideAccount}
            onClick={() => setReviewingConsent(true)}
          >
            <span className={styles.sideAvatar} aria-hidden="true">
              <ShieldCheck size={21} />
            </span>
            <span>
              <strong>No profile required</strong>
              <small>Optional data choices</small>
            </span>
          </button>
        </aside>

        <section className={styles.centerColumn} aria-label="Sky tool feed">
          <header className={styles.topbar}>
            <Link className={styles.home} href={`${SKY_MAIN}/os/sky`} aria-label="Sky home">
              <House size={28} strokeWidth={1.8} />
            </Link>
            <div className={styles.brand}>
              <strong>Sky</strong>
              <span>Columbia students</span>
            </div>
            <button
              type="button"
              className={styles.profile}
              onClick={() => setReviewingConsent(true)}
              aria-label="Review LinkedIn data choice"
            >
              <ShieldCheck size={27} strokeWidth={1.8} />
            </button>
          </header>

          <div
            id="sky-feed-tabs"
            className={styles.tabs}
            role="tablist"
            aria-label="Feed view"
          >
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

          <button
            type="button"
            className={styles.learningButton}
            data-enabled={phoenix.enabled}
            aria-pressed={phoenix.enabled}
            onClick={openLearningPanel}
          >
            <BrainCircuit size={17} aria-hidden="true" />
            {phoenix.enabled
              ? 'Recommendations learning'
              : 'Personalize recommendations'}
          </button>

          <div className={styles.composerWrap}>
            <form
              id="sky-request"
              className={styles.composer}
              onSubmit={submitRequest}
            >
              <Sparkles size={27} strokeWidth={1.75} aria-hidden="true" />
              <input
                value={request}
                onChange={(event) => setRequest(event.target.value)}
                placeholder="What are you working on?"
                aria-label="Tell Sky what you are working on"
              />
              <button
                type="submit"
                disabled={!request.trim()}
                aria-label="Find the right Sky tool"
              >
                <Send size={21} strokeWidth={1.8} />
              </button>
            </form>
          </div>
          <p className={styles.context}>
            <GraduationCap size={15} aria-hidden="true" />
            <strong>Made for Columbia students.</strong> Independent service by
            avokado. No sign-in needed to explore.
          </p>

          {visibleTools.length ? (
            <section
              className={styles.feed}
              aria-label={
                mode === 'saved' ? 'Saved Sky tools' : 'Recommended Sky tools'
              }
            >
              {visibleTools.map((tool, index) => {
                const copy = feedCopy[tool.id as keyof typeof feedCopy];
                const isSaved = saved.includes(tool.id);
                const customStyle = {
                  '--accent-strong': copy.accent,
                  '--accent-soft': copy.soft,
                  '--art-background': copy.art,
                } as CSSProperties;
                return (
                  <article
                    id={`tool-${tool.id}`}
                    className={styles.post}
                    key={tool.id}
                    data-sky-tool-id={tool.id}
                    data-sky-position={index}
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
                          onClick={() => recordPhoenix(tool.id, 'detail')}
                        >
                          <MoreHorizontal size={20} />
                        </button>
                      </div>
                      <p className={styles.description}>{copy.description}</p>
                      <span className={styles.reason}>
                        {rankingReasons.get(tool.id) ?? copy.reason}
                      </span>
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
                          onClick={() => recordPhoenix(tool.id, 'detail')}
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
                              ? `Remove ${tool.title} from this browser`
                              : `Save ${tool.title} on this browser`
                          }
                        >
                          <Bookmark
                            size={18}
                            fill={isSaved ? 'currentColor' : 'none'}
                          />
                          <span>{isSaved ? 'Saved here' : 'Save here'}</span>
                        </button>
                        <Link
                          className={styles.primary}
                          href={tool.href}
                          onClick={() => recordPhoenix(tool.id, 'launch')}
                        >
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
              <p>
                Save a tool on this browser so you can get back to it quickly.
              </p>
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
        </section>

        <aside className={styles.rightRail} aria-label="Sky discovery">
          <form className={styles.railSearch} onSubmit={submitRequest}>
            <Search size={20} aria-hidden="true" />
            <input
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              placeholder="Search Sky"
              aria-label="Search Sky tools"
            />
            <button type="submit" disabled={!request.trim()}>
              Go
            </button>
          </form>
          <section className={styles.railPanel} aria-labelledby="goal-heading">
            <h2 id="goal-heading">Start with a goal</h2>
            {entry.tools.map((tool, index) => {
              const copy = feedCopy[tool.id as keyof typeof feedCopy];
              return (
                <Link
                  className={styles.goalLink}
                  href={tool.href}
                  key={tool.id}
                  onClick={() => recordPhoenix(tool.id, 'route')}
                >
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <small>{copy.reason}</small>
                    <strong>{tool.title}</strong>
                  </div>
                  <ArrowRight size={17} aria-hidden="true" />
                </Link>
              );
            })}
          </section>
          <section className={styles.railPanel} aria-labelledby="desk-heading">
            <h2 id="desk-heading">Sky desks</h2>
            {entry.tools.map((tool) => {
              const copy = feedCopy[tool.id as keyof typeof feedCopy];
              return (
                <div className={styles.desk} key={tool.id}>
                  <span
                    className={styles.deskAvatar}
                    style={{ '--desk-accent': copy.accent } as CSSProperties}
                    aria-hidden="true"
                  >
                    {copy.author.slice(4, 5)}
                  </span>
                  <div>
                    <strong>{copy.author}</strong>
                    <small>{copy.handle.split(' · ')[0]}</small>
                  </div>
                  <Link
                    href={tool.href}
                    onClick={() => recordPhoenix(tool.id, 'launch')}
                  >
                    Open
                  </Link>
                </div>
              );
            })}
          </section>
          <section className={styles.railPanel} aria-labelledby="continue-heading">
            <h2 id="continue-heading">Continue your work</h2>
            <Link className={styles.goalLink} href={`${SKY_MAIN}/chat`}>
              <span>J</span>
              <div>
                <small>Project chief of staff</small>
                <strong>Plan with Jennifer</strong>
              </div>
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <Link className={styles.goalLink} href={`${SKY_MAIN}/os/sky/agents/citations`}>
              <span>A</span>
              <div>
                <small>Sign in to save results</small>
                <strong>Run the Citations Agent</strong>
              </div>
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </section>
          <p className={styles.railNote}>
            Recommendations use this curated page and your explicit saves. They
            do not grant execution permission.
          </p>
        </aside>

        <nav className={styles.bottomNav} aria-label="Sky navigation">
          <Link className={styles.active} href="/sky/campus/columbia">
            <Home size={24} fill="currentColor" />
            <span>Home</span>
          </Link>
          <Link href={`${SKY_MAIN}/os/sky`}>
            <Search size={24} />
            <span>Explore</span>
          </Link>
          <Link href={`${SKY_MAIN}/chat`}>
            <BriefcaseBusiness size={24} />
            <span>Work</span>
          </Link>
          <button type="button" onClick={showSavedTools}>
            <Bookmark size={24} />
            <span>Saved</span>
          </button>
          <Link href={`${SKY_MAIN}/signin-with-chatgpt?return_to=%2Fos%2Fsky`}>
            <UserRound size={24} />
            <span>You</span>
          </Link>
        </nav>
      </div>
      {(reviewingConsent || !linkedinDecision) && (
        <div className={campusStyles.modalBackdrop}>
          <dialog
            open
            className={`${campusStyles.modal} ${campusStyles.consentSheet}`}
            aria-labelledby="columbia-linkedin-consent-title"
          >
            <header>
              <div>
                <span>OPTIONAL DATA CHOICE</span>
                <h2 id="columbia-linkedin-consent-title">
                  Personalize this student feed with LinkedIn?
                </h2>
              </div>
              {linkedinDecision && (
                <button
                  type="button"
                  onClick={() => setReviewingConsent(false)}
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              )}
            </header>
            <p>
              No profile form is required. Choose whether Avocado may request
              basic LinkedIn information after an official LinkedIn connection
              is available.
            </p>
            <div className={campusStyles.consentScope}>
              <span className={campusStyles.linkedinMark} aria-hidden="true">
                in
              </span>
              <div>
                <strong>Basic information only</strong>
                <p>
                  Name, LinkedIn account ID, profile photo, and locale if
                  LinkedIn provides them.
                </p>
              </div>
            </div>
            <ul className={campusStyles.consentList}>
              <li>
                Purpose: personalize the feed and suggest relevant people,
                projects, and resources.
              </li>
              <li>
                Never your LinkedIn password, messages, contacts, or posts.
              </li>
              <li>
                No selling, employment decisions, or posting back to LinkedIn.
              </li>
              <li>
                You can withdraw this choice or request deletion at any time.
              </li>
            </ul>
            <div className={campusStyles.consentImportant}>
              <ShieldCheck size={18} aria-hidden="true" />
              <p>
                This choice alone does not connect LinkedIn or import data.
                LinkedIn will show its own permission screen before sharing
                anything. The official connection is not enabled yet.
              </p>
            </div>
            <div className={campusStyles.modalActions}>
              <button
                type="button"
                className={campusStyles.primary}
                onClick={() => decideLinkedIn('consented')}
              >
                I agree — enter Campus
              </button>
              <button
                type="button"
                className={campusStyles.secondaryAction}
                onClick={() => decideLinkedIn('skipped')}
              >
                Continue without LinkedIn
              </button>
            </div>
          </dialog>
        </div>
      )}
      {learningOpen && linkedinDecision && (
        <div className={campusStyles.modalBackdrop}>
          <dialog
            open
            className={`${campusStyles.modal} ${campusStyles.consentSheet}`}
            aria-labelledby="columbia-phoenix-title"
          >
            <header>
              <div>
                <span>SKY PHOENIX</span>
                <h2 id="columbia-phoenix-title">
                  Personalized recommendations
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setLearningOpen(false)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </header>
            <p>
              Sky learns from qualified views, details, launches, saves,
              connections, completions, and failures to reorder these tools for
              you. It never stores your request text, Zema conversations,
              generated results, raw scrolling, or a device ID.
            </p>
            <dl className={styles.learningStatus} aria-live="polite">
              <div>
                <dt>Status</dt>
                <dd>{phoenix.enabled ? 'Learning' : 'Off'}</dd>
              </div>
              <div>
                <dt>History</dt>
                <dd>{phoenix.events.length} events · 30 days</dd>
              </div>
              <div>
                <dt>Storage</dt>
                <dd>
                  {learningSync === 'saving'
                    ? 'Saving'
                    : learningSync === 'synced'
                      ? 'Synced to your signed-in account'
                      : 'This tab only'}
                </dd>
              </div>
            </dl>
            <div className={campusStyles.consentImportant}>
              <ShieldCheck size={18} aria-hidden="true" />
              <p>
                Learning changes ranking only. It cannot grant Tool access,
                create a Zema job, purchase anything, or authorize payment.
              </p>
            </div>
            <div className={campusStyles.modalActions}>
              <button
                type="button"
                className={campusStyles.primary}
                aria-pressed={phoenix.enabled}
                onClick={() => void toggleLearning()}
              >
                <BrainCircuit size={17} aria-hidden="true" />
                {phoenix.enabled
                  ? 'Stop learning and delete history'
                  : 'Turn on recommendation learning'}
              </button>
              <button
                type="button"
                className={campusStyles.secondaryAction}
                disabled={!phoenix.events.length}
                onClick={() => void clearLearning()}
              >
                <Trash2 size={16} aria-hidden="true" />
                Reset history
              </button>
            </div>
          </dialog>
        </div>
      )}
    </main>
  );
}
