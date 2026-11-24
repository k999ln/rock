'use client';
import {noahOperationLabel} from '@/lib/noah-operation-labels';
/**
 * 頼んだ仕事の一覧（新しい順）と、成果。
 * - Agent の詳細の画面では、その Agent への依頼（GET /api/noah/ask?agent=。切った接続の分も含む）。
 *   「実行中」「成果データ」の画面では、本人の依頼を Agent をまたいで（GET /api/noah/ask）。行から、その Agent の詳細へ戻れる。
 * - 終わっていない依頼がある間だけ、読み直す（1 秒ごと。30 秒を越えたら 3 秒ごと。画面が裏の間は読まない）。
 * - 成果の文は、終わった依頼ごとに 1 回だけ、GET /api/noah/ask/[id] で読む（一覧の読み直しで、本文を毎回読まない）。
 * - 「止める」は、止める事を頼むだけ。止まった確認（状態が変わる）が返るまで、「止めました」とは出さない。
 * - 成果は、文字として出す（HTML として解釈しない。改行は保つ）。全体が JSON なら、項目ごとの行にして出し、元の形でも見られる。
 *   `https://` で始まる所だけを、行き先の host を横に書いたリンクにする（新しい tab）。
 * 全画面を覆う進行表示と、閉じるまで操作できない dialog は、使わない。
 * 仕様: docs/noah/spec-87-tool-agent.md の 11.5。
 */
import { useEffect, useRef, useState } from 'react';
import NoahLoading from './noah-loading';
import Link from 'next/link';
import {
  NOAH_ASK_TEXT,
  noahAskRowView,
  type NoahAskItem,
} from '@/lib/noah-ask-view';
import { useNoahLocale } from './noah-locale';
import {
  noahWorkAgentHref,
  noahWorkGroups,
  noahWorkHref,
  noahWorkState,
} from '@/lib/noah-work-view';
import { ChevronRight, FileText, RefreshCw } from 'lucide-react';
import ui from './noah-unified.module.css';
import { NoahResultPreview } from './noah-result-content';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import styles from './noah-ready.module.css';

type Result = NonNullable<NoahAskItem['result']> & { note?: string };
const FAST_MS = 1000,
  SLOW_MS = 3000,
  SLOW_AFTER_MS = 30_000;

export default function NoahWorkList({
  agentId,
  ownerScope,
  refresh,
  only,
  heading,
  showEmpty = false,
}: {
  /**
   * 系列の ID。その Agent への依頼を、切った接続の分も含めて出す（切っても、受け取った成果は、ここに残る）。
   * 無い時は、本人の依頼を、Agent をまたいで出す（「実行中」「成果データ」の画面）。
   */
  agentId?: string;
  /** 「止める」に添える本人の印。null の時は、一覧の応答が返した印を使う（Agent をまたぐ一覧。並んだ行と同じ本人の印）。 */
  ownerScope: string | null;
  /** 新しく頼むたびに変わる値（すぐ読み直す）。 */
  refresh: number;
  /** 'succeeded' の時は、成果が出た依頼だけを出す（「成果データ」の画面）。 */
  only?: 'succeeded';
  /** 見出し。既定は「仕事」。 */
  heading?: string;
  /** Standalone pages show loading, sign-in, failure and empty states instead of a blank page. */
  showEmpty?: boolean;
}) {
  const { t, locale } = useNoahLocale();
  const [asks, setAsks] = useState<NoahAskItem[]>([]),
    [results, setResults] = useState<Record<string, Result>>({});
  const [now, setNow] = useState(() => Date.now()),
    [error, setError] = useState('');
  const pending = asks.some((ask) => ask.finishedAt === undefined);
  const [listScope, setListScope] = useState<string | null>(null);
  const [listState, setListState] = useState<
      'loading' | 'ready' | 'signed-out' | 'error'
    >('loading'),
    [attempt, setAttempt] = useState(0);
  const generation = useRef(0),
    seenScope = useRef<string | null>(null);
  const wanted = useRef(new Set<string>()),
    since = useRef<number | null>(null);
  const listUrl = agentId
    ? `/api/noah/ask?${new URLSearchParams({ agent: agentId }).toString()}`
    : '/api/noah/ask';

  // 一覧を読む。終わっていない依頼がある間だけ、続けて読む。
  useEffect(() => {
    generation.current++;
    wanted.current.clear();
    let stopped = false,
      timer: ReturnType<typeof setTimeout> | null = null;
    const read = async () => {
      // 画面が裏の間は、読まない（戻った時に、次の回で読む）。
      if (typeof document !== 'undefined' && document.hidden) return true;
      try {
        const response = await fetch(listUrl, { cache: 'no-store' });
        const body = (await response.json()) as {
          asks?: NoahAskItem[];
          ownerScope?: string | null;
        };
        if (stopped) return false;
        if (
          response.status !== 200 ||
          !Array.isArray(body.asks) ||
          (ownerScope && body.ownerScope !== ownerScope)
        ) {
          setAsks([]);
          setResults({});
          setListScope(null);
          seenScope.current = null;
          wanted.current.clear();
          setListState(response.status === 401 ? 'signed-out' : 'error');
          generation.current++;
          return false;
        }
        const nextScope =
          typeof body.ownerScope === 'string' ? body.ownerScope : null;
        if (nextScope !== seenScope.current) {
          generation.current++;
          setResults({});
          wanted.current.clear();
          seenScope.current = nextScope;
        }
        setListState('ready');
        setNow(Date.now());
        setAsks(body.asks);
        setListScope(
          typeof body.ownerScope === 'string' ? body.ownerScope : null,
        );
        return body.asks.some((ask) => ask.finishedAt === undefined);
      } catch {
        if (!stopped) {
          setListState('error');
          setAsks([]);
          setResults({});
          setListScope(null);
          seenScope.current = null;
          wanted.current.clear();
          generation.current++;
        }
        return false;
      }
    };
    const loop = async () => {
      const more = await read();
      if (stopped || !more) {
        since.current = null;
        return;
      }
      since.current ??= Date.now();
      timer = setTimeout(
        () => {
          void loop();
        },
        Date.now() - since.current > SLOW_AFTER_MS ? SLOW_MS : FAST_MS,
      );
    };
    void loop();
    return () => {
      stopped = true;
      // oxlint-disable-next-line react-hooks/exhaustive-deps -- This ref is a request generation, not a DOM node; cleanup invalidates outstanding reads.
      generation.current++;
      if (timer) clearTimeout(timer);
    };
    // 読み直すのは、頼んだ時・つないだ時・切った時（refresh が変わる）。
  }, [listUrl, refresh, ownerScope, attempt]);

  // 成果が出た依頼は、その文を 1 回だけ読む。
  useEffect(() => {
    const epoch = generation.current;
    for (const ask of asks) {
      if (ask.state !== 'succeeded' || (only === 'succeeded' && ask.mode === 'revenue') || wanted.current.has(ask.id)) continue;
      wanted.current.add(ask.id);
      void fetch(`/api/noah/ask/${ask.id}`, { cache: 'no-store' })
        .then(async (response) => {
          const body = (await response.json()) as NoahAskItem;
          if (generation.current !== epoch) return;
          if (response.status === 200 && body.result)
            setResults((old) => ({
              ...old,
              [ask.id]: {
                ...body.result!,
                ...(body.note ? { note: body.note } : {}),
              },
            }));
          else wanted.current.delete(ask.id);
        })
        .catch(() => {
          if (generation.current === epoch) wanted.current.delete(ask.id);
        });
    }
  }, [asks, only]);

  async function stop(ask: NoahAskItem) {
    setError('');
    const epoch = generation.current;
    const scope = ownerScope ?? listScope;
    try {
      const response = await fetch(`/api/noah/ask/${ask.id}`, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          ...(scope ? { [OWNER_SCOPE_HEADER]: scope } : {}),
        },
        body: JSON.stringify({ action: 'stop', revision: ask.revision }),
      });
      const body = (await response.json()) as NoahAskItem & {
        ask?: NoahAskItem;
        error?: string;
      };
      if (generation.current !== epoch) return;
      // 応答の今の状態を、その行へ映す（版が古かった時・もう終わっていた時は、添えられた今の行）。
      const next = response.status === 200 ? body : body.ask;
      if (next?.id)
        setAsks((old) =>
          old.map((item) =>
            item.id === next.id ? { ...item, ...next } : item,
          ),
        );
      if (response.status !== 200 && response.status !== 409)
        setError(body.error ?? NOAH_ASK_TEXT.offline);
    } catch {
      if (generation.current === epoch) setError(NOAH_ASK_TEXT.offline);
    }
    // Re-read through the same owner-checked loop, including after stopping the last job.
    if (generation.current === epoch) setAttempt((n) => n + 1);
  }

  const changedOwner = Boolean(
    ownerScope && listScope && ownerScope !== listScope,
  );
  const shown = changedOwner
    ? []
    : only === 'succeeded'
      ? asks.filter((ask) => ask.state === 'succeeded')
      : asks;
  if (shown.length === 0) {
    if (!showEmpty) return null;
    const retry = () => {
      setListState('loading');
      setAttempt((n) => n + 1);
    };
    return (
      <section className={styles.section} aria-live="polite">
        {changedOwner || listState === 'loading' ? (
          <NoahLoading label={t('読み込んでいます…')} />
        ) : listState === 'signed-out' ? (
          <>
            <p>{t('接続を確認すると、あなたの仕事と成果が開きます。')}</p>
            <Link
              className={styles.primary}
              href={`/noah/account?returnTo=${encodeURIComponent(only === 'succeeded' ? '/noah/data' : '/noah/activity')}`}
            >
              {t('接続を確認して続ける')}
            </Link>
            <p>
              <Link href="/noah/explore">{t('Agentを見てみる')}</Link>
            </p>
          </>
        ) : listState === 'error' ? (
          <div role="alert">
            <p>{t('仕事を読み込めませんでした。')}</p>
            <button className={styles.secondary} onClick={retry}>
              {t('読み直す')}
            </button>
          </div>
        ) : (
          <>
            <p>
              {only === 'succeeded'
                ? t('成果はまだ届いていません。')
                : t('まだ仕事を頼んでいません。')}
            </p>
            <Link
              className={styles.primary}
              href={only === 'succeeded' ? '/noah/activity' : '/noah/explore'}
            >
              {only === 'succeeded' ? t('実行中を見る') : t('Agentを探す')}
            </Link>
          </>
        )}
      </section>
    );
  }
  if (!showEmpty)
    return (
      <section className={styles.section} aria-labelledby="noah-work-list">
        <h2 id="noah-work-list">
          {t(heading ?? NOAH_ASK_TEXT.work)}
          {pending ? <small>{t('進んでいます')}</small> : null}
        </h2>
        {error && (
          <p className={styles.reason} role="alert">
            {t(error)}
          </p>
        )}
        <ul className={styles.work}>
          {shown.map((ask) => {
            const view = noahAskRowView(ask, now),
              result = results[ask.id];
            return (
              <li key={ask.id} id={`noah-work-${ask.id}`} tabIndex={-1}>
                <div className={styles.workHead}>
                  <p className={styles.workState}>
                    {ask.finishedAt === undefined ? (
                      <output>
                        {locale === 'ja' ? view.text : t(noahWorkState(ask))}
                      </output>
                    ) : locale === 'ja' && ask.mode !== 'revenue' ? (
                      view.text
                    ) : (
                      t(noahWorkState(ask))
                    )}
                  </p>
                  {view.stoppable && (
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => void stop(ask)}
                    >
                      {t(NOAH_ASK_TEXT.stop)}
                    </button>
                  )}
                </div>
                <p className={styles.workTool}>
                  <strong>{t(noahOperationLabel(ask.tool))}</strong>
                </p>
                {result?.note&&<details><summary>{t('提供者の説明')}</summary>{result.note}</details>}
                {result && (
                  <>
                    <NoahResultPreview result={result} />
                    <Link
                      className={styles.secondary}
                      href={noahWorkHref(ask.id)}
                    >
                      {t('詳細を開く')} →
                    </Link>
                  </>
                )}
                {!agentId && ask.agentId && (
                  <p className={styles.workAgent}>
                    <Link
                      href={noahWorkAgentHref(ask.mode, ask.agentId)}
                    >
                      {t(ask.mode === 'revenue' ? 'この組み合わせを開く' : NOAH_ASK_TEXT.agent)} →
                    </Link>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    );
  if (only === 'succeeded')
    return (
      <section aria-label={t('成果')}>
        <ul className={ui.resultGrid}>
          {shown.map((ask) => (
            <li className={ui.resultCard} key={ask.id}>
              <Link href={noahWorkHref(ask.id)}>
                {ask.mode === 'revenue' ? (
                  <time dateTime={new Date(ask.createdAt).toISOString()}>{new Date(ask.createdAt).toLocaleString(locale)}</time>
                ) : results[ask.id] ? (
                  <NoahResultPreview result={results[ask.id]} />
                ) : (
                  <NoahLoading compact />
                )}
                <h2>{ask.mode === 'revenue' ? ask.tool : new Date(ask.createdAt).toLocaleDateString(locale)}</h2>
                <small>
                  <FileText size={13} /> {ask.mode === 'revenue' ? t(noahWorkState(ask)) : ask.host}
                </small>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  return (
    <section className={ui.groups} aria-label={t(heading ?? '仕事')}>
      {error && <p role="alert">{t(error)}</p>}
      {noahWorkGroups(shown).map((group) => (
        <section key={group.label}>
          <h2 className={ui.groupTitle}>
            {group.label === '作業中' && <RefreshCw size={18} />}{' '}
            {t(group.label)}{' '}
            <span className={ui.count}>{group.items.length}</span>
          </h2>
          <ul className={ui.taskList}>
            {group.items.map((ask) => (
              <li
                key={ask.id}
                id={`noah-work-${ask.id}`}
                className={ui.task}
                data-attention={group.label === '確認待ち'}
              >
                <Link href={noahWorkHref(ask.id)}>
                  <div className={ui.taskHead}>
                    <FileText size={25} />
                    <div>
                      <strong>{t(noahOperationLabel(ask.tool))}</strong>
                      <small>{ask.host}</small>
                    </div>
                    <ChevronRight size={18} />
                  </div>
                  <div className={ui.state}>{t(noahWorkState(ask))}</div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
