'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Share2 } from 'lucide-react';
import { useNoahLocale } from './noah-locale';
import NoahLoading from './noah-loading';
import {
  noahAskRowView,
  noahLinkParts,
  type NoahAskItem,
} from '@/lib/noah-ask-view';
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
    [notice, setNotice] = useState(''),
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
        const [response, owner] = await Promise.all([
          fetch(`/api/noah/ask/${encodeURIComponent(id)}`, {
            cache: 'no-store',
            signal: controller.signal,
          }),
          fetch('/api/noah/ask', {
            cache: 'no-store',
            signal: controller.signal,
          }),
        ]);
        const [data, list] = await Promise.all([
          response.json() as Promise<NoahAskItem>,
          owner.json() as Promise<{
            ownerScope?: string;
            asks?: NoahAskItem[];
          }>,
        ]);
        if (epoch !== generation.current) return;
        if (
          !response.ok ||
          !owner.ok ||
          data.id !== id ||
          typeof list.ownerScope !== 'string' ||
          !list.asks?.some((item) => item.id === data.id)
        )
          throw Error('仕事を読み込めませんでした。');
        setNow(Date.now());
        setAsk(data);
        setScope(list.ownerScope ?? null);
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
  function save() {
    if (!ask?.result) return;
    const url = URL.createObjectURL(
      new Blob([ask.result.text], { type: 'text/plain;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `noah-${ask.id}.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('保存を開始しました');
  }
  async function share() {
    if (!ask?.result) return;
    try {
      if (navigator.share)
        await navigator.share({
          title: ask.tool ?? 'Noah',
          text: ask.result.text,
        });
      else {
        await navigator.clipboard.writeText(ask.result.text);
        setNotice('コピーしました');
      }
    } catch (e) {
      if (!(e instanceof Error && e.name === 'AbortError'))
        setError('通信できませんでした。もう一度試してください。');
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
          <h2>{ask.tool || t('仕事')}</h2>
          <p className={styles.meta}>{ask.host}</p>
          <output className={styles.state}>{t(noahWorkState(ask))}</output>
          <ol className={styles.track}>
            {noahWorkStages(ask).map((stage) => (
              <li key={stage.label} data-state={stage.state}>
                {t(stage.label)}
              </li>
            ))}
          </ol>
          {ask.error && (
            <p role="alert" className={styles.error}>
              {ask.error}
            </p>
          )}
          {result && ask.result && (
            <>
              <pre className={styles.resultBody} dir="auto">
                {noahLinkParts(ask.result.text).map((part, i) =>
                  'href' in part ? (
                    <a
                      key={i}
                      href={part.href}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                    >
                      {part.href}
                    </a>
                  ) : (
                    <span key={i}>{part.text}</span>
                  ),
                )}
              </pre>
              {ask.result.truncated && <p>{t('成果の一部を表示しています')}</p>}
              <div className={styles.actions}>
                <button className={styles.primary} onClick={save}>
                  <Download size={18} />
                  {t('保存')}
                </button>
                <button
                  className={styles.secondary}
                  onClick={() => void share()}
                >
                  <Share2 size={18} />
                  {t('共有')}
                </button>
              </div>
            </>
          )}
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
              {t('受付')} · {new Date(ask.createdAt).toLocaleString(locale)}
            </p>
            <p>
              {t('更新')} · {new Date(ask.updatedAt).toLocaleString(locale)}
            </p>
          </details>
          {ask.agentId && (
            <Link
              className={styles.back}
              href={`/noah/ready/agent?id=${encodeURIComponent(ask.agentId)}`}
            >
              {t('この Agent を開く')}
            </Link>
          )}
        </>
      )}
      {notice && <output>{t(notice)}</output>}
    </main>
  );
}
