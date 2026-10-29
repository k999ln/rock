'use client';
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
import CommunityOsWorkbench from './community-os-workbench';
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
async function request<T>(path: string, input?: unknown): Promise<T> {
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
  return communityFetch<T>(path, body);
}
export default function SkySocialTimeline({
  fullHome = false,
  initialView = 'home',
  discovery,
  externalFeed,
}: {
  fullHome?: boolean;
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
    const tick = () => setClock(Date.now());
    tick();
    const timer = window.setInterval(tick, 60000);
    return () => window.clearInterval(timer);
  }, []);
  const [joinForm, setJoinForm] = useState(false);
  const [threadId, setThreadId] = useState(''),
    [management, setManagement] = useState(initialView === 'communities'),
    [attachmentOpen, setAttachmentOpen] = useState(false),
    [expanded, setExpanded] = useState<Record<string, boolean>>({}),
    [pendingReactions, setPendingReactions] = useState<Record<string, boolean>>(
      {},
    );
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
  const postId = useRef(''),
    newCommunityId = useRef(''),
    sequence = useRef(0);
  const hub = useSkyHub();
  const router = useRouter();
  const sourceHandoff = useEveSourceHandoff(() => router.push('/chat'), setError);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const load = useCallback(
    async (cursor = '') => {
      const seq = ++sequence.current;
      setLoading(true);
      try {
        let value = await request<SkySocialState>(
          `/api/sky/social?${new URLSearchParams({ mode, community: communityId, cursor, thread: threadId })}`,
        );
        if (seq !== sequence.current) return;
        if (value.profile && setCommunityKeyProfile(value.profile.id))
          value = await request<SkySocialState>(
            `/api/sky/social?${new URLSearchParams({ mode, community: communityId, cursor, thread: threadId })}`,
          );
        if (seq !== sequence.current) return;
        setData((old) =>
          cursor
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
      } catch (e) {
        if (seq !== sequence.current) return;
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
        if (seq === sequence.current) setLoading(false);
      }
    },
    [mode, communityId, threadId],
  );
  const cancelLoad = useCallback(() => {
    sequence.current++;
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
        setInvite({ id, token });
        window.history.replaceState(
          null,
          '',
          window.location.pathname + window.location.search + '#timeline',
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
  const selected = data.communities.find((c) => c.id === communityId);
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
      setNotice('自分のSkyに追加しました。実行と費用の確認はEveへ。');
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
      writeHomeIntent(window.sessionStorage, `Skyで追加した担当「${attachment.resource}」を使いたい。設定と実行先・権限・必要費用を確認して。`);
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
        '自分のSkyに追加しました。「担当とLLMを設定」からEveへ渡せます。',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '追加できませんでした。');
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !data.cursor || loading || error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !paging.current) {
          paging.current = true;
          void load(data.cursor!).finally(() => {
            paging.current = false;
          });
        }
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [data.cursor, loading, error, load]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void load();
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [load]);
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
                      <small>自分のSkyに追加済み</small>
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
                      自分のSkyに追加
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
      id="timeline"
      data-community-timeline
      data-full-home={fullHome || undefined}
      data-timeline-skin="x"
      aria-labelledby="sky-social-title"
    >
      <header className={styles.heading}>
        <h2 id="sky-social-title">Sky タイムライン</h2>
      </header>
      <div className={styles.timelineTop}>
        {threadId ? (
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
              onClick={() => {
                setMode('recommended');
                setThreadId('');
              }}
            >
              {fullHome ? 'あなたへ' : 'おすすめ'}
            </button>
            <button
              role="tab"
              aria-selected={mode === 'following'}
              onClick={() => {
                setMode('following');
                setThreadId('');
              }}
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
          aria-label="タイムラインを更新"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw
            size={18}
            className={loading ? styles.spinning : undefined}
          />
        </button>
        <button
          className={styles.topIcon}
          aria-label="タイムラインの設定とコミュニティー"
          aria-expanded={management}
          onClick={() => setManagement((v) => !v)}
        >
          <SlidersHorizontal size={18} />
        </button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
          <button onClick={() => void load()}>再読み込み</button>
        </p>
      )}
      {notice && <output className={styles.notice}>{notice}</output>}
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
      ) : !data.profile ? (
        <form
          className={styles.welcome}
          onSubmit={(e) => {
            e.preventDefault();
            void act({ action: 'profile', name: publicName });
          }}
        >
          <h3>Skyで使う公開名を決めよう。</h3>
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
          <button disabled={busy || loading}>Skyを始める</button>
        </form>
      ) : (
        <>
          <div className={styles.layout}>
            <aside
              className={styles.sidebar}
              data-open={management}
              aria-label="コミュニティー"
              hidden={!management}
            >
              <div className={styles.panelHeading}>
                <strong>タイムラインの設定</strong>
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
                  <small>あなたのSky</small>
                </div>
              </div>
              <button
                aria-pressed={!communityId}
                onClick={() => {
                  setCommunityId('');
                  setThreadId('');
                  setManagement(false);
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
              <Link href="/sky/agents">担当とLLMを設定 →</Link>
            </aside>
            <div className={styles.stream}>
              {communityForm && (
                <form
                  className={styles.communityForm}
                  onSubmit={createCommunity}
                >
                  <h3>新しいコミュニティー</h3>
                  <label>
                    名前
                    <input
                      required
                      maxLength={60}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label>
                    どんな場所？
                    <textarea
                      maxLength={300}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </label>
                  <label>
                    参加ルール
                    <textarea
                      required
                      maxLength={500}
                      value={rules}
                      onChange={(e) => setRules(e.target.value)}
                      placeholder="この場所で大切にすること"
                    />
                  </label>
                  <p>
                    専用鍵を持つメンバーだけが入れます。作成後に自分の鍵をバックアップし、参加者には別の招待鍵を渡してください。
                  </p>
                  <p>会話履歴・認証情報・支払権限は共有されません。</p>
                  <div>
                    <button disabled={busy}>作成する</button>
                    <button
                      type="button"
                      onClick={() => setCommunityForm(false)}
                    >
                      閉じる
                    </button>
                  </div>
                </form>
              )}
              <details
                className={styles.communityForm}
                hidden={!joinForm}
                open={joinForm}
                onToggle={(e) => setJoinForm(e.currentTarget.open)}
              >
                <summary>招待鍵で参加する</summary>
                <label>
                  受け取った招待鍵
                  <textarea
                    value={invitationText}
                    maxLength={2000}
                    onChange={(e) => setInvitationText(e.target.value)}
                    placeholder="管理者から受け取った招待鍵のJSON"
                  />
                </label>
                <button
                  disabled={busy || !invitationText.trim()}
                  onClick={() => {
                    try {
                      const v = JSON.parse(invitationText);
                      if (
                        v.schema !== 'rockstar-community-invite/1' ||
                        typeof v.communityId !== 'string' ||
                        typeof v.token !== 'string'
                      )
                        throw new Error();
                      setInvite({ id: v.communityId, token: v.token });
                      setInvitePreview(null);
                      setAcceptedRules(false);
                      setInvitationText('');
                    } catch {
                      setError('招待鍵のJSONを確認してください。');
                    }
                  }}
                >
                  招待を確認する
                </button>
              </details>
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
                              setInviteUrl(
                                JSON.stringify({
                                  schema: 'rockstar-community-invite/1',
                                  communityId: v.id,
                                  token: v.token,
                                }),
                              );
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
                              { action: 'archiveCommunity', id: selected.id },
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
                  <span className={styles.composerAvatar} aria-hidden="true">
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
                        <option value="agent">Skyの公開Agent・Tool</option>
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
                          : 'Skyに公開'}
                      </small>
                    </div>
                    <div className={styles.sendControls}>
                      {text.length > 0 && (
                        <small aria-live="polite">{text.length}/1000</small>
                      )}
                      <button disabled={busy || !text.trim()}>
                        {busy ? '送信中…' : data.thread ? '返信' : 'ポストする'}
                      </button>
                    </div>
                  </footer>
                </form>
              )}
              {loading && (
                <output className={styles.loading}>
                  <LoaderCircle size={22} className={styles.spinning} />
                  <span className={styles.srOnly}>投稿を読み込んでいます</span>
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
                  </div>
                )}
              <div
                role="feed"
                aria-label={
                  threadId
                    ? '返信'
                    : mode === 'bookmarks'
                      ? '保存した投稿'
                      : 'Skyの投稿'
                }
                aria-busy={loading}
              >
                {data.posts.slice(0, 2).map((post) => renderPost(post))}
                {!threadId &&
                  !communityId &&
                  mode !== 'bookmarks' &&
                  externalFeed}
                {!threadId &&
                  !communityId &&
                  mode === 'recommended' &&
                  discovery}
                {data.posts.slice(2).map((post) => renderPost(post))}
              </div>
              <div
                ref={sentinel}
                className={styles.sentinel}
                aria-hidden="true"
              />
              {data.cursor && (
                <button
                  disabled={loading}
                  onClick={() => void load(data.cursor!)}
                >
                  さらに読む
                </button>
              )}
            </div>
          </div>
        </>
      )}
      {!data.profile && externalFeed}
      {!data.profile && discovery}
    </section>
  );
}
