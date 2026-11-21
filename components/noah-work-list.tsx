'use client';
/* oxlint-disable react/react-compiler -- Synchronize owner-scoped asynchronous API state and clear it when the owner changes. */
import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, Copy, Download } from 'lucide-react';
import { noahResultOutline } from '@/lib/noah-form';
import {
  noahRemoteFetch,
  type NoahRemoteAskView,
} from '@/lib/noah-remote-client';
import styles from './noah-ready.module.css';
export default function NoahWorkList({
  connectionId,
  ownerScope,
  refresh,
}: {
  connectionId?: string;
  ownerScope: string;
  refresh: number;
}) {
  const [items, setItems] = useState<NoahRemoteAskView[]>([]),
    [results, setResults] = useState<
      Record<string, NonNullable<NoahRemoteAskView['result']>>
    >({}),
    [error, setError] = useState(''),
    [busy, setBusy] = useState<string | null>(null),
    [reload, setReload] = useState(0);
  const cached = useRef<
    Record<string, NonNullable<NoahRemoteAskView['result']>>
  >({});
  useEffect(() => {
    cached.current = {};
    setResults({});
    setItems([]);
  }, [ownerScope, connectionId]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined,
      reading = false;
    async function read() {
      if (document.hidden || reading) return;
      reading = true;
      try {
        const data = await noahRemoteFetch<{ items: NoahRemoteAskView[] }>(
          '/api/noah/ask' +
            (connectionId
              ? '?connection=' + encodeURIComponent(connectionId)
              : ''),
          { signal: controller.signal, ownerScope },
        );
        if (controller.signal.aborted) return;
        setItems(data.items);
        setError('');
        for (const item of data.items.filter(
          (i) => i.state === 'succeeded' && !cached.current[i.id],
        )) {
          const full = await noahRemoteFetch<NoahRemoteAskView>(
            '/api/noah/ask/' + item.id,
            { signal: controller.signal, ownerScope },
          );
          if (full.result) {
            cached.current = { ...cached.current, [item.id]: full.result };
            setResults(cached.current);
          }
        }
        if (data.items.some((i) => ['queued', 'running'].includes(i.state)))
          timer = setTimeout(
            () => void read(),
            data.items.some(
              (i) =>
                ['queued', 'running'].includes(i.state) &&
                Date.now() - i.createdAt < 30000,
            )
              ? 1000
              : 3000,
          );
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : '仕事を読み込めませんでした。',
          );
      } finally {
        reading = false;
      }
    }
    const visible = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        void read();
      }
    };
    void read();
    document.addEventListener('visibilitychange', visible);
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [connectionId, ownerScope, refresh, reload]);
  async function stop(item: NoahRemoteAskView) {
    setBusy(item.id);
    setError('');
    try {
      await noahRemoteFetch('/api/noah/ask/' + item.id, {
        ownerScope,
        body: { action: 'stop', revision: item.revision },
      });
      setReload((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : '停止を確認できませんでした。');
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className={styles.workList} aria-label="仕事と成果">
      <h2 className={styles.sectionTitle}>仕事と成果</h2>
      {error && (
        <div role="alert" className={styles.notice}>
          {error}
          <button onClick={() => setReload((v) => v + 1)}>再読み込み</button>
        </div>
      )}
      {!items.length && !error && (
        <p className={styles.muted}>受け取った成果はここに残ります。</p>
      )}
      {items.map((item) => {
        const active = ['queued', 'running'].includes(item.state),
          result = results[item.id];
        return (
          <article key={item.id} className={styles.work}>
            <div className={styles.workStatus}>
              {active ? (
                <LoaderCircle size={17} className={styles.spinner} />
              ) : item.state === 'succeeded' ? (
                <Check size={17} />
              ) : null}
              <strong>
                {item.stopRequested && active
                  ? '停止を確認しています…'
                  : item.state === 'queued'
                    ? '順番を待っています'
                    : item.state === 'running'
                      ? '進んでいます'
                      : item.state === 'succeeded'
                        ? '結果を受け取りました'
                        : item.state === 'stopped'
                          ? '止めました'
                          : item.state === 'unknown'
                            ? '結果を確認できませんでした'
                            : 'できませんでした'}
              </strong>
              {active && (
                <button
                  disabled={item.stopRequested || busy === item.id}
                  onClick={() => void stop(item)}
                >
                  止める
                </button>
              )}
            </div>
            <p className={styles.muted}>
              {item.state === 'succeeded'
                ? `${item.host} の ${item.tool} が返した内容です。費用 0。`
                : `${item.tool} · ${item.host}`}
            </p>
            {item.error && <p className={styles.error}>{item.error}</p>}
            {result && <ResultView result={result} id={item.id} />}
          </article>
        );
      })}
    </section>
  );
}
export function ResultView({
  result,
  id,
}: {
  result: NonNullable<NoahRemoteAskView['result']>;
  id: string;
}) {
  const [copied, setCopied] = useState(false),
    [copyError, setCopyError] = useState(''),
    outline = noahResultOutline(result.text);
  async function copy() {
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
    } catch {
      setCopyError(
        'コピーできませんでした。本文を選択してコピーしてください。',
      );
    }
  }
  function save() {
    const url = URL.createObjectURL(
      new Blob([result.text], { type: 'text/plain;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'noah-' + id + '.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className={styles.result}>
      <div className={styles.preview}>
        {result.text.split('\n').slice(0, 3).join('\n')}
      </div>
      <details>
        <summary>全文を開く</summary>
        {outline ? (
          <>
            <dl className={styles.outline}>
              {outline.map((row, i) => (
                <div
                  key={i}
                  style={{ paddingInlineStart: Math.min(row.depth, 4) * 12 }}
                >
                  <dt>{row.label}</dt>
                  <dd>{row.text}</dd>
                </div>
              ))}
            </dl>
            <details>
              <summary>元の形で見る</summary>
              <pre>{result.text}</pre>
            </details>
          </>
        ) : (
          <p className={styles.resultText}>
            {result.text.split(/(https:\/\/[^\s<>"']+)/g).map((part, i) => {
              if (!part.startsWith('https://')) return part;
              try {
                const url = new URL(part);
                if (url.username || url.password) return part;
                return (
                  <a
                    key={i}
                    href={url.href}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  >
                    {part}（{url.host}）
                  </a>
                );
              } catch {
                return part;
              }
            })}
          </p>
        )}
      </details>
      <div className={styles.resultActions}>
        <button onClick={() => void copy()}>
          <Copy size={15} />
          {copied ? 'コピーしました' : 'コピー'}
        </button>
        <button onClick={save}>
          <Download size={15} />
          保存
        </button>
      </div>
      {copyError && <output>{copyError}</output>}
    </div>
  );
}
