'use client';
import { noahOperationLabel } from '@/lib/noah-operation-labels';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import NoahResultContent from './noah-result-content';
import NoahManagedFiles from './noah-managed-files';
import NoahWorkUsageReceiptPanel from './noah-work-usage-receipt';
import { useNoahLocale } from './noah-locale';
import NoahLoading from './noah-loading';
import { noahAskRowView, type NoahAskItem } from '@/lib/noah-ask-view';
import { noahWorkStages, noahWorkState } from '@/lib/noah-work-view';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import styles from './noah-unified.module.css';
export default function NoahTaskDetail({ id }: { id: string }) {
  const { t, locale } = useNoahLocale();
  const [ask, setAsk] = useState<NoahAskItem | null>(null),
    [error, setError] = useState(''),
    [scope, setScope] = useState<string | null>(null),
    [attempt, setAttempt] = useState(0),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(() => Date.now());
  const generation = useRef(0);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    const epoch = ++generation.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const read = async () => {
      if (document.hidden) {
        timer = setTimeout(() => void read(), 3000);
        return;
      }
      try {
        const response = await fetch(
          `/api/noah/ask/${encodeURIComponent(id)}`,
          { cache: 'no-store', signal: controller.signal },
        );
        const data = (await response.json()) as NoahAskItem & {
          ownerScope?: string;
        };
        if (epoch !== generation.current) return;
        if (
          !response.ok ||
          data.id !== id ||
          typeof data.ownerScope !== 'string'
        )
          throw Error('仕事を読み込めませんでした。');
        setNow(Date.now());
        setAsk(data);
        setScope(data.ownerScope ?? null);
        setError('');
        timer = setTimeout(
          () => void read(),
          data.finishedAt === undefined ? 3000 : 15000,
        );
      } catch {
        if (!controller.signal.aborted && epoch === generation.current) {
          setAsk(null);
          setScope(null);
          setError('仕事を読み込めませんでした。');
        }
      }
    };
    void read();
    const returned = () => {
      if (!document.hidden) {
        setAsk(null);
        setScope(null);
        setBusy(false);
        setAttempt((n) => n + 1);
      }
    };
    window.addEventListener('focus', returned);
    document.addEventListener('visibilitychange', returned);
    return () => {
      invalidate();
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener('focus', returned);
      document.removeEventListener('visibilitychange', returned);
    };
  }, [id, attempt, invalidate]);
  // One long response keeps the provider stream alive. Do not cancel it on a
  // focus refresh; the common status API remains the source of displayed state.
  const receiving = useRef<string | null>(null);
  useEffect(() => {
    if (
      ask?.mode !== 'provider' ||
      ask.finishedAt !== undefined ||
      !scope ||
      receiving.current === id
    )
      return;
    receiving.current = id;
    void fetch(`/api/noah/provider?work=${encodeURIComponent(id)}`, {
      cache: 'no-store',
    })
      .then(async (response) => {
        const reader = response.body?.getReader();
        if (reader) {
          try {
            while (!(await reader.read()).done) {
              /* consume keep-alives */
            }
          } finally {
            reader.releaseLock();
          }
        }
      })
      .catch(() => undefined)
      .finally(() => {
        setTimeout(() => {
          receiving.current = null;
          setAttempt((n) => n + 1);
        }, 3000);
      });
  }, [ask, id, scope]);
  async function stop() {
    if (!ask || !scope || busy) return;
    setBusy(true);
    const epoch = generation.current;
    try {
      const response = await fetch(`/api/noah/ask/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [OWNER_SCOPE_HEADER]: scope,
        },
        body: JSON.stringify({ action: 'stop', revision: ask.revision }),
      });
      if (epoch !== generation.current) return;
      if (!response.ok && response.status !== 409) throw Error();
      setBusy(false);
      setAttempt((n) => n + 1);
    } catch {
      if (epoch === generation.current)
        setError('通信できませんでした。もう一度試してください。');
    } finally {
      if (epoch === generation.current) setBusy(false);
    }
  }
  const result = ask?.state === 'succeeded';
  return (
    <main className={styles.page}>
      <Link
        className={styles.back}
        href={result ? '/noah/data' : '/noah/activity'}
      >
        <ArrowLeft size={17} />
        {t('戻る')}
      </Link>
      <header className={styles.heading}>
        <h1>{t(result ? '成果の詳細' : '仕事の詳細')}</h1>
      </header>
      {error && (
        <div role="alert" className={styles.error}>
          {t(error)}{' '}
          <button
            className={styles.secondary}
            onClick={() => setAttempt((n) => n + 1)}
          >
            {t('読み直す')}
          </button>
        </div>
      )}
      {!ask && !error && <NoahLoading />}
      {ask && (
        <>
          {!result && <h2>{t(noahOperationLabel(ask.tool))}</h2>}
          <p className={styles.meta}>{ask.host}</p>
          <output className={styles.state}>{t(noahWorkState(ask))}</output>
          {!result && (
            <ol className={styles.track}>
              {noahWorkStages(ask).map((stage) => (
                <li key={stage.label} data-state={stage.state}>
                  {t(stage.label)}
                </li>
              ))}
            </ol>
          )}
          {ask.mode === 'provider' && ask.finishedAt === undefined && (
            <p className={styles.meta}>
              {t('成果が届くまで、この画面を開いたままにしてください。')}
            </p>
          )}
          {ask.mode === 'cloud' && ask.finishedAt === undefined && <p className={styles.meta}>{t('画面を閉じてもクラウドで処理が続きます。')}</p>}
          {ask.error && (
            <p role="alert" className={styles.error}>
              {ask.error}
            </p>
          )}
          {result && ask.result && (
            <NoahResultContent key={ask.id} result={ask.result} id={ask.id} savedAttachments={ask.cloudFiles?.length ?? 0} />
          )}
          {result && !!ask.cloudFiles?.length && <NoahManagedFiles files={ask.cloudFiles} />}
          <NoahWorkUsageReceiptPanel receipt={ask.usageReceipt} id={ask.workId || ask.id} requestId={ask.id} host={ask.host} />
          {noahAskRowView(ask, now).stoppable && (
            <button
              className={styles.secondary}
              disabled={busy || !scope}
              onClick={() => void stop()}
            >
              {t('停止')}
            </button>
          )}
          <details className={styles.meta}>
            <summary>{t('履歴')}</summary>
            <p>
              {ask.tool} · {ask.host}
            </p>
            <p>
              {t('受付')} · {new Date(ask.createdAt).toLocaleString(locale)}
            </p>
            <p>
              {t('更新')} · {new Date(ask.updatedAt).toLocaleString(locale)}
            </p>
          </details>
          {ask.agentId && (
            <Link
              className={styles.back}
              href={`${['provider', 'cloud'].includes(ask.mode) ? '/noah/discover/agent' : '/noah/ready/agent'}?id=${encodeURIComponent(ask.agentId)}`}
            >
              {t('この Agent を開く')}
            </Link>
          )}
        </>
      )}
    </main>
  );
}
