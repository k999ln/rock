'use client';
/* oxlint-disable next/no-html-link-for-pages -- Sites sign-in is a top-level gateway. */
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Cloud,
  Database,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import { useSkyHub } from '@/lib/use-sky-hub';
import {
  X_TIMELINE_CONSENT,
  xTimelineUrl,
  type SkyHubPlugin,
} from '@/lib/sky-hub';
import type { HfEntry } from '@/lib/sky-huggingface';
import { SkyNotice } from '@/components/sky-feedback';
import { useEveSourceHandoff } from '@/lib/use-eve-source-handoff';
import { skyAgentEvePath, type SkyLibraryAgent } from '@/lib/sky-agent-library';
import styles from './sky-information-market.module.css';

export function SkyNewsConnections() {
  return <SkyInformationMarket onlyNews />;
}
export default function SkyInformationMarket({
  onlyNews = false,
}: { onlyNews?: boolean } = {}) {
  const { plugins, state, save, refresh } = useSkyHub();
  const router = useRouter();
  const [kind, setKind] = useState<'model' | 'dataset' | 'space'>('model'),
    [query, setQuery] = useState(''),
    [entries, setEntries] = useState<HfEntry[]>([]),
    [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'error'>(
      'loading',
    );
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(''),
    [source, setSource] = useState('https://x.com/huggingface'),
    [consent, setConsent] = useState(false);
  const sourceHandoff = useEveSourceHandoff(() => router.push('/chat'), setError);
  const [agents, setAgents] = useState<SkyLibraryAgent[]>([]);
  const [showAll, setShowAll] = useState(false);
  const catalogRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    if (onlyNews) return;
    const c = new AbortController();
    const reload = () => {
      void fetch('/api/sky/agents', { cache: 'no-store', signal: c.signal })
        .then(async (r) =>
          r.ok ? ((await r.json()) as { agents?: SkyLibraryAgent[] }) : null,
        )
        .then((v) => {
          if (!c.signal.aborted && Array.isArray(v?.agents))
            setAgents(v.agents);
        })
        .catch(() => {});
    };
    reload();
    window.addEventListener('sky-agents-changed', reload);
    return () => {
      c.abort();
      window.removeEventListener('sky-agents-changed', reload);
    };
  }, [onlyNews]);
  async function search(
    event?: SyntheticEvent<HTMLFormElement>,
    selected = kind,
  ) {
    event?.preventDefault();
    catalogRequest.current?.abort();
    const request = new AbortController();
    catalogRequest.current = request;
    setCatalogState('loading');
    setEntries([]);
    setShowAll(false);
    setError('');
    try {
      const url = new URLSearchParams({ kind: selected, q: query });
      const response = await fetch(`/api/sky/huggingface?${url}`, {
        cache: 'no-store',
        signal: request.signal,
      });
      const result = (await response.json()) as {
        entries?: HfEntry[];
        error?: string;
      };
      if (!response.ok || !Array.isArray(result.entries))
        throw new Error(result.error || 'カタログを取得できませんでした。');
      if (!request.signal.aborted) {
        setEntries(result.entries);
        setCatalogState('ready');
      }
    } catch (reason) {
      if (!request.signal.aborted) {
        setCatalogState('error');
        setError(
          reason instanceof Error
            ? reason.message
            : 'カタログを取得できませんでした。',
        );
      }
    }
  }
  useEffect(() => {
    if (onlyNews) return;
    const frame = requestAnimationFrame(() => {
      void search(undefined, kind);
    });
    return () => {
      cancelAnimationFrame(frame);
      catalogRequest.current?.abort();
    }; /* Search button submits edits to the query. */ // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, onlyNews]);
  async function change(input: {
    kind: SkyHubPlugin['kind'];
    resource: string;
    enabled: boolean;
    revision: number;
    consentVersion?: string;
  }) {
    setBusy(`${input.kind}:${input.resource}`);
    setError('');
    try {
      await save(input);
      if (input.kind === 'x' && input.enabled) {
        setConsent(false);
        document.getElementById('timeline')?.scrollIntoView({ block: 'start' });
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : '保存できませんでした。',
      );
    } finally {
      setBusy('');
    }
  }
  function askEve(plugin: SkyHubPlugin) {
    void sourceHandoff.prepare(plugin,
      `Skyで追加した「${plugin.resource}」を使いたい。種類: ${plugin.kind}\n配布元: ${plugin.metadata.sourceUrl}\n確認した配布元の版: ${plugin.metadata.revision ?? '未確認'}\n実行先・導入状況・license・必要費用を確認して、担当の案を作って。未導入や未接続なら準備を先に示して。`);
  }
  const added = plugins.filter((p) => p.enabled && p.kind !== 'x');
  return (
    <div className={styles.market}>
      {!onlyNews && (
        <>
          <section
            className={styles.panel}
            id="catalog"
            aria-labelledby="hf-catalog-title"
          >
            <header className={styles.sectionHeading}>
              <div>
                <span>POWERED BY HUGGING FACE</span>
                <h2 id="hf-catalog-title">次のアイデアを、動く力に。</h2>
                <p>世界のモデル・データ・アプリを探して、自分のSkyへ。</p>
              </div>
              <a
                href="https://huggingface.co/"
                target="_blank"
                rel="noopener noreferrer"
              >
                配布元 <ArrowUpRight size={15} />
              </a>
            </header>
            <div className={styles.catalogTools}>
              <nav aria-label="Hugging Faceの種類">
                {(
                  [
                    { id: 'model', name: 'LLM・モデル', Icon: Cloud },
                    { id: 'dataset', name: 'データセット', Icon: Database },
                    { id: 'space', name: 'Spaces・アプリ', Icon: Sparkles },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    aria-pressed={kind === tab.id}
                    onClick={() => setKind(tab.id)}
                  >
                    <tab.Icon size={16} />
                    {tab.name}
                  </button>
                ))}
              </nav>
              <form onSubmit={(e) => void search(e)}>
                <Search size={16} />
                <input
                  aria-label="Hugging Faceを検索"
                  placeholder="モデル名・作者・キーワード"
                  maxLength={80}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <button disabled={catalogState === 'loading'}>検索</button>
              </form>
            </div>
            <p className={styles.note}>
              検索語はHugging
              Faceへ送信します。Skyの検索・追加手数料は0。推論・計算資源などの外部実費と利用条件は別途確認します。
            </p>
            {error && <SkyNotice message={error} className={styles.error} />}
            {catalogState === 'loading' && (
              <output>Hugging Faceの公開カタログを取得しています…</output>
            )}
            <div className={styles.catalog}>
              {entries.slice(0, showAll ? 12 : 6).map((entry) => {
                const plugin = plugins.find(
                  (p) => p.kind === entry.kind && p.resource === entry.resource,
                );
                return (
                  <article
                    className={styles.modelCard}
                    key={`${entry.kind}:${entry.resource}`}
                  >
                    <div className={styles.cardMeta}>
                      <span>HUGGING FACE · {entry.kind.toUpperCase()}</span>
                      {plugin?.enabled && <Check size={16} />}
                    </div>
                    <h3>{entry.resource}</h3>
                    <p>
                      {entry.metadata.task ??
                        (entry.kind === 'space'
                          ? '公開アプリ'
                          : '配布元で詳しい用途を確認')}
                    </p>
                    <div className={styles.tags}>
                      <span>♥ {entry.metadata.likes ?? '—'}</span>
                      <span>↓ {entry.metadata.downloads ?? '—'}</span>
                      {entry.metadata.license && (
                        <span>{entry.metadata.license}</span>
                      )}
                    </div>
                    <p className={styles.note}>
                      追加後に、実行先・権限・利用条件を確認します。
                    </p>
                    <div className={styles.cardActions}>
                      {plugin?.enabled ? (
                        <button disabled={sourceHandoff.preparing} onClick={() => askEve(plugin)}>
                          Eveで使う準備 <ArrowRight size={15} />
                        </button>
                      ) : (
                        <button
                          disabled={state !== 'ready' || Boolean(busy)}
                          onClick={() =>
                            void change({
                              kind: entry.kind,
                              resource: entry.resource,
                              revision: plugin?.revision ?? 0,
                              enabled: true,
                            })
                          }
                        >
                          <Plus size={15} />
                          追加する
                        </button>
                      )}
                      <a
                        href={entry.metadata.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        詳細 <ArrowUpRight size={14} />
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
            {entries.length > 6 && (
              <button onClick={() => setShowAll((v) => !v)}>
                {showAll ? '少なく表示' : 'さらに表示'}
              </button>
            )}
            {catalogState === 'ready' && !entries.length && (
              <p>一致する公開項目がありません。検索語を変えてください。</p>
            )}
          </section>
          <section
            className={styles.panel}
            id="your-agents"
            aria-labelledby="your-agents-title"
          >
            <header className={styles.sectionHeading}>
              <div>
                <span>YOUR ADDED CAPABILITIES</span>
                <h2 id="your-agents-title">追加した力を、仕事へ。</h2>
              </div>
              <Link href="/sky/agents">
                担当とLLMを設定 <ArrowRight size={15} />
              </Link>
            </header>
            <div className={styles.added}>
              {agents.map((a) => (
                <article key={a.id}>
                  <strong>{a.name}</strong>
                  <span>{a.model}</span>
                  {a.enabled ? (
                    <Link href={skyAgentEvePath(a)}>
                      Eveに依頼 <ArrowRight size={14} />
                    </Link>
                  ) : (
                    <span>利用停止中</span>
                  )}
                </article>
              ))}
              {added.map((p) => (
                <article key={p.key}>
                  <strong>{p.resource}</strong>
                  <span>配布元の版を保存 · 実行準備は別確認</span>
                  <button disabled={sourceHandoff.preparing} onClick={() => askEve(p)}>
                    Eveで使う準備 <ArrowRight size={14} />
                  </button>
                  <button
                    disabled={Boolean(busy)}
                    onClick={() =>
                      void change({
                        kind: p.kind,
                        resource: p.resource,
                        revision: p.revision,
                        enabled: false,
                      })
                    }
                  >
                    追加から外す
                  </button>
                </article>
              ))}
              {!agents.length && !added.length && (
                <p>
                  上のカタログから追加できます。仕事の依頼・進捗・成果はEveへ。
                </p>
              )}
            </div>
          </section>
        </>
      )}
      <section
        className={styles.panel}
        id="news-plugins"
        aria-labelledby="news-plugins-title"
      >
        <header className={styles.sectionHeading}>
          <div>
            <span>PLUG IN YOUR SOURCES</span>
            <h2 id="news-plugins-title">いつもの配信元を、つなごう。</h2>
            <p>
              Xの公開アカウントやリストを保存できます。APIが有効な配信元はHomeで本人操作により取得します。XのFor Youそのものは未接続です。
            </p>
          </div>
        </header>
        {error && <SkyNotice message={error} className={styles.error} />}
        <form
          className={styles.sourceForm}
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const resource = xTimelineUrl(source);
              const current = plugins.find(
                (p) => p.kind === 'x' && p.resource === resource,
              );
              void change({
                kind: 'x',
                resource,
                enabled: true,
                revision: current?.revision ?? 0,
                consentVersion: X_TIMELINE_CONSENT,
              });
            } catch (reason) {
              setError(
                reason instanceof Error
                  ? reason.message
                  : 'URLを確認してください。',
              );
            }
          }}
        >
          <label>
            Xの公開アカウント・リストURL
            <input
              type="url"
              required
              value={source}
              maxLength={250}
              onChange={(e) => setSource(e.target.value)}
              placeholder="https://x.com/huggingface"
            />
          </label>
          <label className={styles.consent}>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            Xへ接続し、
            <a
              href="https://developer.x.com/en/developer-terms/agreement-and-policy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Xの開発者規約・ポリシー
            </a>
            が適用されることを確認しました。
          </label>
          <p className={styles.note}>
            公開投稿APIの設定と配信元の承認後、Homeで「投稿を取得」を押した時だけXへ通信します。SkyがXのパスワードを受け取ることはありません。
          </p>
          <button
            className={styles.primary}
            disabled={!consent || state !== 'ready' || Boolean(busy)}
          >
            <Plus size={16} />
            配信元を追加
          </button>
        </form>
        {plugins
          .filter((p) => p.kind === 'x')
          .map((p) => (
            <div className={styles.sourceRow} key={p.key}>
              <strong>{p.metadata.title}</strong>
              <span>
                {p.enabled
                  ? '配信元を保存済み・HomeでAPI接続状態を確認'
                  : '表示停止中'}
              </span>
              {p.enabled ? (
                <button
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void change({
                      kind: 'x',
                      resource: p.resource,
                      revision: p.revision,
                      enabled: false,
                    })
                  }
                >
                  表示を止める
                </button>
              ) : (
                <span>再追加は上のURLと確認から行えます。</span>
              )}
            </div>
          ))}
        {state === 'signed-out' && (
          <a href="/signin-with-chatgpt?return_to=%2F" target="_top">
            サインインして追加する
          </a>
        )}
        {state === 'error' && (
          <button onClick={() => void refresh()}>追加状態を再読み込み</button>
        )}
      </section>
    </div>
  );
}
