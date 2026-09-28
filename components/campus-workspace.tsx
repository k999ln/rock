'use client';

import {
  Bell,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  ChevronRight,
  CircleUserRound,
  FolderKanban,
  GraduationCap,
  Handshake,
  Link2,
  Network,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react';
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import type { CampusId, CampusItemKind } from '@/lib/campus';
import styles from './campus-workspace.module.css';

type CampusConfig = {
  id: CampusId;
  name: string;
  shortName: string;
  headline: string;
  description: string;
  accent: string;
  focus: string[];
  prompts: string[];
  resourceLabel: string;
  opportunityLabel: string;
  defaultMode: string;
};
type Profile = {
  id: string;
  campusId: CampusId;
  handle: string;
  displayName: string;
  affiliation: string;
  affiliationStatus: 'self_declared' | 'domain_verified';
  headline: string;
  bio: string;
  skills: string[];
  interests: string[];
  lookingFor: string[];
  links: { label: string; url: string }[];
  isPublic?: boolean;
  updatedAt: string;
};
type Item = {
  id: string;
  campusId: CampusId;
  kind: CampusItemKind;
  title: string;
  summary: string;
  tags: string[];
  details: Record<string, unknown>;
  status: string;
  visibility: string;
  startsAt: string | null;
  endsAt: string | null;
  owned: boolean;
  createdAt: string;
  updatedAt: string;
};
type Match = { profile: Profile; score: number; reasons: string[] };
type Inbox = {
  id: string;
  edgeType: string;
  targetType: string;
  targetId: string;
  note: string;
  createdAt: string;
  actor: null | {
    id: string;
    handle: string;
    displayName: string;
    headline: string;
  };
};
type Bootstrap = {
  campus: CampusConfig;
  profile: Profile | null;
  people: Profile[];
  matches: Match[];
  items: Item[];
  inbox: Inbox[];
  myEdges: {
    id: string;
    edgeType: string;
    targetType: string;
    targetId: string;
    targetLabel: string;
    note: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  }[];
};
type TagAnalytics = {
  tagId: string;
  mode: string;
  label: string;
  placement: string;
  destination: string;
  active: boolean;
  total: number;
  nfc: number;
  qr: number;
  link: number;
  lastTap: string | null;
};

const campusOptions: { id: CampusId; label: string }[] = [
  { id: 'nyu', label: 'NYU' },
  { id: 'fit', label: 'FIT' },
  { id: 'columbia', label: 'Columbia' },
  { id: 'fordham', label: 'Fordham' },
  { id: 'johnjay', label: 'John Jay' },
];
const tabs = [
  ['overview', 'Home'],
  ['people', 'People'],
  ['projects', 'Projects'],
  ['opportunities', 'Opportunities'],
  ['events', 'Events'],
  ['communities', 'Communities'],
  ['portfolio', 'Portfolio'],
  ['resources', 'Resources'],
  ['tags', 'NFC / QR'],
] as const;
type Tab = (typeof tabs)[number][0];

function tabForMode(mode?: string): Tab {
  if (mode === 'social') return 'people';
  if (mode === 'career') return 'opportunities';
  if (mode === 'events') return 'events';
  if (mode === 'research' || mode === 'justice' || mode === 'study') return 'resources';
  if (mode === 'creative') return 'projects';
  return 'overview';
}

const useCases: Record<
  CampusId,
  { title: string; body: string; tab: Tab; icon: typeof UsersRound }[]
> = {
  nyu: [
    { title: 'Find a film or startup collaborator', body: 'Match by skills, interests, and what each person is looking for.', tab: 'people', icon: Handshake },
    { title: 'Launch a project', body: 'Recruit actors, editors, designers, engineers, or cofounders.', tab: 'projects', icon: FolderKanban },
    { title: 'Discover what is happening', body: 'Browse student-posted events and opportunities around campus and NYC.', tab: 'events', icon: CalendarDays },
  ],
  fit: [
    { title: 'Turn work into a portfolio', body: 'Publish fashion, photo, film, design, writing, code, and campaign work.', tab: 'portfolio', icon: Sparkles },
    { title: 'Find creatives', body: 'Connect models, photographers, stylists, designers, and content makers.', tab: 'people', icon: UsersRound },
    { title: 'Post or find a gig', body: 'Use Opportunities for gigs, internships, jobs, competitions, and research.', tab: 'opportunities', icon: BriefcaseBusiness },
  ],
  columbia: [
    { title: 'Form a research team', body: 'Create a project, list needed expertise, and accept collaborator requests.', tab: 'projects', icon: Network },
    { title: 'Build a shared research library', body: 'Post papers, policy documents, datasets, cases, references, and citations.', tab: 'resources', icon: BookOpen },
    { title: 'Find expertise', body: 'Match with people whose skills complement your research needs.', tab: 'people', icon: Search },
  ],
  fordham: [
    { title: 'Build a career network', body: 'Make your interests and skills discoverable without exposing your email.', tab: 'people', icon: Handshake },
    { title: 'Find internships and fellowships', body: 'Browse community-posted career opportunities with deadlines and links.', tab: 'opportunities', icon: BriefcaseBusiness },
    { title: 'Start something together', body: 'Create startup, business, leadership, or community projects.', tab: 'projects', icon: FolderKanban },
  ],
  johnjay: [
    { title: 'Organize cases and policy sources', body: 'Share cases, papers, policy documents, datasets, and references with citations.', tab: 'resources', icon: BookOpen },
    { title: 'Build civic projects', body: 'Recruit people across justice, policy, cyber, forensics, and civic tech.', tab: 'projects', icon: Network },
    { title: 'Find public-service opportunities', body: 'Post and browse internships, volunteer roles, fellowships, research, and jobs.', tab: 'opportunities', icon: BriefcaseBusiness },
  ],
};

function split(value: FormDataEntryValue | null) {
  return String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 12);
}
function value(form: FormData, key: string) {
  return String(form.get(key) ?? '').trim();
}
function maybeDate(form: FormData, key: string) {
  const raw = value(form, key);
  return raw ? new Date(raw).toISOString() : null;
}
function humanDate(value: string | null) {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}
function detail(item: Item, key: string) {
  const raw = item.details[key];
  return typeof raw === 'string' && raw ? raw : null;
}

async function api(
  method: 'POST' | 'PATCH' | 'DELETE',
  body: Record<string, unknown>,
) {
  const response = await fetch('/api/campus', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(payload.error || 'Campus request failed.');
  return payload as Record<string, unknown>;
}

export default function CampusWorkspace({
  initialCampus,
  entryMode,
  entryTag,
  entrySource,
}: {
  initialCampus: CampusId;
  entryMode?: string;
  entryTag?: string;
  entrySource?: string;
}) {
  const [campus, setCampus] = useState<CampusId>(initialCampus);
  const [data, setData] = useState<Bootstrap | null>(null);
  const [tab, setTab] = useState<Tab>(() => tabForMode(entryMode));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [showComposer, setShowComposer] = useState<CampusItemKind | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [tags, setTags] = useState<TagAnalytics[]>([]);

  const load = useCallback(async (nextCampus: CampusId) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(
        `/api/campus?campus=${encodeURIComponent(nextCampus)}&view=bootstrap`,
        { cache: 'no-store' },
      );
      const payload = (await response.json()) as Bootstrap & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Campus could not load.');
      setData(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Campus could not load.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAnalytics = useCallback(async (nextCampus: CampusId) => {
    try {
      const response = await fetch(
        `/api/campus?campus=${encodeURIComponent(nextCampus)}&view=analytics`,
        { cache: 'no-store' },
      );
      const payload = (await response.json()) as { tags?: TagAnalytics[]; error?: string };
      if (response.ok) setTags(payload.tags ?? []);
      else if (response.status !== 401) throw new Error(payload.error || 'Analytics could not load.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Analytics could not load.');
    }
  }, []);

  useEffect(() => {
    void load(campus);
  }, [campus, load]);

  useEffect(() => {
    if (tab === 'tags') void loadAnalytics(campus);
  }, [campus, loadAnalytics, tab]);

  function switchCampus(next: CampusId) {
    setCampus(next);
    setTab('overview');
    setQuery('');
    setTags([]);
    const url = new URL(window.location.href);
    url.searchParams.set('campus', next);
    url.searchParams.delete('tag');
    url.searchParams.delete('source');
    url.searchParams.delete('mode');
    window.history.replaceState(null, '', url);
  }

  async function run(
    action: () => Promise<unknown>,
    message: string,
    reload = true,
  ) {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(message);
      if (reload) await load(campus);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Action failed.');
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(
      () =>
        api('POST', {
          action: 'saveProfile',
          profile: {
            campusId: campus,
            handle: value(form, 'handle'),
            displayName: value(form, 'displayName'),
            affiliation: value(form, 'affiliation') || 'student',
            headline: value(form, 'headline'),
            bio: value(form, 'bio'),
            skills: split(form.get('skills')),
            interests: split(form.get('interests')),
            lookingFor: split(form.get('lookingFor')),
            links: value(form, 'linkUrl')
              ? [
                  {
                    label: value(form, 'linkLabel') || 'Website',
                    url: value(form, 'linkUrl'),
                  },
                ]
              : [],
            isPublic: form.get('isPublic') === 'on',
          },
        }),
      'Profile saved.',
    );
    setEditingProfile(false);
  }

  async function createItem(event: FormEvent<HTMLFormElement>, kind: CampusItemKind) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const details: Record<string, unknown> = {
      externalUrl: value(form, 'externalUrl'),
      locationText: value(form, 'locationText'),
    };
    if (kind === 'project') {
      details.track = value(form, 'track');
      details.needs = split(form.get('needs'));
      details.status = value(form, 'status') || 'recruiting';
    }
    if (kind === 'opportunity') {
      details.opportunityType = value(form, 'opportunityType') || 'internship';
      details.organization = value(form, 'organization');
      details.compensation = value(form, 'compensation');
      details.deadline = maybeDate(form, 'deadline');
    }
    if (kind === 'event') {
      details.organizer = value(form, 'organizer');
      details.registrationUrl = value(form, 'registrationUrl');
    }
    if (kind === 'community') {
      details.category = value(form, 'category');
      details.joinPolicy = value(form, 'joinPolicy') || 'open';
    }
    if (kind === 'portfolio') {
      details.mediaType = value(form, 'mediaType') || 'project';
      details.role = value(form, 'role');
      details.year = value(form, 'year');
    }
    if (kind === 'resource') {
      details.resourceType = value(form, 'resourceType') || 'reference';
      details.citation = value(form, 'citation');
    }
    await run(
      () =>
        api('POST', {
          action: 'createItem',
          item: {
            campusId: campus,
            kind,
            title: value(form, 'title'),
            summary: value(form, 'summary'),
            tags: split(form.get('tags')),
            details,
            startsAt: kind === 'event' ? maybeDate(form, 'startsAt') : null,
            endsAt: kind === 'event' ? maybeDate(form, 'endsAt') : null,
            visibility: value(form, 'visibility') || 'campus',
          },
        }),
      'Published to Campus.',
    );
    setShowComposer(null);
  }

  async function editItem(item: Item) {
    const title = window.prompt('Title', item.title);
    if (title == null) return;
    const summary = window.prompt('Description', item.summary);
    if (summary == null) return;
    await run(
      () =>
        api('PATCH', {
          action: 'updateItem',
          id: item.id,
          item: {
            campusId: item.campusId,
            kind: item.kind,
            title,
            summary,
            tags: item.tags,
            details: item.details,
            startsAt: item.startsAt,
            endsAt: item.endsAt,
            visibility: item.visibility,
          },
        }),
      'Post updated.',
    );
  }

  async function archiveItem(id: string) {
    if (!window.confirm('Archive this Campus post?')) return;
    await run(
      () => api('PATCH', { action: 'archiveItem', id }),
      'Post archived.',
    );
  }

  async function leaveCampus() {
    if (
      !window.confirm(
        'Delete your profile, posts, connections, registered tags, and tag analytics for this Campus? This cannot be undone.',
      )
    )
      return;
    await run(
      () => api('DELETE', { action: 'leaveCampus', campusId: campus }),
      'Campus data deleted.',
    );
  }

  async function setTagActive(tagId: string, active: boolean) {
    await run(
      () => api('PATCH', { action: 'setTagActive', tagId, active }),
      active ? 'Tag activated.' : 'Tag deactivated.',
      false,
    );
    await loadAnalytics(campus);
  }

  async function clearTagAnalytics(tagId: string) {
    if (!window.confirm('Delete all tap/scan events for this tag?')) return;
    await run(
      () => api('DELETE', { action: 'clearTagAnalytics', tagId }),
      'Tag analytics cleared.',
      false,
    );
    await loadAnalytics(campus);
  }

  async function edge(
    edgeType: 'follow' | 'save' | 'collaborator_request' | 'join' | 'block',
    targetType: 'profile' | 'item',
    targetId: string,
    note = '',
  ) {
    await run(
      () =>
        api('POST', {
          action: 'edge',
          campusId: campus,
          edgeType,
          targetType,
          targetId,
          note,
        }),
      edgeType === 'collaborator_request'
        ? 'Collaboration request sent.'
        : edgeType === 'join'
          ? 'Join request saved.'
          : 'Saved.',
    );
  }

  async function removeEdge(id: string) {
    await run(
      () => api('PATCH', { action: 'removeEdge', id }),
      'Connection removed.',
    );
  }

  async function respondEdge(id: string, decision: 'accepted' | 'declined') {
    await run(
      () => api('POST', { action: 'respondEdge', id, decision }),
      decision === 'accepted' ? 'Request accepted.' : 'Request declined.',
    );
  }

  async function report(targetType: 'profile' | 'item', targetId: string) {
    const detail = window.prompt(
      'What should we review? Do not include passwords or sensitive information.',
      '',
    );
    if (detail == null) return;
    await run(
      () =>
        api('POST', {
          action: 'report',
          campusId: campus,
          targetType,
          targetId,
          reason: 'other',
          detail,
        }),
      'Report submitted.',
    );
  }

  async function registerTags(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(
      () =>
        api('POST', {
          action: 'registerTags',
          campusId: campus,
          prefix: value(form, 'prefix') || campus,
          start: Number(value(form, 'start') || '1'),
          count: Number(value(form, 'count') || '10'),
          mode: value(form, 'mode') || data?.campus.defaultMode || 'campus',
          label: value(form, 'label'),
          placement: value(form, 'placement'),
        }),
      'NFC / QR tags registered.',
      false,
    );
    await loadAnalytics(campus);
  }

  const itemsByKind = (kind: CampusItemKind) =>
    (data?.items ?? []).filter((item) => item.kind === kind);

  if (loading && !data)
    return (
      <main className={styles.loading}>
        <GraduationCap size={30} />
        <strong>Opening Avocado Campus…</strong>
      </main>
    );

  return (
    <main
      className={styles.shell}
      style={{ '--campus-accent': data?.campus.accent ?? '#70a928' } as CSSProperties}
    >
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand}>
          <span>🥑</span>
          <b>avocado</b>
          <small>Campus</small>
        </Link>
        <div className={styles.toplinks}>
          <Link href="/sky">Sky</Link>
          <Link href="/chat">Zema</Link>
          <Link href="/wallet" aria-label="Wallet">
            <WalletCards size={17} />
          </Link>
        </div>
      </header>

      <section className={styles.campusPicker} aria-label="Choose campus">
        {campusOptions.map((option) => (
          <button
            key={option.id}
            aria-pressed={campus === option.id}
            onClick={() => switchCampus(option.id)}
          >
            {option.label}
          </button>
        ))}
      </section>

      {data && (
        <>
          <section className={styles.hero}>
            <div>
              <p>{data.campus.name}</p>
              <h1>{data.campus.headline}</h1>
              <span>{data.campus.description}</span>
              <div className={styles.focus}>
                {data.campus.focus.map((focus) => (
                  <i key={focus}>{focus}</i>
                ))}
              </div>
            </div>
            <aside>
              <strong>{data.people.length}</strong>
              <span>public people</span>
              <strong>{data.items.filter((item) => item.status === 'active').length}</strong>
              <span>active posts</span>
            </aside>
          </section>

          {(entryTag || entryMode) && (
            <div className={styles.entryNotice}>
              <Radio size={18} />
              <span>
                Opened from {entryTag ? <b>{entryTag}</b> : 'a Campus entry'}
                {entryMode ? ` · ${entryMode} mode` : ''}
                {entrySource ? ` · ${entrySource.toUpperCase()}` : ''}
              </span>
            </div>
          )}

          <div className={styles.truth}>
            <ShieldCheck size={18} />
            <span>
              Avocado Campus is not an official university system. Profiles marked
              “verified” only mean the signed-in email domain matched that campus.
              Events and opportunities are community-posted unless their external
              source says otherwise.
            </span>
          </div>

          {(error || notice) && (
            <div className={error ? styles.error : styles.notice}>
              <span>{error || notice}</span>
              <button onClick={() => { setError(''); setNotice(''); }} aria-label="Dismiss">
                <X size={15} />
              </button>
            </div>
          )}

          <nav className={styles.tabs} aria-label="Campus sections">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => setTab(id)}
              >
                {label}
                {id === 'people' && data.inbox.length > 0 && (
                  <span>{data.inbox.length}</span>
                )}
              </button>
            ))}
          </nav>

          <div className={styles.content}>
            {tab === 'overview' && (
              <Overview
                data={data}
                onTab={setTab}
                onEditProfile={() => setEditingProfile(true)}
              />
            )}

            {tab === 'people' && (
              <People
                data={data}
                query={query}
                setQuery={setQuery}
                saving={saving}
                onRequest={(id) =>
                  edge('collaborator_request', 'profile', id, 'Let’s connect through Avocado Campus.')
                }
                onFollow={(id) => edge('follow', 'profile', id)}
                onBlock={(id) => edge('block', 'profile', id)}
                onReport={(id) => report('profile', id)}
                onRespond={respondEdge}
                onRemove={removeEdge}
              />
            )}

            {tab === 'projects' && (
              <ItemSection
                title="Projects"
                subtitle="Recruit a team and make the work visible."
                items={itemsByKind('project')}
                kind="project"
                saving={saving}
                composer={showComposer === 'project'}
                onCompose={() => setShowComposer(showComposer === 'project' ? null : 'project')}
                onSubmit={createItem}
                onAction={(id) => edge('collaborator_request', 'item', id, 'I’d like to collaborate on this project.')}
                actionLabel="Collaborate"
                onEdit={editItem}
                onArchive={archiveItem}
                onReport={(id) => report('item', id)}
              />
            )}

            {tab === 'opportunities' && (
              <ItemSection
                title={data.campus.opportunityLabel}
                subtitle="Gigs, internships, jobs, fellowships, research, competitions, and volunteer roles."
                items={itemsByKind('opportunity')}
                kind="opportunity"
                saving={saving}
                composer={showComposer === 'opportunity'}
                onCompose={() => setShowComposer(showComposer === 'opportunity' ? null : 'opportunity')}
                onSubmit={createItem}
                onAction={(id) => edge('save', 'item', id)}
                actionLabel="Save"
                onEdit={editItem}
                onArchive={archiveItem}
                onReport={(id) => report('item', id)}
              />
            )}

            {tab === 'events' && (
              <ItemSection
                title="Events"
                subtitle="Student-posted events with time, place, organizer, and registration link."
                items={itemsByKind('event')}
                kind="event"
                saving={saving}
                composer={showComposer === 'event'}
                onCompose={() => setShowComposer(showComposer === 'event' ? null : 'event')}
                onSubmit={createItem}
                onAction={(id) => edge('save', 'item', id)}
                actionLabel="Save"
                onEdit={editItem}
                onArchive={archiveItem}
                onReport={(id) => report('item', id)}
              />
            )}

            {tab === 'communities' && (
              <ItemSection
                title="Communities"
                subtitle="Create an open group or require approval for new members."
                items={itemsByKind('community')}
                kind="community"
                saving={saving}
                composer={showComposer === 'community'}
                onCompose={() => setShowComposer(showComposer === 'community' ? null : 'community')}
                onSubmit={createItem}
                onAction={(id) => edge('join', 'item', id)}
                actionLabel="Join"
                onEdit={editItem}
                onArchive={archiveItem}
                onReport={(id) => report('item', id)}
              />
            )}

            {tab === 'portfolio' && (
              <ItemSection
                title="Portfolio"
                subtitle="Publish work you want other students and collaborators to discover."
                items={itemsByKind('portfolio')}
                kind="portfolio"
                saving={saving}
                composer={showComposer === 'portfolio'}
                onCompose={() => setShowComposer(showComposer === 'portfolio' ? null : 'portfolio')}
                onSubmit={createItem}
                onAction={(id) => edge('save', 'item', id)}
                actionLabel="Save"
                onEdit={editItem}
                onArchive={archiveItem}
                onReport={(id) => report('item', id)}
              />
            )}

            {tab === 'resources' && (
              <ItemSection
                title={data.campus.resourceLabel}
                subtitle="Cases, papers, policy, datasets, references, and guides. Add the original source URL whenever possible."
                items={itemsByKind('resource')}
                kind="resource"
                saving={saving}
                composer={showComposer === 'resource'}
                onCompose={() => setShowComposer(showComposer === 'resource' ? null : 'resource')}
                onSubmit={createItem}
                onAction={(id) => edge('save', 'item', id)}
                actionLabel="Save"
                onEdit={editItem}
                onArchive={archiveItem}
                onReport={(id) => report('item', id)}
              />
            )}

            {tab === 'tags' && (
              <Tags
                campus={data.campus}
                tags={tags}
                saving={saving}
                onSubmit={registerTags}
                onSetActive={setTagActive}
                onClearAnalytics={clearTagAnalytics}
              />
            )}
          </div>

          {(editingProfile || !data.profile) && (
            <ProfileEditor
              profile={data.profile}
              campus={data.campus}
              saving={saving}
              required={!data.profile}
              onClose={() => setEditingProfile(false)}
              onSubmit={saveProfile}
              onLeave={leaveCampus}
            />
          )}
        </>
      )}
    </main>
  );
}

function Overview({
  data,
  onTab,
  onEditProfile,
}: {
  data: Bootstrap;
  onTab: (tab: Tab) => void;
  onEditProfile: () => void;
}) {
  return (
    <section className={styles.overview}>
      <div className={styles.sectionHeading}>
        <div>
          <span>HOW AVOCADO WORKS HERE</span>
          <h2>Built around this campus.</h2>
        </div>
      </div>

      <div className={styles.useCaseGrid}>
        {useCases[data.campus.id].map(({ title, body, tab, icon: Icon }) => (
          <button key={title} onClick={() => onTab(tab)}>
            <Icon size={24} />
            <strong>{title}</strong>
            <p>{body}</p>
            <span>
              Open <ChevronRight size={15} />
            </span>
          </button>
        ))}
      </div>

      <div className={styles.profileCard}>
        <div>
          <CircleUserRound size={24} />
          <span>
            <small>YOUR CAMPUS IDENTITY</small>
            <strong>{data.profile?.displayName ?? 'Create your profile'}</strong>
            <p>
              {data.profile
                ? data.profile.headline || `@${data.profile.handle}`
                : 'Add skills, interests, and what you are looking for so matching can work.'}
            </p>
          </span>
        </div>
        <button onClick={onEditProfile}>
          {data.profile ? 'Edit profile' : 'Create profile'}
        </button>
      </div>

      {data.inbox.length > 0 && (
        <button className={styles.inboxBanner} onClick={() => onTab('people')}>
          <Bell size={19} />
          <span>
            <strong>{data.inbox.length} pending request{data.inbox.length === 1 ? '' : 's'}</strong>
            <small>Review collaboration and community requests.</small>
          </span>
          <ChevronRight size={18} />
        </button>
      )}
    </section>
  );
}

function People({
  data,
  query,
  setQuery,
  saving,
  onRequest,
  onFollow,
  onBlock,
  onReport,
  onRespond,
  onRemove,
}: {
  data: Bootstrap;
  query: string;
  setQuery: (value: string) => void;
  saving: boolean;
  onRequest: (id: string) => void;
  onFollow: (id: string) => void;
  onBlock: (id: string) => void;
  onReport: (id: string) => void;
  onRespond: (id: string, decision: 'accepted' | 'declined') => void;
  onRemove: (id: string) => void;
}) {
  const q = query.toLowerCase().trim();
  const people = data.people.filter((person) =>
    !q ||
    [
      person.displayName,
      person.handle,
      person.headline,
      ...person.skills,
      ...person.interests,
      ...person.lookingFor,
    ]
      .join(' ')
      .toLowerCase()
      .includes(q),
  );
  return (
    <section>
      <div className={styles.sectionHeading}>
        <div>
          <span>PEOPLE</span>
          <h2>Find the right person.</h2>
          <p>Matching uses only profile skills, interests, and stated needs.</p>
        </div>
      </div>

      {data.inbox.length > 0 && (
        <div className={styles.inbox}>
          <h3>Requests</h3>
          {data.inbox.map((request) => (
            <article key={request.id}>
              <div>
                <strong>{request.actor?.displayName ?? 'Campus member'}</strong>
                <p>{request.note || request.edgeType.replaceAll('_', ' ')}</p>
              </div>
              <button disabled={saving} onClick={() => onRespond(request.id, 'accepted')}>
                Accept
              </button>
              <button disabled={saving} onClick={() => onRespond(request.id, 'declined')}>
                Decline
              </button>
            </article>
          ))}
        </div>
      )}

      {data.profile && data.matches.length > 0 && (
        <>
          <h3 className={styles.subheading}>Matches for you</h3>
          <div className={styles.matchRow}>
            {data.matches.slice(0, 8).map((match) => (
              <article key={match.profile.id}>
                <div className={styles.matchScore}>{match.score}</div>
                <strong>{match.profile.displayName}</strong>
                <span>@{match.profile.handle}</span>
                <p>{match.reasons.join(' · ')}</p>
                <button disabled={saving} onClick={() => onRequest(match.profile.id)}>
                  Connect
                </button>
              </article>
            ))}
          </div>
        </>
      )}

      {data.myEdges.length > 0 && (
        <details className={styles.connections}>
          <summary>Your follows, saves, joins, blocks & requests ({data.myEdges.length})</summary>
          <div>
            {data.myEdges.map((connection) => (
              <article key={connection.id}>
                <span>
                  <strong>{connection.targetLabel}</strong>
                  <small>{connection.edgeType.replaceAll('_', ' ')} · {connection.status}</small>
                </span>
                <button disabled={saving} onClick={() => onRemove(connection.id)}>
                  Remove
                </button>
              </article>
            ))}
          </div>
        </details>
      )}

      <label className={styles.search}>
        <Search size={17} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search skills, interests, names…"
        />
      </label>

      <div className={styles.peopleGrid}>
        {people.map((person) => (
          <article key={person.id}>
            <div className={styles.avatar}>{person.displayName.slice(0, 1).toUpperCase()}</div>
            <div className={styles.personTop}>
              <strong>{person.displayName}</strong>
              <span>@{person.handle}</span>
              {person.affiliationStatus === 'domain_verified' && (
                <em>
                  <ShieldCheck size={13} /> domain verified
                </em>
              )}
            </div>
            <p>{person.headline || person.bio || 'Campus member'}</p>
            <div className={styles.chips}>
              {[...person.skills, ...person.interests].slice(0, 6).map((chip) => (
                <i key={chip}>{chip}</i>
              ))}
            </div>
            {person.lookingFor.length > 0 && (
              <small>Looking for: {person.lookingFor.join(', ')}</small>
            )}
            <div className={styles.cardActions}>
              <button disabled={saving} onClick={() => onRequest(person.id)}>Collaborate</button>
              <button disabled={saving} onClick={() => onFollow(person.id)}>Follow</button>
              <details>
                <summary>•••</summary>
                <button onClick={() => onReport(person.id)}>Report</button>
                <button onClick={() => onBlock(person.id)}>Block</button>
              </details>
            </div>
          </article>
        ))}
        {people.length === 0 && <Empty text="No public profiles match yet." />}
      </div>
    </section>
  );
}

function ItemSection({
  title,
  subtitle,
  items,
  kind,
  saving,
  composer,
  onCompose,
  onSubmit,
  onAction,
  actionLabel,
  onEdit,
  onArchive,
  onReport,
}: {
  title: string;
  subtitle: string;
  items: Item[];
  kind: CampusItemKind;
  saving: boolean;
  composer: boolean;
  onCompose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>, kind: CampusItemKind) => void;
  onAction: (id: string) => void;
  actionLabel: string;
  onEdit: (item: Item) => void;
  onArchive: (id: string) => void;
  onReport: (id: string) => void;
}) {
  return (
    <section>
      <div className={styles.sectionHeading}>
        <div>
          <span>{kind.toUpperCase()}</span>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <button className={styles.primary} onClick={onCompose}>
          {composer ? 'Close' : 'Post'}
        </button>
      </div>

      {composer && (
        <ItemComposer kind={kind} saving={saving} onSubmit={(event) => onSubmit(event, kind)} />
      )}

      <div className={styles.itemGrid}>
        {items.map((item) => (
          <article key={item.id}>
            <header>
              <span>{item.kind}</span>
              {item.owned && <em>Yours</em>}
            </header>
            <h3>{item.title}</h3>
            <p>{item.summary}</p>
            <div className={styles.chips}>
              {item.tags.map((tag) => <i key={tag}>{tag}</i>)}
            </div>
            <dl>
              {item.startsAt && <div><dt>When</dt><dd>{humanDate(item.startsAt)}</dd></div>}
              {detail(item, 'organization') && <div><dt>Organization</dt><dd>{detail(item, 'organization')}</dd></div>}
              {detail(item, 'compensation') && <div><dt>Compensation</dt><dd>{detail(item, 'compensation')}</dd></div>}
              {detail(item, 'locationText') && <div><dt>Location</dt><dd>{detail(item, 'locationText')}</dd></div>}
              {detail(item, 'citation') && <div><dt>Source</dt><dd>{detail(item, 'citation')}</dd></div>}
              {detail(item, 'role') && <div><dt>Role</dt><dd>{detail(item, 'role')}</dd></div>}
            </dl>
            <div className={styles.cardActions}>
              {!item.owned && (
                <button disabled={saving} onClick={() => onAction(item.id)}>
                  {actionLabel}
                </button>
              )}
              {item.owned && (
                <>
                  <button disabled={saving} onClick={() => onEdit(item)}>Edit</button>
                  <button className={styles.ghost} disabled={saving} onClick={() => onArchive(item.id)}>Archive</button>
                </>
              )}
              {detail(item, 'externalUrl') && (
                <a href={detail(item, 'externalUrl')!} target="_blank" rel="noreferrer">
                  Open source <Link2 size={14} />
                </a>
              )}
              {!item.owned && <button className={styles.ghost} onClick={() => onReport(item.id)}>Report</button>}
            </div>
          </article>
        ))}
        {items.length === 0 && <Empty text={`No ${title.toLowerCase()} posted yet.`} />}
      </div>
    </section>
  );
}

function ItemComposer({
  kind,
  saving,
  onSubmit,
}: {
  kind: CampusItemKind;
  saving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className={styles.composer} onSubmit={onSubmit}>
      <div className={styles.formGrid}>
        <label>
          Title
          <input name="title" required minLength={2} maxLength={100} />
        </label>
        <label>
          Tags
          <input name="tags" placeholder="AI, film, policy" />
        </label>
      </div>
      <label>
        Description
        <textarea name="summary" required minLength={2} maxLength={600} rows={3} />
      </label>

      {kind === 'project' && (
        <div className={styles.formGrid}>
          <label>Track<input name="track" placeholder="Film / AI / Policy" /></label>
          <label>People needed<input name="needs" placeholder="Editor, designer, researcher" /></label>
        </div>
      )}
      {kind === 'opportunity' && (
        <div className={styles.formGrid}>
          <label>
            Type
            <select name="opportunityType" defaultValue="internship">
              <option value="internship">Internship</option>
              <option value="gig">Gig</option>
              <option value="job">Job</option>
              <option value="fellowship">Fellowship</option>
              <option value="research">Research</option>
              <option value="volunteer">Volunteer</option>
              <option value="competition">Competition</option>
            </select>
          </label>
          <label>Organization<input name="organization" /></label>
          <label>Compensation<input name="compensation" placeholder="$ / unpaid / credit" /></label>
          <label>Deadline<input name="deadline" type="datetime-local" /></label>
        </div>
      )}
      {kind === 'event' && (
        <div className={styles.formGrid}>
          <label>Starts<input name="startsAt" type="datetime-local" required /></label>
          <label>Ends<input name="endsAt" type="datetime-local" /></label>
          <label>Organizer<input name="organizer" /></label>
          <label>Registration URL<input name="registrationUrl" type="url" /></label>
        </div>
      )}
      {kind === 'community' && (
        <div className={styles.formGrid}>
          <label>Category<input name="category" placeholder="Film club / AI / civic tech" /></label>
          <label>
            Join policy
            <select name="joinPolicy" defaultValue="open">
              <option value="open">Open</option>
              <option value="approval">Approval required</option>
            </select>
          </label>
        </div>
      )}
      {kind === 'portfolio' && (
        <div className={styles.formGrid}>
          <label>
            Work type
            <select name="mediaType" defaultValue="project">
              <option value="project">Project</option>
              <option value="film">Film</option>
              <option value="photo">Photography</option>
              <option value="fashion">Fashion</option>
              <option value="design">Design</option>
              <option value="writing">Writing</option>
              <option value="code">Code</option>
              <option value="research">Research</option>
            </select>
          </label>
          <label>Your role<input name="role" /></label>
          <label>Year<input name="year" placeholder="2026" /></label>
        </div>
      )}
      {kind === 'resource' && (
        <div className={styles.formGrid}>
          <label>
            Resource type
            <select name="resourceType" defaultValue="reference">
              <option value="case">Case</option>
              <option value="paper">Paper</option>
              <option value="policy">Policy</option>
              <option value="dataset">Dataset</option>
              <option value="reference">Reference</option>
              <option value="guide">Guide</option>
            </select>
          </label>
          <label>Citation<input name="citation" placeholder="Author, title, court, DOI…" /></label>
        </div>
      )}

      <div className={styles.formGrid}>
        <label>External URL<input name="externalUrl" type="url" placeholder="https://" /></label>
        <label>Location<input name="locationText" placeholder="Campus / room / online" /></label>
        <label>
          Visibility
          <select name="visibility" defaultValue="campus">
            <option value="campus">Campus</option>
            <option value="public">Public</option>
          </select>
        </label>
      </div>
      <button className={styles.primary} disabled={saving}>
        {saving ? 'Publishing…' : 'Publish'}
      </button>
    </form>
  );
}

function ProfileEditor({
  profile,
  campus,
  saving,
  required,
  onClose,
  onSubmit,
  onLeave,
}: {
  profile: Profile | null;
  campus: CampusConfig;
  saving: boolean;
  required: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onLeave: () => void;
}) {
  return (
    <div className={styles.modalBackdrop}>
      <form className={styles.modal} onSubmit={onSubmit}>
        <header>
          <div>
            <span>{campus.shortName} PROFILE</span>
            <h2>{profile ? 'Edit your Campus profile' : 'Join this Campus'}</h2>
          </div>
          {!required && (
            <button type="button" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          )}
        </header>
        <p>
          Your authenticated email is never displayed. If its domain matches this
          campus, Avocado shows a domain-verified badge without storing the email here.
        </p>
        <div className={styles.formGrid}>
          <label>
            Display name
            <input name="displayName" defaultValue={profile?.displayName ?? ''} required />
          </label>
          <label>
            Handle
            <input name="handle" defaultValue={profile?.handle ?? ''} placeholder="kaiya" required />
          </label>
          <label>
            Affiliation
            <select name="affiliation" defaultValue={profile?.affiliation ?? 'student'}>
              <option value="student">Student</option>
              <option value="alumni">Alumni</option>
              <option value="faculty">Faculty</option>
              <option value="staff">Staff</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Headline
            <input name="headline" defaultValue={profile?.headline ?? ''} placeholder="Film + AI + startups" />
          </label>
        </div>
        <label>
          Bio
          <textarea name="bio" rows={3} defaultValue={profile?.bio ?? ''} />
        </label>
        <div className={styles.formGrid}>
          <label>Skills<input name="skills" defaultValue={profile?.skills.join(', ') ?? ''} placeholder="Editing, Python, policy research" /></label>
          <label>Interests<input name="interests" defaultValue={profile?.interests.join(', ') ?? ''} placeholder="Film, AI, fashion" /></label>
          <label>Looking for<input name="lookingFor" defaultValue={profile?.lookingFor.join(', ') ?? ''} placeholder="Designer, cofounder, photographer" /></label>
          <label>Website label<input name="linkLabel" defaultValue={profile?.links[0]?.label ?? ''} placeholder="Portfolio" /></label>
          <label>Website URL<input name="linkUrl" type="url" defaultValue={profile?.links[0]?.url ?? ''} placeholder="https://" /></label>
        </div>
        <label className={styles.checkbox}>
          <input
            name="isPublic"
            type="checkbox"
            defaultChecked={profile?.isPublic ?? true}
          />
          Let other people on this Campus discover this profile
        </label>
        <div className={styles.modalActions}>
          <button className={styles.primary} disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
          {profile && (
            <button type="button" className={styles.danger} disabled={saving} onClick={onLeave}>
              Delete my Campus data
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function Tags({
  campus,
  tags,
  saving,
  onSubmit,
  onSetActive,
  onClearAnalytics,
}: {
  campus: CampusConfig;
  tags: TagAnalytics[];
  saving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSetActive: (tagId: string, active: boolean) => void;
  onClearAnalytics: (tagId: string) => void;
}) {
  const total = tags.reduce((sum, tag) => sum + tag.total, 0);
  const nfc = tags.reduce((sum, tag) => sum + tag.nfc, 0);
  const qr = tags.reduce((sum, tag) => sum + tag.qr, 0);
  return (
    <section>
      <div className={styles.sectionHeading}>
        <div>
          <span>PHYSICAL ENTRY LAYER</span>
          <h2>NFC / QR tags</h2>
          <p>
            Register the exact IDs written by the iPhone writer. NFC and QR can point
            to the same tag ID while analytics keeps the source separate.
          </p>
        </div>
      </div>

      <div className={styles.metricGrid}>
        <article><strong>{tags.length}</strong><span>registered tags</span></article>
        <article><strong>{total}</strong><span>opens</span></article>
        <article><strong>{nfc}</strong><span>NFC</span></article>
        <article><strong>{qr}</strong><span>QR</span></article>
      </div>

      <form className={styles.composer} onSubmit={onSubmit}>
        <h3>Register a batch</h3>
        <div className={styles.formGrid}>
          <label>Prefix<input name="prefix" defaultValue={campus.id} /></label>
          <label>Start number<input name="start" type="number" min="1" max="999999" defaultValue="1" /></label>
          <label>Count<input name="count" type="number" min="1" max="200" defaultValue="10" /></label>
          <label>
            Mode
            <select name="mode" defaultValue={campus.defaultMode}>
              <option value="campus">Campus home</option>
              <option value="creative">Creative</option>
              <option value="study">Study</option>
              <option value="social">Social</option>
              <option value="research">Research</option>
              <option value="career">Career</option>
              <option value="justice">Justice</option>
              <option value="events">Events</option>
            </select>
          </label>
          <label>Label<input name="label" placeholder="Library poster" /></label>
          <label>Placement<input name="placement" placeholder="Student center noticeboard" /></label>
        </div>
        <button className={styles.primary} disabled={saving}>
          {saving ? 'Registering…' : 'Register batch'}
        </button>
      </form>

      <div className={styles.tagList}>
        {tags.map((tag) => (
          <article key={tag.tagId}>
            <div>
              <Radio size={19} />
              <span>
                <strong>{tag.tagId}</strong>
                <small>{tag.label || tag.mode}{tag.placement ? ` · ${tag.placement}` : ''}</small>
              </span>
            </div>
            <dl>
              <div><dt>Total</dt><dd>{tag.total}</dd></div>
              <div><dt>NFC</dt><dd>{tag.nfc}</dd></div>
              <div><dt>QR</dt><dd>{tag.qr}</dd></div>
            </dl>
            <code>{`/t/${tag.tagId}?source=nfc`}</code>
            <code>{`/t/${tag.tagId}?source=qr`}</code>
            <div className={styles.tagActions}>
              <button disabled={saving} onClick={() => onSetActive(tag.tagId, !tag.active)}>
                {tag.active ? 'Deactivate' : 'Activate'}
              </button>
              <button disabled={saving || tag.total === 0} onClick={() => onClearAnalytics(tag.tagId)}>
                Clear analytics
              </button>
            </div>
          </article>
        ))}
        {tags.length === 0 && <Empty text="No registered tags yet." />}
      </div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className={styles.empty}>
      <GraduationCap size={25} />
      <strong>{text}</strong>
    </div>
  );
}
