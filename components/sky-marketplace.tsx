'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BrainCircuit,
  Cable,
  CircleHelp,
  Code2,
  Cpu,
  Layers3,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { catalog, type Automation } from '@/lib/catalog';
import type { SkyPricing } from '@/lib/sky-submission';
import type { SkyToolPackage } from '@/lib/sky-tool-package';
import {
  catalogHostMismatch,
  detectSkyHost,
  registryHostMismatch,
  skyHostLabel,
  type SkyHostEnvironment,
} from '@/lib/sky-tool-compatibility';
import SkyToolCard from '@/components/sky-tool-card';
import SkyToolOverview from '@/components/sky-tool-overview';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import WorkspaceShell from '@/components/workspace-shell';
import { skyToolDetailActionLabel, skyToolUiState } from '@/lib/sky-tool-ui';
import { useSkyToolContext } from '@/lib/use-sky-tool-context';
import {
  skyAiMarketplaceEntries,
  type SkyAiMarketplaceEntry,
} from '@/lib/sky-ai-marketplace';
import styles from '@/components/sky-marketplace.module.css';
import { CommerceNavigation, MarketplacePurchase, commerceAmount, usePublicCommerceOffers } from '@/components/sky-commerce';

type RegistryItem = {
  packageKey: string;
  manifest: SkyToolPackage;
  status: string;
  installable: boolean;
};

type View = 'all' | 'built-in' | 'candidate' | 'verified';
type MarketKind = 'all' | 'automation' | 'llm';
const views: { id: View; label: string }[] = [
  { id: 'all', label: 'すべて' },
  { id: 'built-in', label: 'Skyのツール' },
  { id: 'candidate', label: '導入候補' },
  { id: 'verified', label: '審査済み外部' },
];

const pricingLabel: Record<SkyPricing, string> = {
  free: '無料',
  subscription: '定額',
  usage: '従量',
  external_contract: '外部契約',
};

const subscribeHost = () => () => {};
const getHostSnapshot = (): SkyHostEnvironment | null =>
  detectSkyHost(navigator.userAgent, navigator.maxTouchPoints);
const getServerHostSnapshot = (): SkyHostEnvironment | null => null;

export default function SkyMarketplace() {
  const runtimeContext = useSkyToolContext();
  const commerce = usePublicCommerceOffers();
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>('all');
  const [marketKind, setMarketKind] = useState<MarketKind>('all');
  const [category, setCategory] = useState('すべて');
  const [registry, setRegistry] = useState<RegistryItem[]>([]);
  const [registryState, setRegistryState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [selected, setSelected] = useState<RegistryItem | null>(null);
  const [selectedCatalog, setSelectedCatalog] = useState<Automation | null>(null);
  const [selectedAi, setSelectedAi] = useState<SkyAiMarketplaceEntry | null>(null);
  const host = useSyncExternalStore(subscribeHost, getHostSnapshot, getServerHostSnapshot);
  const [showHostMismatches, setShowHostMismatches] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/sky/tool-registry', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Registry unavailable');
        const data = (await response.json()) as { packages?: RegistryItem[] };
        setRegistry((data.packages ?? []).filter((item) =>
          item.status === 'verified' && item.installable === true,
        ));
        setRegistryState('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setRegistryState('unavailable');
      });
    return () => controller.abort();
  }, []);

  const categories = useMemo(() => [
    'すべて',
    'LLM',
    ...new Set([
      ...catalog.map((tool) => tool.category),
      ...registry.flatMap((item) => item.manifest.fund.categories),
    ]),
  ], [registry]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = (values: string[]) => !normalizedQuery || values.some((value) =>
    value.toLocaleLowerCase().includes(normalizedQuery),
  );
  const matchingCatalog = catalog.filter((tool) => {
    if (marketKind === 'llm') return false;
    if (view === 'verified') return false;
    if (view === 'candidate' && tool.status !== 'candidate') return false;
    if (view === 'built-in' && tool.status === 'candidate') return false;
    if (category !== 'すべて' && tool.category !== category) return false;
    return matches([tool.name, tool.description, tool.category]);
  });
  const matchingRegistry = registry.filter((item) => {
    const isLlm = item.manifest.fund.categories.some((label) => ['llm', 'aiモデル'].includes(label.toLocaleLowerCase()));
    if (marketKind === 'llm' && !isLlm) return false;
    if (marketKind === 'automation' && isLlm) return false;
    if (view !== 'all' && view !== 'verified') return false;
    if (category !== 'すべて' && !item.manifest.fund.categories.includes(category)) return false;
    return matches([
      item.manifest.name,
      item.manifest.summary,
      item.manifest.developer.displayName,
      ...item.manifest.fund.tags,
    ]);
  });
  const hiddenCatalog = host === null ? [] : matchingCatalog.filter((tool) =>
    catalogHostMismatch(tool, host),
  );
  const hiddenRegistry = host === null ? [] : matchingRegistry.filter((item) =>
    registryHostMismatch(item.manifest.capabilities.executionTargets, host),
  );
  const hiddenCount = hiddenCatalog.length + hiddenRegistry.length;
  const visibleCatalog = host === null ? [] : matchingCatalog.filter((tool) =>
    showHostMismatches || !catalogHostMismatch(tool, host),
  );
  const visibleRegistry = host === null ? [] : matchingRegistry.filter((item) =>
    showHostMismatches || !registryHostMismatch(item.manifest.capabilities.executionTargets, host),
  );
  const readyCount = catalog.filter((tool) => tool.status === 'ready').length;
  const candidateCount = catalog.filter((tool) => tool.status === 'candidate').length;
  const hasResults = visibleCatalog.length + visibleRegistry.length > 0;
  const matchingAi = skyAiMarketplaceEntries.filter((provider) => {
    if (marketKind === 'automation') return false;
    if (category !== 'すべて' && category !== 'LLM') return false;
    return matches([
      provider.name,
      provider.detail,
      provider.defaultModel,
      provider.locality,
      provider.connectionLabel,
    ]);
  });
  const hasMarketResults = hasResults || matchingAi.length > 0;
  const offersByPackage = new Map((commerce.data?.configured ? commerce.data.offers : []).map((offer) => [offer.packageKey, offer]));
  const selectedOffer = selected ? offersByPackage.get(selected.packageKey) : undefined;

  return (
    <WorkspaceShell title="Sky Market" tone="sky" contentClassName={styles.shell} hideTopActions>
      <div className={styles.page}>
        <nav className={styles.breadcrumb} aria-label="現在位置">
          <Link href="/sky"><ArrowLeft size={14} /> Skyに戻る</Link>
          <span>/</span>
          <strong>マーケット</strong>
        </nav>

        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>SKY MARKET</span>
            <h1>AIと自動化をつなぐ</h1>
            <p>LLM、MCP、自動化Toolを一つの接続条件で探して使う。</p>
          </div>
          <Link href="/sky/register" className={styles.secondaryAction}><Code2 size={17} /> ツールを登録</Link>
        </header>

        <CommerceNavigation />

        <section id="explore" className={styles.explore} aria-labelledby="explore-title">
          <h2 id="explore-title" className="sr-only">ツール一覧</h2>
          <div className={styles.marketKinds} role="tablist" aria-label="マーケットの種類">
            {([
              ['all', 'すべて'],
              ['automation', '自動化・MCP'],
              ['llm', 'LLM・AIモデル'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={marketKind === id}
                onClick={() => setMarketKind(id)}
              >
                {id === 'llm' ? <BrainCircuit size={16} /> : id === 'automation' ? <Cable size={16} /> : <Layers3 size={16} />}
                {label}
              </button>
            ))}
          </div>
          <div className={styles.searchRow}>
            <label className={styles.searchBox}>
              <Search size={19} aria-hidden="true" />
              <span className="sr-only">ツールを検索</span>
              <input aria-label="ツールを検索" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名前・用途・作者で検索" />
              {query && <button type="button" aria-label="検索をクリア" onClick={() => setQuery('')}><X size={17} /></button>}
            </label>
            <label className={styles.categorySelect}>
              <SlidersHorizontal size={17} aria-hidden="true" />
              <span className="sr-only">カテゴリ</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                {categories.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          </div>

          <fieldset className={styles.viewTabs}>
            <legend className="sr-only">掲載状態で絞り込み</legend>
            {views.map((item) => (
              <button key={item.id} type="button" aria-pressed={view === item.id} onClick={() => setView(item.id)}>
                {item.label}
              </button>
            ))}
          </fieldset>

          <details className={styles.environmentFilter}>
              <summary>{host === null ? '利用環境を確認中' : `${skyHostLabel(host)} · 対応環境で絞り込み`}</summary>
              <p>{host === null
                ? 'ブラウザの端末情報を確認しています。'
                : host === 'unknown'
                  ? '端末を判定できないため自動除外していません。個別の利用条件を確認してください。'
                  : '明らかに対象外の端末向けツールだけを省いています。必要ソフト・外部アカウント・接続状態は別途確認が必要です。'}</p>
            {host !== null && hiddenCount > 0 && (
              <button
                type="button"
                className={styles.environmentToggle}
                aria-pressed={showHostMismatches}
                onClick={() => setShowHostMismatches((current) => !current)}
              >
                {showHostMismatches ? '対象外を隠す' : `対象外も表示 (${hiddenCount})`}
              </button>
            )}
          </details>

          <p className={styles.resultCount}>{host === null ? '端末確認中' : `${visibleCatalog.length + visibleRegistry.length + matchingAi.length} 件を表示`}</p>
          {host === null ? (
            <output className={styles.emptyState}>利用環境を確認しています…</output>
          ) : hasMarketResults ? (
            <>
              {matchingAi.length > 0 && (
                <section className={styles.aiSection} aria-labelledby="ai-market-title">
                  <div className={styles.aiSectionHeading}>
                    <div>
                      <span><BrainCircuit size={15} /> AI RUNTIME</span>
                      <h2 id="ai-market-title">LLMを選ぶ</h2>
                    </div>
                    <small>選んだLLMはSky BrokerからMCP Toolを呼び出します</small>
                  </div>
                  <div className={styles.grid}>
                    {matchingAi.map((provider) => (
                      <button
                        type="button"
                        className={`${styles.card} ${styles.aiCard}`}
                        key={provider.marketplaceId}
                        onClick={() => setSelectedAi(provider)}
                      >
                        <div className={styles.cardTop}>
                          <span className={styles.cardIcon}><Cpu size={26} /></span>
                          <span className={styles.readyBadge}>{provider.locality === 'local' ? 'ローカル' : 'クラウド'}</span>
                        </div>
                        <div className={styles.cardBody}>
                          <span className={styles.cardCategory}>LLM / {provider.id}</span>
                          <h3>{provider.name}</h3>
                          <p>{provider.detail}</p>
                        </div>
                        <div className={styles.cardBottom}>
                          <span>{provider.defaultModelLabel}</span>
                          <ArrowUpRight size={18} />
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {hasResults && (
                <section className={styles.automationSection} aria-labelledby="automation-market-title">
                  {matchingAi.length > 0 && <div className={styles.aiSectionHeading}><div><span><Cable size={15} /> MCP AUTOMATION</span><h2 id="automation-market-title">Toolを探す</h2></div></div>}
                  <div className={styles.grid}>
                    {visibleCatalog.map((tool) => (
                      <SkyToolCard
                        key={tool.id}
                        tool={tool}
                        state={skyToolUiState(tool, runtimeContext)}
                        expanded={selectedCatalog?.id === tool.id}
                        onInspect={() => setSelectedCatalog(tool)}
                        actionLabel={skyToolDetailActionLabel(tool)}
                        href={`/sky/tools/${encodeURIComponent(tool.id)}`}
                        hostMismatch={catalogHostMismatch(tool, host)}
                      />
                    ))}
                    {visibleRegistry.map((item) => (
                      <button type="button" className={`${styles.card} ${styles.registryCard}`} key={item.packageKey} onClick={() => setSelected(item)}>
                        <div className={styles.cardTop}>
                          <span className={styles.cardIcon}><BadgeCheck size={26} /></span>
                          <span className={styles.verifiedBadge}><ShieldCheck size={13} /> 審査済み</span>
                        </div>
                        <div className={styles.cardBody}>
                          <span className={styles.cardCategory}>{item.manifest.fund.categories[0] || '外部ツール'}</span>
                          <h3>{item.manifest.name}</h3>
                          <p>{item.manifest.summary}</p>
                          {registryHostMismatch(item.manifest.capabilities.executionTargets, host) && (
                            <span className={styles.hostMismatch}>この端末では対象外 · {registryHostMismatch(item.manifest.capabilities.executionTargets, host)}</span>
                          )}
                        </div>
                        <div className={styles.cardBottom}>
                          <span>{item.manifest.developer.displayName} · {offersByPackage.has(item.packageKey) ? `${commerceAmount(offersByPackage.get(item.packageKey)!.amountMinor, offersByPackage.get(item.packageKey)!.currency)} / 買い切り` : pricingLabel[item.manifest.pricing.model]}</span>
                          <ArrowUpRight size={18} />
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            <div className={styles.emptyState}>
              <CircleHelp size={27} />
              <h3>条件に合うツールはありません</h3>
              <p>{view === 'verified' && registryState === 'loading' ? '審査済みToolを読み込んでいます。' : view === 'verified' && registryState === 'unavailable' ? '公開Registryに接続できません。Skyのツールは他のタブで確認できます。' : hiddenCount > 0 && !showHostMismatches ? '検索条件に合うツールは、この端末では対象外です。対象外も表示すると詳細を確認できます。' : '検索語やカテゴリを変えてみてください。'}</p>
              <button type="button" onClick={() => { setQuery(''); setCategory('すべて'); setView('all'); }}>検索条件をリセット</button>
            </div>
          )}
          {registryState === 'unavailable' && view !== 'verified' && (
            <p className={styles.registryNote}>公開Registryを取得できませんでした。審査済み外部Toolの件数は未確認です。</p>
          )}
        </section>

        <p className={styles.inventory}>
          Skyのツール {readyCount} · 導入候補 {candidateCount} · 審査済み外部 {registryState === 'ready' ? registry.length : '—'}
          <span>基本登録・接続は0円。売上が発生するToolのSky手数料は10%。外部API・モデル費用は別表示します。</span>
          <span>掲載数は、接続済み・本番稼働数を意味しません。</span>
        </p>
        <section className={styles.developerStrip} aria-labelledby="developer-title">
          <div className={styles.developerIcon}><Layers3 size={27} /></div>
          <div>
            <span>FOR BUILDERS</span>
            <h2 id="developer-title">あなたの自動化も、Skyへ。</h2>
            <p>既存のNode.jsコードにSDKを追加し、このPCのSkyで試せます。一般向け掲載は別途審査が必要です。</p>
          </div>
          <Link href="/studio">Studioを開く <ArrowRight size={17} /></Link>
        </section>
      </div>

      <Dialog open={Boolean(selectedCatalog)} onOpenChange={(open) => { if (!open) setSelectedCatalog(null); }}>
        {selectedCatalog && (
          <SkyToolOverview
            tool={selectedCatalog}
            state={skyToolUiState(selectedCatalog, runtimeContext)}
            hostMismatch={host ? catalogHostMismatch(selectedCatalog, host) : null}
          >
            <Link className={styles.modalAction} href={`/sky/tools/${encodeURIComponent(selectedCatalog.id)}`}>
              {skyToolDetailActionLabel(selectedCatalog)} <ArrowRight size={17} />
            </Link>
          </SkyToolOverview>
        )}
      </Dialog>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        {selected && (
          <DialogContent className={styles.modal}>
            <span className={styles.verifiedBadge}><ShieldCheck size={13} /> 審査済みPackage</span>
            <DialogTitle>{selected.manifest.name}</DialogTitle>
            <DialogDescription>{selected.manifest.summary}</DialogDescription>
            <dl>
              <div><dt>開発者</dt><dd>{selected.manifest.developer.displayName}</dd></div>
              <div><dt>バージョン</dt><dd>{selected.manifest.version}</dd></div>
              <div><dt>実行先</dt><dd>{selected.manifest.capabilities.executionTargets.join(' / ')}</dd></div>
              <div><dt>料金</dt><dd>{selectedOffer ? `${commerceAmount(selectedOffer.amountMinor, selectedOffer.currency)} · 買い切り` : `${pricingLabel[selected.manifest.pricing.model]} · ${selected.manifest.pricing.note}`}</dd></div>
              <div><dt>権限</dt><dd>{selected.manifest.capabilities.permissions.join(' / ') || '追加権限なし'}</dd></div>
            </dl>
            {host && registryHostMismatch(selected.manifest.capabilities.executionTargets, host) && (
              <p className={styles.hostMismatch}>この端末では対象外 · {registryHostMismatch(selected.manifest.capabilities.executionTargets, host)}</p>
            )}
            {selectedOffer ? <MarketplacePurchase key={selected.packageKey} offer={selectedOffer} mode={commerce.data?.mode ?? null} compatible={Boolean(host && !registryHostMismatch(selected.manifest.capabilities.executionTargets, host))} onOfferChanged={commerce.refresh} /> : <>
              <p className={styles.modalNote}>{commerce.loading ? '販売情報を確認しています。' : commerce.error ? '販売情報を取得できませんでした。購入履歴を確認するか、再度開いてください。' : 'Skyでの販売設定はありません。料金と利用方法は提供元の案内を確認してください。'}審査済みは実行・購入・自動接続の完了を意味しません。</p>
              <Link className={styles.modalAction} href="/sky/network">Skyで接続先を確認 <ArrowRight size={17} /></Link>
            </>}
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={Boolean(selectedAi)} onOpenChange={(open) => { if (!open) setSelectedAi(null); }}>
        {selectedAi && (
          <DialogContent className={styles.modal}>
            <span className={styles.verifiedBadge}><BrainCircuit size={13} /> LLM / MCP対応</span>
            <DialogTitle>{selectedAi.name}</DialogTitle>
            <DialogDescription>{selectedAi.detail}</DialogDescription>
            <dl>
              <div><dt>標準モデル</dt><dd>{selectedAi.defaultModel}</dd></div>
              <div><dt>実行場所</dt><dd>{selectedAi.connectionLabel}</dd></div>
              <div><dt>MCP経路</dt><dd>{selectedAi.mcpRoute}</dd></div>
              <div><dt>認証</dt><dd>{selectedAi.credentialEnv ? 'Skyの接続設定で管理' : '追加の外部鍵なし'}</dd></div>
            </dl>
            <p className={styles.modalNote}>LLMは勝手に外部操作しません。Sky BrokerがToolの権限・確認・結果検証を通してからMCPを呼び出します。</p>
            <Link className={styles.modalAction} href="/sky/network">接続設定を開く <ArrowRight size={17} /></Link>
          </DialogContent>
        )}
      </Dialog>
    </WorkspaceShell>
  );
}
