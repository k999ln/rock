'use client';
import { useNoahLocale } from './noah-locale';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Crown,
  Users,
  MessageCircle,
  ArrowUpRight,
  Send,
  Reply,
  X,
} from 'lucide-react';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import type {
  AgentFeedbackSummary,
  AgentFeedbackPage,
  AgentComment,
} from '@/lib/noah-feedback';
import styles from './noah-agent-feedback.module.css';
async function mutation(body: unknown, scope: string | null) {
  const r = await fetch('/api/noah/feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [OWNER_SCOPE_HEADER]: scope ?? '',
    },
    body: JSON.stringify(body),
  });
  const d = (await r.json()) as {
    summary: AgentFeedbackSummary;
    error?: string;
  };
  if (!r.ok)
    throw Object.assign(Error(d.error || '保存できませんでした。'), {
      status: r.status,
    });
  return d as { summary: AgentFeedbackSummary };
}
export function NoahAgentSignals({
  id,
  summary,
  error = '',
  onChange,
  onRetry,
  detailHref,
}: {
  id: string;
  summary?: AgentFeedbackSummary;
  error?: string;
  onChange: (s: AgentFeedbackSummary) => void;
  onRetry: () => void;
  detailHref: string;
}) {
  const {t}=useNoahLocale();

  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [auth, setAuth] = useState(false),
    pending = useRef<{
      id: string;
      enabled: boolean;
      revision: number;
      scope: string | null;
    } | null>(null);
  async function crown() {
    if (!summary || busy) return;
    setBusy(true);
    setNotice('');
    setAuth(false);
    pending.current ??= {
      id: crypto.randomUUID(),
      enabled: !summary.crowned,
      revision: summary.revision,
      scope: summary.ownerScope,
    };
    try {
      const result = await mutation(
        {
          action: 'crown',
          agentId: id,
          id: pending.current.id,
          enabled: pending.current.enabled,
          revision: pending.current.revision,
        },
        pending.current.scope,
      );
      onChange(result.summary);
      pending.current = null;
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : '評価を保存できませんでした。',
      );
      const status = (e as { status?: number }).status;
      setAuth(status === 401);
      if (status === 409) {
        pending.current = null;
        onRetry();
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.signalsWrap}>
      <div className={styles.signals}>
        <span title={t("Noahで実行完了を確認できたアカウント数。同じアカウントは1人として集計。")}>
          <Users size={16} />
          <strong>
            {summary ? summary.users.toLocaleString('ja-JP') : '—'}
          </strong>
          <span>{t("人が利用")}</span>
        </span>
        <button
          aria-label={
            summary?.crowned ? t("王冠の評価を取り消す") : t("王冠で評価する")
          }
          aria-pressed={summary?.crowned ?? false}
          disabled={!summary || busy}
          onClick={() => void crown()}
        >
          <Crown size={18} />
          <strong>
            {summary ? summary.crowns.toLocaleString('ja-JP') : '—'}
          </strong>
          <span>{t("王冠")}</span>
        </button>
        <Link href={detailHref}>
          <MessageCircle size={16} />
          <strong>
            {summary ? summary.comments.toLocaleString('ja-JP') : '—'}
          </strong>
          <span>{t("コメント")}</span>
        </Link>
      </div>
      {error && (
        <p className={styles.notice}>
          {t("評価を取得できませんでした。")}<button onClick={onRetry}>{t("再読み込み")}</button>
        </p>
      )}
      {notice && (
        <output className={styles.notice}>
          {t(notice)}
          {auth && (
            <Link href={`/noah/account?returnTo=${encodeURIComponent(detailHref)}`}>
              {t("本人確認へ")}</Link>
          )}
        </output>
      )}
    </div>
  );
}
export default function NoahAgentFeedback({ id }: { id: string }) {
  const {t}=useNoahLocale();

  const [snapshot, setSnapshot] = useState<{
      id: string;
      data: AgentFeedbackPage;
    } | null>(null),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [text, setText] = useState(''),
    [reply, setReply] = useState<AgentComment | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const pending = useRef<{
      id: string;
      content: string;
      parentId: string | null;
      scope: string | null;
    } | null>(null),
    editor = useRef<HTMLTextAreaElement>(null),
    generation = useRef(0);
  const data = snapshot?.id === id ? snapshot.data : null;
  useEffect(() => {
    const reset = () => {
      generation.current++;
      setSnapshot(null);
      setText('');
      setReply(null);
      setNotice('');
      setBusy(false);
      pending.current = null;
      setAttempt((n) => n + 1);
    };
    const storage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith('rockstar.community.')) reset();
    };
    window.addEventListener('rockstar-community-changed', reset);
    window.addEventListener('storage', storage);
    return () => {
      window.removeEventListener('rockstar-community-changed', reset);
      window.removeEventListener('storage', storage);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController(),
      version = ++generation.current;
    void fetch(`/api/noah/feedback?agent=${encodeURIComponent(id)}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (r) => {
        const d = (await r.json()) as AgentFeedbackPage & { error?: string };
        if (!r.ok) throw Error(d.error || 'コメントを読み込めませんでした。');
        if (!controller.signal.aborted && version === generation.current) {
          setSnapshot({ id, data: d });
          setError('');
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted && version === generation.current)
          setError(e.message);
      });
    return () => controller.abort();
  }, [id, attempt]);
  async function post() {
    if (busy || !text.trim()) return;
    setBusy(true);
    setNotice('');
    const version = generation.current;
    if (
      !pending.current ||
      pending.current.content !== text ||
      pending.current.parentId !== (reply?.parentId ?? reply?.id ?? null)
    )
      pending.current = {
        id: crypto.randomUUID(),
        content: text,
        parentId: reply?.parentId ?? reply?.id ?? null,
        scope: data?.summary.ownerScope ?? null,
      };
    try {
      await mutation(
        {
          action: 'comment',
          agentId: id,
          id: pending.current.id,
          content: pending.current.content,
          parentId: pending.current.parentId,
          publicConsent: true,
        },
        pending.current.scope,
      );
      if (version === generation.current) {
        setText('');
        setReply(null);
        pending.current = null;
        setNotice('コメントを投稿しました。');
        setAttempt((n) => n + 1);
      }
    } catch (e) {
      if (version === generation.current)
        setNotice(e instanceof Error ? e.message : '投稿できませんでした。');
    } finally {
      setBusy(false);
    }
  }
  async function remove(comment: AgentComment) {
    if (!window.confirm('このコメントを削除しますか？')) return;
    setBusy(true);
    const version = generation.current;
    try {
      await mutation(
        { action: 'remove', agentId: id, id: comment.id },
        data?.summary.ownerScope ?? null,
      );
      if (version === generation.current) setAttempt((n) => n + 1);
    } catch (e) {
      if (version === generation.current)
        setNotice(e instanceof Error ? e.message : '削除できませんでした。');
    } finally {
      setBusy(false);
    }
  }
  async function more() {
    if (!data?.cursor || busy) return;
    setBusy(true);
    const version = generation.current;
    try {
      const r = await fetch(
        `/api/noah/feedback?agent=${encodeURIComponent(id)}&cursor=${encodeURIComponent(data.cursor)}`,
        { cache: 'no-store' },
      );
      const d = (await r.json()) as AgentFeedbackPage & { error?: string };
      if (!r.ok) throw Error(d.error || '続きを読み込めませんでした。');
      if (version === generation.current)
        setSnapshot((s) =>
          s?.id === id
            ? {
                id,
                data: {
                  ...d,
                  comments: [
                    ...s.data.comments,
                    ...d.comments.filter(
                      (c) => !s.data.comments.some((old) => old.id === c.id),
                    ),
                  ],
                },
              }
            : s,
        );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '読み込めませんでした。');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      id="feedback"
      className={styles.panel}
      aria-label={t("Agentの評価とコメント")}
    >
      <div className={styles.heading}>
        <span>COMMUNITY VOICES</span>
        <h2>{t("みんなの声")}</h2>
        <p>{data?.agentName ?? "使って感じたことが、次の改善につながる。"}</p>
      </div>
      <NoahAgentSignals
        id={id}
        summary={data?.summary}
        error={t(error)}
        onRetry={() => setAttempt((n) => n + 1)}
        onChange={(summary) =>
          setSnapshot((s) =>
            s?.id === id ? { id, data: { ...s.data, summary } } : s,
          )
        }
        detailHref={`/noah/feedback/${id}#feedback`}
      />
      <p className={styles.caption}>
        {t("利用人数はNoahで実行完了を確認できたアカウント数。王冠は1アカウント1票で、取り消せます。")}</p>
      {!data && !error && <output>{t("コメントを読み込んでいます…")}</output>}
      {data?.canComment ? (
        <form
          className={styles.composer}
          onSubmit={(e) => {
            e.preventDefault();
            void post();
          }}
        >
          {reply && (
            <div className={styles.replying}>
              <span>{reply.author}{t("さんへの返信")}</span>
              <button
                type="button"
                aria-label={t("返信をやめる")}
                disabled={busy}
                onClick={() => setReply(null)}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <label htmlFor={`feedback-${id}`}>
            {t("あなたの感想・改善してほしいこと")}</label>
          <textarea
            ref={editor}
            id={`feedback-${id}`}
            value={text}
            disabled={busy}
            onChange={(e) => setText(e.target.value)}
            required
            maxLength={1000}
            rows={3}
            placeholder={t("何に使った？ よかったところ、惜しかったところを教えて。")}
          />
          <div>
            <small>{t("公開名と本文は誰でも読めます。")}</small>
            <button disabled={busy || !text.trim()}>
              <Send size={15} />
              {busy ? t("送信中…") : t("コメントする")}
            </button>
          </div>
        </form>
      ) : (
        data && (
          <p className={styles.setup}>
            <Link
              href={
                data.authenticated
                  ? '/noah/social#compose'
                  : `/noah/account?returnTo=${encodeURIComponent(`/noah/feedback/${id}#feedback`)}`
              }
            >
              {data.authenticated
                ? t("公開名を設定してコメントする")
                : t("本人確認してコメントする")}{' '}
              <ArrowUpRight size={15} />
            </Link>
          </p>
        )
      )}
      {notice && <output className={styles.notice}>{t(notice)}</output>}
      {data?.comments.length === 0 && (
        <p className={styles.empty}>
          {t("まだコメントはありません。最初の感想を聞かせてください。")}</p>
      )}
      <div>
        {data?.comments.map((c) => (
          <article
            key={c.id}
            id={`comment-${c.id}`}
            className={styles.comment}
            data-reply={!!c.parentId || undefined}
          >
            {c.deleted ? (
              <p className={styles.empty}>{t("このコメントは削除されました。")}</p>
            ) : (
              <>
                <div className={styles.byline}>
                  <strong>{c.author}</strong>
                  <time dateTime={new Date(c.createdAt).toISOString()}>
                    {new Date(c.createdAt).toLocaleDateString('ja-JP')}
                  </time>
                </div>
                {c.parentId && (
                  <blockquote>
                    {c.parentContent ? (
                      <>
                        <strong>{c.parentAuthor}</strong>
                        {c.parentContent}
                      </>
                    ) : (
                      '削除されたコメントへの返信'
                    )}
                  </blockquote>
                )}
                <p className={styles.content}>{c.content}</p>
                <footer>
                  {data.canComment && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        setReply(c);
                        editor.current?.focus();
                      }}
                    >
                      <Reply size={15} />
                      {t("返信")}</button>
                  )}
                  {c.mine && (
                    <button disabled={busy} onClick={() => void remove(c)}>
                      {t("削除")}</button>
                  )}
                </footer>
              </>
            )}
          </article>
        ))}
      </div>
      {data?.cursor && (
        <button
          className={styles.more}
          disabled={busy}
          onClick={() => void more()}
        >
          {t("以前のコメントを見る")}</button>
      )}
      <aside className={styles.developer}>
        <span>FOR DEVELOPERS</span>
        <strong>{t("ユーザーの声を、次のアップデートへ。")}</strong>
        <p>{t("要望の整理から改善・リファクタリング、検証済みPRの納品まで。")}</p>
        <Link href={`/noah/developers?agent=${encodeURIComponent(id)}`}>
          {t("運用パッケージを見る")}<ArrowUpRight size={15} />
        </Link>
      </aside>
    </section>
  );
}
