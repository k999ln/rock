'use client';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  Check,
  Plus,
  Search,
  Sparkles,
  Cloud,
  Newspaper,
  LoaderCircle,
} from 'lucide-react';
import { catalog, type Automation } from '@/lib/catalog';
import { skyToolDescription, skyToolEnvironment } from '@/lib/sky-tool-ui';
import { skyOptionalFeatures } from '@/lib/sky-feature-additions';
import type { HfEntry } from '@/lib/sky-huggingface';
import { useSkyHub } from '@/lib/use-sky-hub';
import { useEveSourceHandoff } from '@/lib/use-eve-source-handoff';
import { queueSkyZemaHandoff } from '@/lib/sky-zema-handoff';
import type { SkyConnection } from '@/lib/operations';
import SkyOptionalFeatures from './sky-optional-features';
import { SkyNotice } from './sky-feedback';
import styles from './sky-discovery-feed.module.css';

type Filter = 'all' | 'model' | 'agent' | 'features' | 'dataset' | 'space';
const suggestions = ['mr-citations', 'mr-free-article', 'rockstar-csv-cleanup'];
const labels: { id: Filter; label: string }[] = [
  { id: 'all', label: 'すべて' },
  { id: 'agent', label: 'Agent・Tool' },
  { id: 'model', label: 'LLM・モデル' },
  { id: 'features', label: 'OSの機能' },
  { id: 'dataset', label: 'データ' },
  { id: 'space', label: 'アプリ' },
];
/** Native discovery rows. Catalog metadata is not represented as an authored social post. */
export default function SkyDiscoveryFeed({
  standalone = false,
  query = '',
  initialFilter = 'all',
}: {
  standalone?: boolean;
  query?: string;
  initialFilter?: Filter;
}) {
  const router = useRouter();
  const hub = useSkyHub();
  const [filter, setFilter] = useState<Filter>(initialFilter),
    [draft, setDraft] = useState(query),
    [search, setSearch] = useState(query);
  const [entries, setEntries] = useState<HfEntry[]>([]),
    [connections, setConnections] = useState<SkyConnection[]>([]);
  const [loading, setLoading] = useState(true),
    [catalogError, setCatalogError] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(''),
    [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0),
    [connectionsReady, setConnectionsReady] = useState(false),
    [connectionError, setConnectionError] = useState('');
  const sourceHandoff = useEveSourceHandoff(() => router.push('/chat'), setError);
  const pending = useRef(false);
  useEffect(() => {
    const c = new AbortController();
    void fetch('/api/sky/connections', { cache: 'no-store', signal: c.signal })
      .then(async (r) => {
        const v = (await r.json()) as SkyConnection[] & { error?: string };
        if (!r.ok || !Array.isArray(v))
          throw new Error(v.error || '接続状態を読み込めませんでした。');
        if (!c.signal.aborted) {
          setConnections(v);
          setConnectionsReady(true);
          setConnectionError('');
        }
      })
      .catch((e) => {
        if (!c.signal.aborted)
          setConnectionError(
            e instanceof Error ? e.message : '接続を確認してください。',
          );
      });
    return () => c.abort();
  }, [retry]);
  useEffect(() => {
    if (filter === 'agent' || filter === 'features') return;
    const c = new AbortController();
    const frame = requestAnimationFrame(() => {
      setLoading(true);
      setCatalogError('');
      setEntries([]);
      const kind =
        filter === 'dataset' || filter === 'space' ? filter : 'model';
      void fetch(
        `/api/sky/huggingface?${new URLSearchParams({ kind, q: search })}`,
        { cache: 'no-store', signal: c.signal },
      )
        .then(async (r) => {
          const v = (await r.json()) as { entries?: HfEntry[]; error?: string };
          if (!r.ok || !Array.isArray(v.entries))
            throw new Error(v.error || '公開カタログを読み込めませんでした。');
          if (!c.signal.aborted) setEntries(v.entries);
        })
        .catch((e) => {
          if (!c.signal.aborted)
            setCatalogError(
              e instanceof Error ? e.message : '配布元を確認してください。',
            );
        })
        .finally(() => {
          if (!c.signal.aborted) setLoading(false);
        });
    });
    return () => {
      c.abort();
      cancelAnimationFrame(frame);
    };
  }, [filter, search, retry]);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(''), 6000);
    return () => window.clearTimeout(t);
  }, [notice]);
  async function addModel(entry: HfEntry) {
    if (pending.current) return;
    pending.current = true;
    setBusy(entry.resource);
    setError('');
    try {
      const old = hub.plugins.find(
        (p) => p.kind === entry.kind && p.resource === entry.resource,
      );
      await hub.save({
        kind: entry.kind,
        resource: entry.resource,
        enabled: true,
        revision: old?.revision ?? 0,
      });
      setNotice('自分のSkyに保存しました。Eveで実行先と使い方を確認できます。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '追加できませんでした。');
    } finally {
      pending.current = false;
      setBusy('');
    }
  }
  async function addTool(tool: Automation) {
    if (pending.current) return;
    pending.current = true;
    setBusy(tool.id);
    setError('');
    try {
      const r = await fetch('/api/sky/connections', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: tool.id }),
      });
      const v = (await r.json()) as SkyConnection & { error?: string };
      if (!r.ok || v.tool !== tool.id)
        throw new Error(v.error || '追加できませんでした。');
      setConnections((old) => [...old.filter((c) => c.tool !== v.tool), v]);
      setNotice(
        '自分のSkyに追加しました。担当とLLMの設定、Eveへの依頼へ進めます。',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '追加できませんでした。');
    } finally {
      pending.current = false;
      setBusy('');
    }
  }
  function prepareModel(entry: HfEntry) {
    const plugin = hub.plugins.find(p => p.enabled && p.kind === entry.kind && p.resource === entry.resource);
    if (!plugin) { setError('自分のSkyへ追加してから選んでください。'); return; }
    void sourceHandoff.prepare(plugin,
      `Skyで追加した「${plugin.resource}」を使いたい。種類: ${plugin.kind}\n配布元: ${plugin.metadata.sourceUrl}\n確認した配布元の版: ${plugin.metadata.revision ?? '未確認'}\nlicense・導入状況・実行先・必要費用を確認して、担当の案を作って。`);
  }
  function prepareTool(tool: Automation) {
    try {
      const handoff = queueSkyZemaHandoff(
        tool.id,
        `「${tool.name}」を使いたい。目的と入力、実行先、権限、費用を確認して進めて。`,
      );
      router.push(
        `/chat?tool=${encodeURIComponent(tool.id)}&thread=${encodeURIComponent(handoff.id)}`,
      );
    } catch {
      setError('Eveへ引き継げませんでした。もう一度お試しください。');
    }
  }
  const tools = catalog
    .filter(
      (t) =>
        (standalone || suggestions.includes(t.id)) &&
        (!search ||
          `${t.name} ${t.description} ${t.category}`
            .toLowerCase()
            .includes(search.toLowerCase())),
    )
    .slice(0, standalone ? catalog.length : 3);
  const showFeature = (id: 'wallet' | 'market') =>
    (filter === 'all' || filter === 'features') &&
    skyOptionalFeatures.some(
      (f) =>
        f.id === id &&
        `${f.name} ${f.description} ${f.purposes.map((p) => p.label).join(' ')}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
  const catalogLoading = filter !== 'agent' && filter !== 'features' && loading;
  const hasResults =
    ((filter === 'all' || filter === 'agent') && tools.length > 0) ||
    (filter !== 'agent' && filter !== 'features' && entries.length > 0) ||
    showFeature('wallet') ||
    showFeature('market');
  function renderTool(tool: Automation) {
    const added = connections.some((c) => c.tool === tool.id);
    return (
      <article
        key={tool.id}
        className={styles.post}
        data-discovery-post="agent"
        data-timeline-skin="x"
      >
        <span className={styles.avatar}>
          <Sparkles size={21} />
        </span>
        <div className={styles.byline}>
          <strong>Sky カタログ</strong>
          <span>· Agent / Tool</span>
        </div>
        <h3>{tool.name}</h3>
        <p>{skyToolDescription(tool)}</p>
        <div className={styles.metadata}>
          <span>
            {tool.status === 'ready'
              ? '実行器あり'
              : tool.status === 'candidate'
                ? '導入候補'
                : '準備中'}
          </span>
          <span>{tool.license}</span>
          <span>{skyToolEnvironment(tool)}</span>
        </div>
        <details className={styles.details}>
          <summary>料金・利用条件を見る</summary>
          <p>{tool.cost}</p>
          <p>{tool.environment}</p>
          <p>{tool.note}</p>
        </details>
        <div className={styles.actions}>
          {added ? (
            <>
              <span className={styles.added}>
                <Check size={14} />
                追加済み
              </span>
              <Link href="/sky/agents">担当とLLMを設定</Link>
              <button onClick={() => prepareTool(tool)}>
                Eveに依頼 <ArrowUpRight size={15} />
              </button>
            </>
          ) : (
            <button
              disabled={!!busy || !connectionsReady}
              onClick={() => void addTool(tool)}
            >
              <Plus size={15} />
              自分のSkyに追加
            </button>
          )}
        </div>
      </article>
    );
  }
  function renderModel(entry: HfEntry) {
    const added = hub.plugins.some(
      (p) =>
        p.kind === entry.kind && p.resource === entry.resource && p.enabled,
    );
    return (
      <article
        key={`${entry.kind}:${entry.resource}`}
        className={styles.post}
        data-discovery-post={entry.kind}
        data-timeline-skin="x"
      >
        <span className={styles.avatar}>
          <Cloud size={21} />
        </span>
        <div className={styles.byline}>
          <strong>Hugging Face</strong>
          <span>· 公開カタログ</span>
        </div>
        <h3>{entry.resource}</h3>
        <p>
          {entry.metadata.task ||
            (entry.kind === 'space'
              ? '公開アプリを自分のSkyへ。'
              : entry.kind === 'dataset'
                ? 'データセットを自分のSkyへ。'
                : '自分の制作に合うモデルを、Skyから。')}
        </p>
        <div className={styles.metadata}>
          <span>{entry.metadata.license || 'license要確認'}</span>
          {entry.metadata.gated && <span>配布元の利用申請が必要</span>}
          {entry.metadata.downloads !== null && (
            <span>配布元DL {entry.metadata.downloads.toLocaleString()}</span>
          )}
        </div>
        <p className={styles.note}>
          検索・追加のSky手数料0。実行先・利用条件・外部実費は別途確認します。
        </p>
        <div className={styles.actions}>
          {added ? (
            <>
              <span className={styles.added}>
                <Check size={14} />
                追加済み
              </span>
              <button disabled={sourceHandoff.preparing} onClick={() => prepareModel(entry)}>
                Eveで使う準備 <ArrowUpRight size={15} />
              </button>
            </>
          ) : (
            <button
              disabled={!!busy || hub.state !== 'ready'}
              onClick={() => void addModel(entry)}
            >
              <Plus size={15} />
              {busy === entry.resource ? '追加しています…' : '自分のSkyに追加'}
            </button>
          )}
          <a
            href={entry.metadata.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            配布元 <ArrowUpRight size={14} />
          </a>
        </div>
      </article>
    );
  }
  function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setSearch(draft.trim());
  }
  return (
    <section
      className={styles.feed}
      data-native-discovery
      aria-label={standalone ? 'Skyを見つける' : 'おすすめの能力と機能'}
    >
      {standalone && (
        <>
          <header className={styles.heading}>
            <h1>見つける</h1>
            <Link href="/#timeline">ホームへ</Link>
          </header>
          <form className={styles.search} onSubmit={submit}>
            <Search size={19} />
            <input
              id="sky-discovery-search"
              aria-label="モデル・Agent・Toolを検索"
              placeholder="モデル・Agent・Toolを検索"
              maxLength={80}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button>検索</button>
          </form>
          <nav className={styles.filters} aria-label="投稿の種類">
            {labels.map((tab) => (
              <button
                key={tab.id}
                aria-pressed={filter === tab.id}
                onClick={() => setFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </>
      )}
      {error && <SkyNotice className={styles.error} message={error} />}
      {notice && <output className={styles.notice}>{notice}</output>}
      {(filter === 'all' || filter === 'agent') && (
        <>
          {tools.slice(0, 1).map(renderTool)}
          {filter === 'agent' && tools.slice(1).map(renderTool)}
          {connectionError && (
            <p className={styles.note}>
              {connectionError}{' '}
              <button onClick={() => setRetry((v) => v + 1)}>
                接続状態を再確認
              </button>
            </p>
          )}
        </>
      )}
      {showFeature('wallet') && <SkyOptionalFeatures timeline only="wallet" />}
      {(filter === 'all' ||
        filter === 'model' ||
        filter === 'dataset' ||
        filter === 'space') && (
        <>
          {loading ? (
            <output className={styles.loading}>
              <LoaderCircle size={20} />
              公開カタログを確認しています…
            </output>
          ) : catalogError ? (
            <p className={styles.error}>
              {catalogError}{' '}
              <button onClick={() => setRetry((v) => v + 1)}>再読み込み</button>
            </p>
          ) : (
            entries.slice(0, standalone ? 12 : 2).map(renderModel)
          )}
        </>
      )}
      {showFeature('market') && <SkyOptionalFeatures timeline only="market" />}
      {filter === 'all' && tools.slice(1).map(renderTool)}
      {standalone && !catalogLoading && !hasResults && search && (
        <p className={styles.note}>
          一致する項目がありません。検索語や種類を変えてください。
        </p>
      )}
      {!standalone && (
        <Link className={styles.more} href="/#catalog">
          もっと見つける <ArrowUpRight size={16} />
        </Link>
      )}
      {standalone && (
        <Link className={styles.more} href="/#news-plugins">
          <Newspaper size={17} />
          ニュースの配信元を追加
        </Link>
      )}
    </section>
  );
}
