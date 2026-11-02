'use client';
import { newsSourceHandoff, newsTimestampLabel } from '@/lib/eve-news-feed';
/* oxlint-disable next/no-html-link-for-pages -- Sites sign-in is a top-level gateway. */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SyntheticEvent,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { writeHomeIntent } from '@/lib/home-intent';
import { useEveSourceHandoff } from '@/lib/use-eve-source-handoff';
import {
  ArrowUpRight,
  ArrowLeft,
  Lock,
  Plus,
  Users,
  Heart,
  MessageCircle,
  Repeat2,
  Bookmark,
  Share2,
  MoreHorizontal,
  SlidersHorizontal,
  RefreshCw,
  Link2,
  X,
  LoaderCircle,
  Newspaper,
  Radio,
} from 'lucide-react';
import { catalog } from '@/lib/catalog';
import { useSkyHub } from '@/lib/use-sky-hub';
import type {
  SkyCommunity,
  SkySocialAttachment,
  SkySocialState,
  SkySocialPost,
} from '@/lib/sky-social';
import styles from './sky-social-timeline.module.css';
import SkyCommunityDirectory from './sky-community-directory';
import CommunityOsWorkbench from './community-os-workbench';
import {
  useSkyContinuousFeed,
  type ContinuousItem,
} from './use-sky-continuous-feed';
import { feedPollDelay } from '@/lib/sky-continuous-ranking';
import { useSkyFeedReveal } from './use-sky-feed-reveal';
import {
  communityFetch,
  prepareCommunityKey,
  setCommunityKeyProfile,
} from '@/lib/community-key-client';
const empty: SkySocialState = {
  profile: null,
  communities: [],
  posts: [],
  cursor: null,
};
async function request<T>(
  path: string,
  input?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let body = input;
  if (
    input &&
    typeof input === 'object' &&
    'action' in input &&
    'id' in input
  ) {
    const v = input as Record<string, unknown>;
    if (
      ['createCommunity', 'join', 'bootstrapKey'].includes(String(v.action)) &&
      typeof v.id === 'string'
    )
      body = { ...v, ...prepareCommunityKey(v.id, v.action !== 'join') };
  }
  return communityFetch<T>(path, body, signal);
}
export default function SkySocialTimeline({
  fullHome = false,
  personalFeed,
  initialView = 'home',
  discovery,
  externalFeed,
}: {
  fullHome?: boolean;
  personalFeed?: ReactNode;
  initialView?: 'home' | 'bookmarks' | 'communities';
  discovery?: ReactNode;
  externalFeed?: ReactNode;
} = {}) {
  const [data, setData] = useState(empty),
    [mode, setMode] = useState<'recommended' | 'following' | 'bookmarks'>(
      initialView === 'bookmarks' ? 'bookmarks' : 'recommended',
    ),
    [communityId, setCommunityId] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [signedOut, setSignedOut] = useState(false);
  const [clock, setClock] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setMode(current => initialView === 'bookmarks' ? 'bookmarks' : current === 'bookmarks' ? 'recommended' : current);
    });
    return () => cancelAnimationFrame(frame);
  }, [initialView]);
  useEffect(() => {
    const tick = () => setClock(Date.now());
    tick();
    const timer = window.setInterval(tick, 60000);
    return () => window.clearInterval(timer);
  }, []);
  const [joinForm, setJoinForm] = useState(false);
  const [threadId, setThreadId] = useState(''),
    [management, setManagement] = useState(false),
    [attachmentOpen, setAttachmentOpen] = useState(false),
    [expanded, setExpanded] = useState<Record<string, boolean>>({}),
    [pendingReactions, setPendingReactions] = useState<Record<string, boolean>>(
      {},
    );
  const [live, setLive] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState(0);
  const [liveError, setLiveError] = useState('');
  const continuousEnabled =
    fullHome &&
    mode === 'recommended' &&
    !communityId &&
    !threadId &&
    initialView !== 'communities';
  const continuous = useSkyContinuousFeed(
    data.posts,
    `${data.profile?.id ?? 'guest'}:${mode}:${communityId}:${threadId}`,
    continuousEnabled,
    live,
  );
  const feedRef = useRef(continuous);
  useEffect(() => {
    feedRef.current = continuous;
  }, [continuous]);
  useSkyFeedReveal(continuous, continuousEnabled, live);
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  const loadController = useRef<AbortController | null>(null);
  const lastLoad = useRef(0);
  const pendingReactionIds = useRef(new Set<string>()),
    sentinel = useRef<HTMLDivElement>(null),
    paging = useRef(false);
  const [publicName, setPublicName] = useState(''),
    [text, setText] = useState(''),
    [attachmentKind, setAttachmentKind] = useState<
      SkySocialAttachment['kind'] | 'none'
    >('none'),
    [resource, setResource] = useState('');
  const [communityForm, setCommunityForm] = useState(false),
    [name, setName] = useState(''),
    [description, setDescription] = useState(''),
    [rules, setRules] = useState(''),
    [acceptedRules, setAcceptedRules] = useState(false);
  const [lockedCommunity, setLockedCommunity] = useState<SkyCommunity | null>(
      null,
    ),
    [requestedOsVersion, setRequestedOsVersion] = useState(0),
    [invitationText, setInvitationText] = useState('');
  const [invite, setInvite] = useState<{ id: string; token: string } | null>(
      null,
    ),
    [invitePreview, setInvitePreview] = useState<SkyCommunity | null>(null),
    [inviteUrl, setInviteUrl] = useState('');
  const [inviteError, setInviteError] = useState('');
  const nameInput = useRef<HTMLInputElement>(null);
  const inviteInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!communityForm && !joinForm) return;
    const frame = requestAnimationFrame(() => (communityForm ? nameInput.current : inviteInput.current)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [communityForm, joinForm]);
  const postId = useRef(''),
    newCommunityId = useRef(''),
    sequence = useRef(0);
  const hub = useSkyHub();
  const router = useRouter();
  const sourceHandoff = useEveSourceHandoff(() => router.push('/chat'), setError);
  const communityPage = initialView === 'communities';
  const communityDirectory =
    communityPage && !communityId && !threadId && !lockedCommunity;
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const load = useCallback(
    async (cursor = '', quiet = false) => {
      if (
        quiet &&
        (loadController.current || Date.now() - lastLoad.current < 20_000)
      )
        return;
      loadController.current?.abort();
      const controller = new AbortController();
      loadController.current = controller;
      let timedOut = false;
      const timeout = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 16_000);
      const checked = quiet
        ? dataRef.current.posts
            .slice(0, 200)
            .map((p) => p.id)
            .join(',')
        : '';
      const seq = ++sequence.current;
      if (!quiet) setLoading(true);
      try {
        let value = await request<SkySocialState>(
          `/api/sky/social?${new URLSearchParams({ mode, community: communityId, cursor, thread: threadId, check: checked })}`,
          undefined,
          controller.signal,
        );
        if (seq !== sequence.current) return;
        if (value.profile && setCommunityKeyProfile(value.profile.id))
          value = await request<SkySocialState>(
            `/api/sky/social?${new URLSearchParams({ mode, community: communityId, cursor, thread: threadId, check: checked })}`,
            undefined,
            controller.signal,
          );
        if (seq !== sequence.current) return;
        setData((old) =>
          quiet && old.profile?.id === value.profile?.id
            ? {
                ...value,
                cursor: old.cursor,
                posts: [
                  ...value.posts.filter(
                    (p) => !old.posts.some((v) => v.id === p.id),
                  ),
                  ...old.posts
                    .filter(
                      (p) =>
                        !value.checkedIds?.includes(p.id) ||
                        value.visibleIds?.includes(p.id),
                    )
                    .map((p) => value.posts.find((v) => v.id === p.id) ?? p),
                ].slice(0, 200),
              }
            : cursor
              ? {
                  ...value,
                  posts: [
                    ...old.posts,
                    ...value.posts.filter(
                      (p) => !old.posts.some((oldPost) => oldPost.id === p.id),
                    ),
                  ],
                }
              : value,
        );
        setSignedOut(false);
        setError('');
        setLiveError('');
        lastLoad.current = Date.now();
        setRefreshedAt(lastLoad.current);
      } catch (e) {
        if (seq !== sequence.current) return;
        if (controller.signal.aborted && !timedOut) return;
        if (timedOut) {
          if (quiet) {
            setLiveError('更新の応答を待っています。自動で再試行します。');
            throw e;
          }
          setError('接続に時間がかかっています。再読み込みしてください。');
          return;
        }
        const authError = Boolean(
          e &&
          typeof e === 'object' &&
          'status' in e &&
          (e.status === 401 || e.status === 403),
        );
        if (quiet && !authError) {
          setLiveError('更新を待っています。接続が戻ると再開します。');
          throw e;
        }
        setError(e instanceof Error ? e.message : '読み込めませんでした。');
        if (
          e &&
          typeof e === 'object' &&
          'status' in e &&
          e.status === 403 &&
          communityId
        ) {
          setCommunityId('');
          setLockedCommunity(null);
          setData((old) => ({ ...old, posts: [], cursor: null }));
        }
        if (e && typeof e === 'object' && 'status' in e && e.status === 401) {
          setSignedOut(true);
          setData(empty);
        }
      } finally {
        window.clearTimeout(timeout);
        if (seq === sequence.current) {
          loadController.current = null;
          setLoading(false);
        }
      }
    },
    [mode, communityId, threadId],
  );
  const cancelLoad = useCallback(() => {
    sequence.current++;
    loadController.current?.abort();
    loadController.current = null;
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setData((old) => ({ ...old, posts: [], thread: null, cursor: null }));
      void load();
      setAcceptedRules(false);
      setInviteUrl('');
      postId.current = '';
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelLoad();
    };
  }, [load, cancelLoad]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const sharedPost = new URLSearchParams(window.location.search).get(
        'post',
      );
      if (sharedPost && /^[a-f0-9-]{36}$/i.test(sharedPost))
        setThreadId(sharedPost);
      const hash = new URLSearchParams(window.location.hash.slice(1)),
        id = hash.get('community'),
        token = hash.get('invite');
      if (id && token) {
        setInvitationText(JSON.stringify({ schema: 'rockstar-community-invite/1', communityId: id, token }));
        setJoinForm(true);
        window.history.replaceState(
          null,
          '',
          window.location.pathname + window.location.search + '#communities',
        );
      } else if (id) setCommunityId(id);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  async function act(
    input: unknown,
    done?: (result: Record<string, unknown>) => void,
  ) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await request<Record<string, unknown>>(
        '/api/sky/social',
        input,
      );
      done?.(result);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存できませんでした。');
    } finally {
      setBusy(false);
    }
  }
  async function previewInvitation() {
    if (busy) return;
    setInviteError('');
    setInvitePreview(null);
    setInvite(null);
    setAcceptedRules(false);
    let candidate: { id: string; token: string };
    try {
      const input = invitationText.trim();
      if (input.startsWith('{')) {
        const v = JSON.parse(input);
        if (v.schema !== 'rockstar-community-invite/1' || typeof v.communityId !== 'string' || typeof v.token !== 'string') throw new Error();
        candidate = { id: v.communityId, token: v.token };
      } else {
        const url = new URL(input, window.location.origin);
        if (url.origin !== window.location.origin) throw new Error();
        const hash = new URLSearchParams(url.hash.slice(1));
        candidate = { id: hash.get('community') || '', token: hash.get('invite') || '' };
      }
      if (!candidate.id || !candidate.token || candidate.token.length > 100) throw new Error();
    } catch {
      setInviteError('招待リンクまたは招待ファイルの内容を確認してください。');
      return;
    }
    setBusy(true);
    try {
      const result = await request<{ community: SkyCommunity }>('/api/sky/social', { action: 'previewInvite', ...candidate });
      setInvite(candidate);
      setInvitePreview(result.community);
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      const hasStatus = Boolean(e && typeof e === 'object' && 'status' in e);
      setInviteError(message === '有効な招待が必要です。'
        ? 'この招待は無効か、すでに失効しています。新しい招待を依頼してください。'
        : hasStatus && message ? message : '通信できませんでした。接続を確認して、もう一度お試しください。');
    } finally {
      setBusy(false);
    }
  }
  const selected = data.communities.find((c) => c.id === communityId);
  const showPosts = !communityPage || Boolean(selected?.unlocked);
  function post(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!postId.current) postId.current = crypto.randomUUID();
    void act(
      {
        action: 'post',
        id: postId.current,
        content: text,
        communityId: data.thread?.community?.id || communityId || null,
        replyTo: data.thread?.id || null,
        attachment:
          attachmentKind === 'none' ? null : { kind: attachmentKind, resource },
      },
      () => {
        setText('');
        setResource('');
        setAttachmentKind('none');
        setAttachmentOpen(false);
        postId.current = '';
        setNotice('投稿しました。');
      },
    );
  }
  function createCommunity(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newCommunityId.current) newCommunityId.current = crypto.randomUUID();
    void act(
      {
        action: 'createCommunity',
        id: newCommunityId.current,
        name,
        description,
        rules,
        visibility: 'members',
      },
      () => {
        newCommunityId.current = '';
        setCommunityForm(false);
        setName('');
        setDescription('');
        setRules('');
        setNotice('コミュニティーを作成しました。下の一覧から開けます。');
      },
    );
  }
  async function add(attachment: SkySocialAttachment) {
    setBusy(true);
    setError('');
    try {
      const existing = hub.plugins.find(
        (p) => p.kind === attachment.kind && p.resource === attachment.resource,
      );
      await hub.save({
        kind: attachment.kind,
        resource: attachment.resource,
        enabled: true,
        revision: existing?.revision ?? 0,
      });
      setNotice('自分のNoahに追加しました。実行と費用の確認はEveへ。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '追加できませんでした。');
    } finally {
      setBusy(false);
    }
  }
  function prepareAttachment(attachment: SkySocialAttachment) {
    if (['model','dataset','space'].includes(attachment.kind)) {
      const plugin = hub.plugins.find(p => p.enabled && p.kind === attachment.kind && p.resource === attachment.resource);
      if (!plugin) { setError('追加済みの出典を確認してください。'); return; }
      void sourceHandoff.prepare(plugin,
        `Skyの投稿で選んだ添付リソース「${plugin.resource}」を使いたい。種類: ${plugin.kind}\n配布元: ${plugin.metadata.sourceUrl}\n確認した配布元の版: ${plugin.metadata.revision ?? '未確認'}\n導入状況・license・実行先・必要費用を確認して、担当の案を作って。投稿本文は引き継いでいません。`);
      return;
    }
    try {
      writeHomeIntent(
        window.sessionStorage,
        `Noahの投稿から追加した「${attachment.resource}」を使いたい。種類: ${attachment.kind}。導入状況・license・実行先・必要費用を確認して使う準備を進めて。`,
      );
      router.push('/chat');
    } catch { setError('Eveへ引き継げませんでした。もう一度お試しください。'); }
  }
  // Existing connection API uses PUT; preserve its authority and entitlement checks.
  async function addAgent(id: string) {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/sky/connections', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: id }),
      });
      const v = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(v.error ?? '追加できませんでした。');
      setNotice(
        '自分のNoahに追加しました。「担当とLLMを設定」からEveへ渡せます。',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '追加できませんでした。');
    } finally {
      setBusy(false);
    }
  }
  const canPage =
    Boolean(data.cursor) && data.posts.length < 200 && !continuous.atLimit;
  const moreAvailable = continuousEnabled
    ? continuous.hasMore || canPage
    : canPage;
  const pageHandler = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    pageHandler.current = async () => {
      if (paging.current) return;
      paging.current = true;
      try {
        if (feedRef.current.enabled && feedRef.current.append()) return;
        if (dataRef.current.cursor && dataRef.current.posts.length < 200)
          await load(dataRef.current.cursor);
      } finally {
        paging.current = false;
      }
    };
  }, [load]);
  const loadMore = useCallback(() => pageHandler.current(), []);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !moreAvailable || ((loading || error) && !continuous.hasMore))
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: '500px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [
    moreAvailable,
    loading,
    error,
    loadMore,
    continuous.items,
    continuous.hasMore,
  ]);
  useEffect(() => {
    if (
      !live ||
      !data.profile ||
      threadId ||
      management ||
      (communityPage && !communityId)
    )
      return;
    let stopped = false,
      failures = 0,
      pollingNow = false,
      timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (stopped || pollingNow) return;
      pollingNow = true;
      if (document.visibilityState === 'visible' && navigator.onLine) {
        try {
          await load('', true);
          failures = 0;
        } catch {
          failures++;
        }
      }
      pollingNow = false;
      if (!stopped)
        timer = setTimeout(() => void poll(), feedPollDelay(failures));
    }
    timer = setTimeout(() => void poll(), feedPollDelay(0));
    const wake = () => {
      clearTimeout(timer);
      void poll();
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
    };
  }, [
    live,
    data.profile,
    threadId,
    management,
    load,
    communityPage,
    communityId,
  ]);
  async function reactTo(
    item: SkySocialPost,
    reaction: 'like' | 'repost' | 'bookmark',
  ) {
    const key = `${item.id}:${reaction}`;
    if (pendingReactionIds.current.has(key)) return;
    pendingReactionIds.current.add(key);
    setPendingReactions((old) => ({ ...old, [key]: true }));
    setError('');
    try {
      const result = await request<{ post: SkySocialPost }>('/api/sky/social', {
        action: 'reaction',
        id: item.id,
        reaction,
        enabled:
          !item[
            reaction === 'like'
              ? 'liked'
              : reaction === 'repost'
                ? 'reposted'
                : 'bookmarked'
          ],
      });
      setData((old) => ({
        ...old,
        posts: old.posts.map((p) => (p.id === item.id ? result.post : p)),
        thread: old.thread?.id === item.id ? result.post : old.thread,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存できませんでした。');
    } finally {
      pendingReactionIds.current.delete(key);
      setPendingReactions((old) => ({ ...old, [key]: false }));
    }
  }
  async function sharePost(item: SkySocialPost) {
    const url = new URL(window.location.href);
    url.searchParams.set('post', item.id);
    url.hash = 'timeline';
    try {
      await navigator.clipboard.writeText(url.toString());
      setNotice(
        '投稿へのリンクをコピーしました。メンバー限定の投稿には専用鍵も必要です。',
      );
    } catch {
      setNotice(`投稿へのリンク：${url.toString()}`);
    }
  }
  function openThread(item: SkySocialPost) {
    setThreadId(item.replyTo || item.id);
    setText('');
    document.getElementById('timeline')?.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  }
  function returnToTimeline(next: 'recommended' | 'following' = 'recommended') {
    setMode(next);
    setCommunityId('');
    setThreadId('');
    setManagement(false);
    setCommunityForm(false);
    setJoinForm(false);
    // Home keeps this timeline mounted between bookmarks and the feed, so
    // navigating back does not discard an unsent input.
    if (typeof window !== 'undefined' && window.location.hash === '#bookmarks') {
      window.location.hash = 'timeline';
    }
  }
  function relativeTime(time: number) {
    const minutes = Math.max(0, Math.floor((clock - time) / 60000));
    return minutes < 1
      ? '今'
      : minutes < 60
        ? `${minutes}分`
        : minutes < 1440
          ? `${Math.floor(minutes / 60)}時間`
          : new Date(time).toLocaleDateString('ja-JP', {
              month: 'short',
              day: 'numeric',
            });
  }
  function renderNews(item: Extract<ContinuousItem, { kind: 'news' }>) {
    const article = item.article;
    return (
      <article
        key={item.key}
        className={`${styles.post} ${styles.newsPost}`}
        data-news-post
        data-feed-key={item.key}
      >
        <div className={styles.postRow}>
          <span className={styles.avatar} aria-hidden="true">
            <Newspaper size={21} />
          </span>
          <div className={styles.postMain}>
            <header className={styles.postHeader}>
              <strong>{article.publisher}</strong>
              <span className={styles.handle}>ニュース</span>
              <span className={styles.dot}>·</span>
              <time
                dateTime={article.seenAt}
                title={`${newsTimestampLabel(article)} ${new Date(article.seenAt).toLocaleString('ja-JP')}`}
              >
                {relativeTime(item.createdAt)}
              </time>
            </header>
            <a
              className={styles.newsHeadline}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              referrerPolicy="no-referrer"
              onClick={() => continuous.remember(article.title)}
            >
              {article.title}
              <ArrowUpRight size={16} />
            </a>
            <div className={styles.newsMeta}>
              媒体の原文 · {newsTimestampLabel(article)}
              {item.stale ? ' · 前回取得分' : ''}
            </div>
            <div className={styles.newsActions}>
              <button
                onClick={() => {
                  continuous.remember(article.title);
                  setNotice(
                    'このニュースに関連する話題を、次の投稿選びに反映します。',
                  );
                }}
              >
                この話題をもっと
              </button>
              <a href={newsSourceHandoff(article, item.stale)}>
                Eveで資料メモを作る
              </a>
              <button
                onClick={() => {
                  writeHomeIntent(
                    window.sessionStorage,
                    `この記事について原文・出典を確認して一緒に考えたい。\n${article.title}\n${article.url}`,
                  );
                  router.push('/chat');
                }}
              >
                Eveと話す <MessageCircle size={15} />
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  }
  function renderPost(post: SkySocialPost, detail = false) {
    const attachmentAdded =
      post.attachment &&
      hub.plugins.some(
        (p) =>
          p.enabled &&
          p.kind === post.attachment!.kind &&
          p.resource === post.attachment!.resource,
      );
    return (
      <article
        className={`${styles.post} ${detail ? styles.detailPost : ''}`}
        data-community-post
        data-timeline-skin="x"
        data-post-id={post.id}
        key={post.id}
      >
        {post.community && (
          <div className={styles.postContext}>
            <Users size={13} />
            <button
              onClick={() => {
                setCommunityId(post.community!.id);
                setThreadId('');
              }}
            >
              {post.community.name}
            </button>
            <Lock size={12} />
          </div>
        )}
        <div className={styles.postRow}>
          <span className={styles.avatar} aria-hidden="true">
            {post.author.name.slice(0, 1)}
          </span>
          <div className={styles.postMain}>
            <header className={styles.postHeader}>
              <div>
                <strong>{post.author.name}</strong>
                <span className={styles.handle}>
                  @sky_{post.author.id.slice(0, 8)}
                </span>
                <span className={styles.dot}>·</span>
                <button
                  className={styles.timestamp}
                  onClick={() => openThread(post)}
                >
                  <time
                    dateTime={new Date(post.createdAt).toISOString()}
                    title={new Date(post.createdAt).toLocaleString('ja-JP')}
                  >
                    {relativeTime(post.createdAt)}
                  </time>
                </button>
              </div>
              <details className={styles.postMenu}>
                <summary aria-label={`${post.author.name}の投稿メニュー`}>
                  <MoreHorizontal size={20} />
                </summary>
                <div>
                  {!post.mine && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void act({
                          action: 'follow',
                          targetId: post.author.id,
                          enabled: !post.following,
                        })
                      }
                    >
                      {post.following ? 'フォローを解除' : 'フォローする'}
                    </button>
                  )}
                  <button onClick={() => void sharePost(post)}>
                    リンクをコピー
                  </button>
                  {(post.mine || selected?.owned) && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm('この投稿と返信を削除しますか？'))
                          void act(
                            { action: 'deletePost', id: post.id },
                            () => {
                              if (detail) setThreadId('');
                            },
                          );
                      }}
                    >
                      投稿を削除
                    </button>
                  )}
                  {selected?.owned && !post.mine && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm('この人の参加を解除しますか？'))
                          void act({
                            action: 'removeMember',
                            id: selected.id,
                            targetId: post.author.id,
                          });
                      }}
                    >
                      参加を解除
                    </button>
                  )}
                </div>
              </details>
            </header>
            {detail ? (
              <p className={styles.postText}>{post.content}</p>
            ) : (
              <button
                type="button"
                className={styles.postText}
                aria-label={`${post.author.name}の投稿を開く`}
                onClick={() => openThread(post)}
              >
                {expanded[post.id] ? post.content : post.content.slice(0, 350)}
                {post.content.length > 350 && !expanded[post.id] && '…'}
              </button>
            )}
            {post.content.length > 350 && !detail && (
              <button
                className={styles.showMore}
                onClick={() =>
                  setExpanded((old) => ({ ...old, [post.id]: !old[post.id] }))
                }
              >
                {expanded[post.id] ? '表示を減らす' : 'さらに表示'}
              </button>
            )}
            {post.attachment && (
              <div className={styles.shared}>
                <small>
                  {post.attachment.kind === 'community-os'
                    ? 'コミュニティーOS'
                    : post.attachment.kind.toUpperCase()}
                </small>
                <strong>
                  {post.attachment.kind === 'community-os'
                    ? `専用鍵で使うOS · v${post.attachment.resource.split(':')[1]}`
                    : post.attachment.resource}
                </strong>
                {post.attachment.kind === 'community-os' ? (
                  <button
                    onClick={() => {
                      setCommunityId(post.attachment!.resource.split(':')[0]);
                      setRequestedOsVersion(
                        Number(post.attachment!.resource.split(':')[1]),
                      );
                      setNotice(
                        'コミュニティーOSの構成を確認し、追加してください。',
                      );
                      document
                        .getElementById('timeline')
                        ?.scrollIntoView({ block: 'start' });
                    }}
                  >
                    このOSを確認して追加
                  </button>
                ) : ['model', 'dataset', 'space', 'agent'].includes(
                    post.attachment.kind,
                  ) ? (
                  attachmentAdded ? (
                    <>
                      <small>自分のNoahに追加済み</small>
                      <button
                        disabled={sourceHandoff.preparing} onClick={() => prepareAttachment(post.attachment!)}
                      >
                        Eveで使う準備 <ArrowUpRight size={15} />
                      </button>
                    </>
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void (post.attachment!.kind === 'agent'
                          ? addAgent(post.attachment!.resource)
                          : add(post.attachment!))
                      }
                    >
                      <Plus size={15} />
                      自分のNoahに追加
                    </button>
                  )
                ) : (
                  <a
                    href={post.attachment.resource}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {post.attachment.kind === 'edition'
                      ? '共有された構成を見る'
                      : '配布元を開く'}{' '}
                    <ArrowUpRight size={15} />
                  </a>
                )}
                {post.attachment.kind === 'edition' && (
                  <small>
                    URLの共有です。OSの導入・更新は個別に適合と権限を確認します。
                  </small>
                )}
              </div>
            )}

            <footer className={styles.actions}>
              <button
                aria-label={`返信 ${post.replies}件`}
                onClick={() => openThread(post)}
              >
                <MessageCircle size={18} />
                <span>{post.replies || ''}</span>
              </button>
              <button
                className={post.reposted ? styles.reposted : undefined}
                aria-label={`リポスト ${post.reposts}件`}
                aria-pressed={post.reposted}
                disabled={pendingReactions[`${post.id}:repost`]}
                onClick={() => void reactTo(post, 'repost')}
              >
                <Repeat2 size={19} />
                <span>{post.reposts || ''}</span>
              </button>
              <button
                className={post.liked ? styles.liked : undefined}
                aria-label={`いいね ${post.likes}件`}
                aria-pressed={post.liked}
                disabled={pendingReactions[`${post.id}:like`]}
                onClick={() => void reactTo(post, 'like')}
              >
                <Heart size={18} fill={post.liked ? 'currentColor' : 'none'} />
                <span>{post.likes || ''}</span>
              </button>
              <button
                aria-label={
                  post.bookmarked ? 'ブックマークを解除' : 'ブックマークに保存'
                }
                aria-pressed={post.bookmarked}
                className={post.bookmarked ? styles.bookmarked : undefined}
                disabled={pendingReactions[`${post.id}:bookmark`]}
                onClick={() => void reactTo(post, 'bookmark')}
              >
                <Bookmark
                  size={18}
                  fill={post.bookmarked ? 'currentColor' : 'none'}
                />
              </button>
              <button
                aria-label="投稿を共有"
                onClick={() => void sharePost(post)}
              >
                <Share2 size={18} />
              </button>
            </footer>
          </div>
        </div>
      </article>
    );
  }
  return (
    <section
      className={styles.shell}
      id={communityPage ? 'communities' : 'timeline'}
      data-community-timeline
      data-full-home={fullHome || undefined}
      data-timeline-skin="x"
      aria-labelledby="sky-social-title"
    >
      {!communityPage && <header className={styles.heading}>
        <h2 id="sky-social-title">ニュースとつながり</h2>
      </header>}
      <div className={styles.timelineTop}>
        {communityPage ? (
          <div className={styles.threadHeading}>
            {!communityDirectory && (
              <button
                aria-label="コミュニティーの一覧に戻る"
                onClick={() => {
                  setCommunityId('');
                  setThreadId('');
                  setLockedCommunity(null);
                  setCommunityForm(false);
                  setJoinForm(false);
                }}
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <strong id="sky-social-title">
              {selected?.name || lockedCommunity?.name || 'コミュニティー'}
            </strong>
          </div>
        ) : threadId ? (
          <div className={styles.threadHeading}>
            <button
              aria-label="タイムラインに戻る"
              onClick={() => {
                setThreadId('');
                setText('');
                postId.current = '';
              }}
            >
              <ArrowLeft size={20} />
            </button>
            <strong>投稿</strong>
          </div>
        ) : (
          <div
            className={styles.topTabs}
            role="tablist"
            aria-label="タイムラインの切替"
          >
            <button
              role="tab"
              aria-selected={mode === 'recommended'}
              onClick={() => returnToTimeline('recommended')}
            >
              {fullHome ? 'あなたへ' : 'おすすめ'}
            </button>
            <button
              role="tab"
              aria-selected={mode === 'following'}
              onClick={() => returnToTimeline('following')}
            >
              {fullHome ? 'つながり' : 'フォロー中'}
            </button>
            {mode === 'bookmarks' && (
              <button role="tab" aria-selected>
                保存済み
              </button>
            )}
          </div>
        )}
        <button
          className={styles.topIcon}
          aria-label={
            communityPage ? 'コミュニティーを更新' : 'タイムラインを更新'
          }
          disabled={loading}
          onClick={() => {
            continuous.restart();
            void load();
          }}
        >
          <RefreshCw
            size={18}
            className={loading ? styles.spinning : undefined}
          />
        </button>
        {!communityPage && (
          <button
            className={`${styles.topIcon} ${styles.menuButton}`}
            aria-label="投稿・保存・コミュニティー"
            aria-expanded={management}
            onClick={() => setManagement((v) => !v)}
          >
            <SlidersHorizontal size={18} />
            <span>メニュー</span>
          </button>
        )}
      </div>
      {mode === 'bookmarks' && !communityPage && !threadId && <button type="button" className={styles.returnToTimeline} onClick={() => returnToTimeline()}><ArrowLeft size={16} />タイムラインに戻る</button>}
      {continuousEnabled && (
        <div className={styles.liveControls}>
          <div className={styles.liveLine}>
            <span
              className={
                live && !continuous.newsError && !liveError
                  ? styles.liveDot
                  : styles.pausedDot
              }
            />
            <span>
              {!live
                ? '自動更新を停止中'
                : continuous.newsError || liveError
                  ? '接続状況を確認'
                  : continuous.newsLoading && !continuous.items.length
                    ? '新着を確認中'
                    : '自動更新中'}
            </span>
            <button aria-pressed={live} onClick={() => setLive((v) => !v)}>
              {live ? '一時停止' : '再開'}
            </button>
          </div>
          <details className={styles.feedPreferences}>
            <summary>話題と表示設定</summary>
            <div className={styles.topicChips} aria-label="読みたい話題">
              {[
                ['all', 'すべて'],
                ['technology', 'テクノロジー'],
                ['world', '世界'],
                ['business', 'ビジネス'],
                ['science', '科学'],
                ['games', 'ゲーム'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={continuous.topic === id}
                  onClick={() => continuous.chooseTopic(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <details className={styles.rankingNote}>
              <summary>この流れについて</summary>
              <p>
                フォロー、保存・いいねした投稿の言葉、この画面で開いたニュースの話題、新しさを使って並べています。5件に1件は違う話題を探し、同じ配信元の連続を抑えます。日本語の話題にも対応します。先頭にいると新着を自動表示し、読み進めている間や入力・文字選択中は通知に留めます。閲覧の話題はこの画面を閉じると消えます。ニュースは公開RSSとGDELTから取得する媒体原文リンクです。RSSの配信日時とGDELTの検出時刻を区別し、内容の正確さを保証する判定には使いません。
              </p>
              {refreshedAt > 0 && (
                <small>
                  投稿の確認 {new Date(refreshedAt).toLocaleTimeString('ja-JP')}
                </small>
              )}
            </details>
          </details>
          {liveError && (
            <output className={styles.feedStatus}>{liveError}</output>
          )}
          {continuous.newsError && (
            <details className={styles.newsConnection}>
              <summary>{continuous.items.length ? 'ニュースの更新を確認できません' : 'ニュースを取得できません'}</summary>
              <p>{continuous.newsError}</p>
              <button disabled={continuous.newsLoading} onClick={continuous.retry}>{continuous.newsLoading?'確認中…':'もう一度取得する'}</button>
              <a href="/#news-plugins">配信元を確認</a>
            </details>
          )}
          {continuous.newsEmpty && (
            <output className={styles.feedStatus}>
              この話題の新着はまだありません。別の話題も見ることができます。
            </output>
          )}
          {continuous.stale && (
            <output className={styles.feedStatus}>
              {continuous.selection === 'headline-keywords'
                ? '接続待ちのため、前回のニュースを見出しの言葉で絞り込んでいます。'
                : 'ニュースは前回取得分を表示しています。'}
            </output>
          )}
          {continuous.newsLoading && !continuous.items.length && (
            <output className={styles.feedStatus}>
              ニュースを受信しています…
            </output>
          )}
        </div>
      )}
      {continuousEnabled && continuous.pending > 0 && (
        <button
          className={styles.newPosts}
          onClick={() => {
            continuous.acceptUpdates();
            document.getElementById('timeline')?.scrollIntoView({
              block: 'start',
              behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
                .matches
                ? 'instant'
                : 'smooth',
            });
          }}
        >
          <Radio size={15} /> 新着 {continuous.pending} 件を見る
        </button>
      )}
      {error && (communityPage ? (
        <div className={styles.error} role="alert">
          <strong>コミュニティーを読み込めませんでした</strong>
          <p>{error}</p>
          <button disabled={loading} onClick={() => void load()}>もう一度読み込む</button>
        </div>
      ) : (
        <details className={styles.error}>
          <summary>コミュニティーの読み込みを確認できません</summary>
          <p>{error}</p><button disabled={loading} onClick={() => void load()}>再読み込み</button>
        </details>
      ))}
      {notice && <output className={styles.notice}>{notice}</output>}
      {communityDirectory && !error && !loading && refreshedAt > 0 && (
        <output className={styles.communityStatus}>
          更新しました · 参加中 {data.communities.length}件 · {new Date(refreshedAt).toLocaleTimeString('ja-JP')}
        </output>
      )}
      {signedOut ? (
        <div className={styles.welcome}>
          <Users size={28} />
          <h3>アカウントから、コミュニティーへ。</h3>
          <p>
            サインインすると、コミュニティーの作成・参加、フォロー、投稿と共有ができます。
          </p>
          <a href="/signin-with-chatgpt?return_to=%2F%23timeline" target="_top">
            サインインする
          </a>
        </div>
      ) : !data.profile && loading ? (
        <output className={styles.loading}>
          <LoaderCircle size={22} className={styles.spinning} />
          読み込み中
        </output>
      ) : !data.profile && error ? null : !data.profile ? (
        <form
          className={styles.welcome}
          onSubmit={(e) => {
            e.preventDefault();
            void act({ action: 'profile', name: publicName });
          }}
        >
          <h3>Noahで使う公開名を決めよう。</h3>
          <p>
            アカウントのメールアドレスは公開しません。ここで設定した名前が投稿に表示されます。
          </p>
          <label>
            公開名
            <input
              required
              maxLength={60}
              value={publicName}
              onChange={(e) => setPublicName(e.target.value)}
            />
          </label>
          <button disabled={busy || loading}>Noahを始める</button>
        </form>
      ) : (
        <>
          <div className={styles.layout}>
            <aside
              className={styles.sidebar}
              data-open={management}
              aria-label="コミュニティー"
              hidden={!management || communityPage}
            >
              <div className={styles.panelHeading}>
                <strong>投稿・保存・コミュニティー</strong>
                <button
                  aria-label="設定を閉じる"
                  onClick={() => setManagement(false)}
                >
                  <X size={20} />
                </button>
              </div>
              <button
                aria-pressed={mode === 'bookmarks'}
                onClick={() => {
                  setMode('bookmarks');
                  setThreadId('');
                  setCommunityId('');
                  setManagement(false);
                }}
              >
                <Bookmark size={20} />
                ブックマーク
              </button>
              <div className={styles.identity}>
                <span className={styles.avatar}>
                  {data.profile.name.slice(0, 1)}
                </span>
                <div>
                  <strong>{data.profile.name}</strong>
                  <small>あなたのNoah</small>
                </div>
              </div>
              <button
                aria-pressed={!communityId && mode !== 'bookmarks'}
                onClick={() => {
                  returnToTimeline();
                }}
              >
                すべての投稿
              </button>
              <div className={styles.sideHeading}>
                <h3>コミュニティー</h3>
                <button
                  aria-label="コミュニティーを作る"
                  onClick={() => {
                    setCommunityForm((v) => !v);
                    setManagement(false);
                  }}
                >
                  <Plus size={18} />
                </button>
              </div>
              {data.communities.map((c) => (
                <button
                  key={c.id}
                  aria-pressed={communityId === c.id}
                  onClick={() => {
                    setThreadId('');
                    setManagement(false);
                    if (c.unlocked) {
                      setLockedCommunity(null);
                      setCommunityId(c.id);
                      setRequestedOsVersion(0);
                    } else {
                      setLockedCommunity(c);
                      setCommunityId('');
                    }
                  }}
                >
                  {<Lock size={15} />}
                  <span>
                    {c.name}
                    <small>
                      {c.unlocked ? `参加中 · ${c.members}人` : '専用鍵が必要'}
                    </small>
                  </span>
                </button>
              ))}
              {!data.communities.length && (
                <p>最初の場所を作って、仲間と共有しよう。</p>
              )}
              <button
                onClick={() => {
                  setCommunityForm((v) => !v);
                  setManagement(false);
                }}
              >
                <Plus size={16} />
                コミュニティーを作る
              </button>
              <button
                onClick={() => {
                  setJoinForm(true);
                  setManagement(false);
                }}
              >
                招待鍵で参加する
              </button>
              <Link href="/#sky-manage">担当とLLMを設定 →</Link>
            </aside>
            <div className={styles.stream}>
              {communityDirectory && !communityForm && !joinForm && (
                <SkyCommunityDirectory
                  communities={data.communities}
                  busy={busy}
                  onSelect={(c) => {
                    setThreadId('');
                    setCommunityForm(false);
                    setJoinForm(false);
                    if (c.unlocked) {
                      setLockedCommunity(null);
                      setCommunityId(c.id);
                      setRequestedOsVersion(0);
                    } else {
                      setLockedCommunity(c);
                      setCommunityId('');
                    }
                  }}
                  onCreate={() => {
                    setCommunityForm(true);
                    setJoinForm(false);
                  }}
                  onJoin={() => {
                    setJoinForm(true);
                    setCommunityForm(false);
                  }}
                />
              )}
              {communityForm && (
                <form
                  className={styles.communityForm}
                  onSubmit={createCommunity}
                >
                  <h3>新しいコミュニティー</h3>
                  <label>
                    名前（必須） · {name.length}/60
                    <input
                      ref={nameInput}
                      required
                      maxLength={60}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label>
                    説明（任意） · {description.length}/300
                    <textarea
                      maxLength={300}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </label>
                  <label>
                    参加ルール（必須） · {rules.length}/500
                    <textarea
                      required
                      maxLength={500}
                      value={rules}
                      onChange={(e) => setRules(e.target.value)}
                      placeholder="例：相手を尊重し、共有前に確認する"
                    />
                  </label>
                  <p>
                    専用鍵を持つメンバーだけが入れます。作成後に自分の鍵をバックアップし、参加者には別の招待鍵を渡してください。
                  </p>
                  <p>会話履歴・認証情報・支払権限は共有されません。</p>
                  <div>
                    <button className={styles.formPrimary} disabled={busy}>作成する</button>
                    <button
                      type="button"
                      onClick={() => setCommunityForm(false)}
                    >
                      閉じる
                    </button>
                  </div>
                </form>
              )}
              {joinForm && <section className={styles.communityForm} aria-labelledby="join-title">
                <h3 id="join-title">コミュニティーに参加</h3>
                <p>招待リンクを貼るか、招待ファイルを選んでください。QRコードは端末のカメラで開くこともできます。個人用鍵や復旧鍵は共有しないでください。</p>
                <label>
                  招待リンク
                  <textarea ref={inviteInput} value={invitationText} maxLength={2000}
                    aria-invalid={Boolean(inviteError)} aria-describedby={inviteError ? 'invitation-error' : undefined}
                    onChange={(e) => { setInvitationText(e.target.value); setInviteError(''); setInvitePreview(null); setInvite(null); }}
                    placeholder="招待リンクまたは招待鍵を貼り付け" />
                </label>
                {inviteError && <p id="invitation-error" role="alert" className={styles.formError}>{inviteError}</p>}
                <label>招待ファイルを選ぶ
                  <input type="file" accept=".json,application/json,text/plain" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 2000) { setInviteError('招待ファイルのサイズを確認してください。'); return; }
                    void file.text().then(value => { setInvitationText(value); setInviteError(''); setInvite(null); setInvitePreview(null); }).catch(() => setInviteError('招待ファイルを読み込めませんでした。'));
                  }} />
                </label>
                <label>QRコードの画像を選ぶ
                  <input type="file" accept="image/*" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const Detector = (window as Window & { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (image: ImageBitmap) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
                    if (!Detector) { setInviteError('このブラウザでは画像からQRコードを読み取れません。端末のカメラで開くか、招待リンクを貼り付けてください。'); return; }
                    if (file.size > 5_000_000) { setInviteError('QRコード画像は5MB以下にしてください。'); return; }
                    void (async () => {
                      const image = await createImageBitmap(file);
                      try {
                        const codes = await new Detector({ formats: ['qr_code'] }).detect(image);
                        if (codes.length !== 1 || !codes[0].rawValue || codes[0].rawValue.length > 2000) throw new Error();
                        setInvitationText(codes[0].rawValue); setInviteError(''); setInvite(null); setInvitePreview(null);
                      } finally { image.close(); }
                    })().catch(() => setInviteError('QRコードを読み取れませんでした。画像を確認するか、招待リンクを貼り付けてください。'));
                  }} />
                </label>
                <div className={styles.formActions}>
                  <button type="button" className={styles.formPrimary} disabled={busy || !invitationText.trim()} onClick={() => void previewInvitation()}>招待を確認する</button>
                  <button type="button" onClick={() => { setJoinForm(false); setInvite(null); setInvitePreview(null); setInviteError(''); }}>閉じる</button>
                </div>
              </section>}
              {lockedCommunity && (
                <CommunityOsWorkbench
                  key={lockedCommunity.id}
                  community={lockedCommunity}
                  onChanged={() => {
                    setLockedCommunity(null);
                    void load();
                  }}
                />
              )}
              {invite && (
                <div className={styles.communityForm}>
                  <h3>コミュニティーへの招待</h3>
                  {!invitePreview ? (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void act(
                          { action: 'previewInvite', ...invite },
                          (result) =>
                            setInvitePreview(result.community as SkyCommunity),
                        )
                      }
                    >
                      場所とルールを確認
                    </button>
                  ) : (
                    <>
                      <strong>{invitePreview.name}</strong>
                      <p>{invitePreview.description}</p>
                      <p className={styles.rules}>{invitePreview.rules}</p>
                      <label className={styles.check}>
                        <input
                          type="checkbox"
                          checked={acceptedRules}
                          onChange={(e) => setAcceptedRules(e.target.checked)}
                        />
                        ルールを確認しました
                      </label>
                      <button
                        disabled={busy || !acceptedRules}
                        onClick={() =>
                          void act(
                            {
                              action: 'join',
                              ...invite,
                              confirmRules: true,
                              rulesVersion: invitePreview.rulesVersion,
                            },
                            () => {
                              setInvite(null);
                              setInvitePreview(null);
                              setInvitationText('');
                              setJoinForm(false);
                              setNotice('参加しました。');
                            },
                          )
                        }
                      >
                        参加する
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      setInvite(null);
                      setInvitePreview(null);
                    }}
                  >
                    閉じる
                  </button>
                </div>
              )}
              {showPosts && (
                <>
                  {selected?.unlocked && (
                    <div className={styles.communityIntro}>
                      <span>
                        {selected.visibility === 'members'
                          ? 'メンバー限定'
                          : '公開コミュニティー'}
                      </span>
                      <h3>{selected.name}</h3>
                      <p>{selected.description}</p>
                      <details>
                        <summary>参加ルール</summary>
                        <p className={styles.rules}>{selected.rules}</p>
                      </details>
                      {selected.owned ? (
                        <div className={styles.ownerActions}>
                          <button
                            disabled={busy}
                            onClick={() =>
                              void act(
                                { action: 'invite', id: selected.id },
                                (result) => {
                                  const v = result.invite as {
                                    id: string;
                                    token: string;
                                  };
                                  const fragment = new URLSearchParams({ community: v.id, invite: v.token });
                                  setInviteUrl(`${window.location.origin}/#${fragment.toString()}`);
                                },
                              )
                            }
                          >
                            招待鍵を発行
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  'コミュニティーを終了し、投稿を削除しますか？',
                                )
                              )
                                void act(
                                  {
                                    action: 'archiveCommunity',
                                    id: selected.id,
                                  },
                                  () => setCommunityId(''),
                                );
                            }}
                          >
                            コミュニティーを終了
                          </button>
                          {inviteUrl && (
                            <label>
                              この招待鍵を渡した人が参加できます。自分のアクセス鍵とは別です。再発行で前の招待は無効になります。
                              <input
                                readOnly
                                value={inviteUrl}
                                onFocus={(e) => e.target.select()}
                              />
                            </label>
                          )}
                        </div>
                      ) : (
                        <button
                          disabled={busy}
                          onClick={() =>
                            void act({ action: 'leave', id: selected.id }, () =>
                              setCommunityId(''),
                            )
                          }
                        >
                          参加を解除
                        </button>
                      )}
                    </div>
                  )}
                  {selected?.unlocked && (
                    <CommunityOsWorkbench
                      key={`${selected.id}:${requestedOsVersion}`}
                      community={selected}
                      initialVersion={requestedOsVersion}
                      onChanged={() => void load()}
                    />
                  )}
                  {data.thread && renderPost(data.thread, true)}
                  {(!selected || selected.member) && (
                    <form className={styles.composer} onSubmit={post}>
                      <span
                        className={styles.composerAvatar}
                        aria-hidden="true"
                      >
                        {data.profile.name.slice(0, 1)}
                      </span>
                      <label className={styles.srOnly} htmlFor="sky-post">
                        {data.thread
                          ? `${data.thread.author.name}に返信`
                          : selected
                            ? `${selected.name}に共有`
                            : 'いまどうしてる？'}
                      </label>
                      <textarea
                        id="sky-post"
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                            e.preventDefault();
                            e.currentTarget.form?.requestSubmit();
                          }
                        }}
                        required
                        maxLength={1000}
                        rows={2}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder={
                          data.thread ? '返信を投稿' : 'いまどうしてる？'
                        }
                      />
                      <div className={styles.attach} hidden={!attachmentOpen}>
                        <label>
                          一緒に共有
                          <select
                            aria-label="共有する種類"
                            value={attachmentKind}
                            onChange={(e) => {
                              setAttachmentKind(
                                e.target.value as typeof attachmentKind,
                              );
                              setResource('');
                            }}
                          >
                            <option value="none">テキストだけ</option>
                            <option value="model">LLM・モデル</option>
                            <option value="dataset">データセット</option>
                            <option value="space">Spaces</option>
                            <option value="agent">Noahの公開Agent・Tool</option>
                            <option value="work">作品のURL</option>
                            <option value="edition">OS構成の共有URL</option>
                            <option value="news">ニュースのURL</option>
                          </select>
                        </label>
                        {attachmentKind !== 'none' &&
                          (attachmentKind === 'agent' ? (
                            <label>
                              公開Tool
                              <select
                                required
                                value={resource}
                                onChange={(e) => setResource(e.target.value)}
                              >
                                <option value="">選ぶ</option>
                                {catalog.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : (
                            <label>
                              {['model', 'dataset', 'space'].includes(
                                attachmentKind,
                              )
                                ? 'Hugging Face ID'
                                : '共有するHTTPS URL'}
                              <input
                                required
                                maxLength={300}
                                value={resource}
                                onChange={(e) => setResource(e.target.value)}
                                placeholder={
                                  ['model', 'dataset', 'space'].includes(
                                    attachmentKind,
                                  )
                                    ? '作者/リポジトリ名'
                                    : 'https://'
                                }
                              />
                            </label>
                          ))}
                      </div>
                      <footer>
                        <div className={styles.composerTools}>
                          <button
                            type="button"
                            aria-label="モデル・Agent・作品を添付"
                            aria-expanded={attachmentOpen}
                            onClick={() => {
                              if (attachmentOpen && !resource.trim())
                                setAttachmentKind('none');
                              setAttachmentOpen(!attachmentOpen);
                            }}
                          >
                            <Link2 size={20} />
                          </button>
                          <small title="Eveの会話は自動共有されません。">
                            {data.thread?.community || selected
                              ? 'メンバーのみ'
                              : 'Noahに公開'}
                          </small>
                        </div>
                        <div className={styles.sendControls}>
                          {text.length > 0 && (
                            <small aria-live="polite">{text.length}/1000</small>
                          )}
                          <button disabled={busy || !text.trim()}>
                            {busy
                              ? '送信中…'
                              : data.thread
                                ? '返信'
                                : 'ポストする'}
                          </button>
                        </div>
                      </footer>
                    </form>
                  )}
                  {loading && (
                    <output className={styles.loading}>
                      <LoaderCircle size={22} className={styles.spinning} />
                      <span className={styles.srOnly}>
                        投稿を読み込んでいます
                      </span>
                    </output>
                  )}
                  {!loading &&
                    !data.posts.length &&
                    !(
                      discovery &&
                      !threadId &&
                      !communityId &&
                      mode === 'recommended'
                    ) && (
                      <div className={styles.empty}>
                        <Users size={26} />
                        <h3>
                          {threadId
                            ? '会話をはじめよう。'
                            : mode === 'bookmarks'
                              ? '気になる投稿を、ここに。'
                              : 'ここから、つながっていこう。'}
                        </h3>
                        <p>
                          {threadId
                            ? '最初の返信を投稿してみよう。'
                            : mode === 'bookmarks'
                              ? '投稿のブックマークを押すと保存できます。'
                              : mode === 'following'
                                ? '人をフォローするか、コミュニティーに参加すると投稿が流れます。'
                                : 'まだ投稿がありません。最初の発見を共有してみよう。'}
                        </p>
                        {!threadId && mode !== 'bookmarks' && (
                          <a href="/os/eve" className={styles.emptyAction}>
                            Eveで仕事を始める ↗
                          </a>
                        )}
                      </div>
                    )}
                  <div
                    role="feed"
                    aria-label={
                      threadId
                        ? '返信'
                        : mode === 'bookmarks'
                          ? '保存した投稿'
                          : communityPage
                            ? `${selected?.name || 'コミュニティー'}の投稿`
                            : 'Noahの投稿'
                    }
                    aria-busy={loading}
                  >
                    {!communityPage &&
                      !threadId &&
                      !communityId &&
                      mode !== 'bookmarks' &&
                      personalFeed}
                    {continuousEnabled
                      ? continuous.items.map((item) =>
                          item.kind === 'post'
                            ? renderPost(item.post)
                            : renderNews(item),
                        )
                      : data.posts
                          .filter(
                            (post) =>
                              !communityPage ||
                              post.community?.id === communityId,
                          )
                          .map((post) => renderPost(post))}
                    {!threadId &&
                      !communityId &&
                      mode !== 'bookmarks' &&
                      externalFeed}
                  </div>
                  <div
                    ref={sentinel}
                    className={styles.sentinel}
                    aria-hidden="true"
                  />
                  {moreAvailable && (
                    <button
                      className={styles.moreButton}
                      disabled={loading}
                      onClick={() => void loadMore()}
                    >
                      続きを見る
                    </button>
                  )}
                  {continuousEnabled && !loading && !moreAvailable && (
                    <div className={styles.feedEnd}>
                      <Radio size={20} />
                      <strong>
                        {continuous.atLimit
                          ? 'ここまでの投稿を読み終えました'
                          : 'いま届いている投稿は、ここまで'}
                      </strong>
                      <p>
                        {live
                          ? '新しい投稿が届くと、上にお知らせします。'
                          : '自動更新は停止中です。いつでも再開できます。'}
                      </p>
                      <button
                        onClick={() => {
                          continuous.restart();
                          void load();
                        }}
                      >
                        新しい流れを読む
                      </button>
                    </div>
                  )}
                  {!threadId &&
                    !communityId &&
                    mode === 'recommended' &&
                    discovery && (
                      <details className={styles.discoveryMore}>
                        <summary>LLM・Agent・機能を見つける</summary>
                        {discovery}
                      </details>
                    )}
                </>
              )}
            </div>
          </div>
        </>
      )}
      {!data.profile && continuousEnabled && (
        <div role="feed" aria-label="公開ニュース">
          {continuous.items.map((item) =>
            item.kind === 'news' ? renderNews(item) : null,
          )}
          <div ref={sentinel} className={styles.sentinel} />
          {continuous.hasMore && (
            <button
              className={styles.moreButton}
              onClick={() => continuous.append()}
            >
              続きを見る
            </button>
          )}
        </div>
      )}
      {!data.profile && !communityPage && externalFeed}
      {!data.profile && !communityPage && discovery}
    </section>
  );
}
