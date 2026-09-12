'use client';

import { useState, type CSSProperties, type SyntheticEvent } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  Activity,
  BadgeCheck,
  BookOpenCheck,
  BriefcaseBusiness,
  FileCheck2,
  FilePenLine,
  Laptop,
  Link2,
  PackagePlus,
  Radio,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { catalog, type Automation } from '@/lib/catalog';
import { routeSkyRequest, skyRoles } from '@/lib/sky-routing';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MrToolRunner } from '@/components/mr-tool-runner';
import { DeviceConnection } from '@/components/device-connection';
import WorkspaceShell from '@/components/workspace-shell';

type FeedFilter = 'おすすめ' | '今使える' | '導入候補';

const readyTools = catalog.filter((tool) => tool.status === 'ready');
const feedFilters: FeedFilter[] = ['おすすめ', '今使える', '導入候補'];
const icons: Record<string, LucideIcon> = {
  coconala: BriefcaseBusiness,
  'mr-free-article': FilePenLine,
  'mr-citations': BookOpenCheck,
  'mr-delivery': FileCheck2,
};
const providers: Record<
  string,
  { name: string; handle: string; initial: string }
> = {
  coconala: { name: 'Sky 案件判断役', handle: '@sky_case', initial: '案' },
  'mr-free-article': {
    name: 'Sky 記事編集役',
    handle: '@sky_editor',
    initial: '編',
  },
  'mr-citations': {
    name: 'Sky 出典整理役',
    handle: '@sky_sources',
    initial: '出',
  },
  'mr-delivery': {
    name: 'Sky 納品確認役',
    handle: '@sky_delivery',
    initial: '納',
  },
  'faster-whisper': { name: 'SYSTRAN', handle: '@systran', initial: 'S' },
  'transformers-js': {
    name: 'Hugging Face',
    handle: '@huggingface',
    initial: 'H',
  },
  playwright: { name: 'Microsoft', handle: '@microsoft', initial: 'M' },
};
function providerFor(tool: Automation) {
  return (
    providers[tool.id] ?? {
      name: 'Sky ツール案内',
      handle: '@sky_tools',
      initial: 'M',
    }
  );
}

function statusFor(tool: Automation) {
  if (tool.status === 'candidate')
    return {
      label: '導入候補',
      detail: 'Skyからの実行は未対応',
      className: 'is-candidate',
    };
  if (tool.runner === 'delivery-local')
    return {
      label: 'PC接続後',
      detail: '利用者のPCで実行',
      className: 'is-connect',
    };
  return {
    label: '今使える',
    detail: 'ブラウザ内で実行',
    className: 'is-ready',
  };
}

function roleFor(tool: Automation) {
  return (
    skyRoles.find((role) => role.toolId === tool.id)?.label ?? 'ツール案内役'
  );
}

export default function SkyWorkspace() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FeedFilter>('おすすめ');
  const [selected, setSelected] = useState<Automation | null>(null);
  const [deviceOpen, setDeviceOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [requestText, setRequestText] = useState('');
  const [routedTool, setRoutedTool] = useState<Automation | null>(null);
  const [routeMessage, setRouteMessage] = useState('');

  const visibleTools = catalog.filter((tool) => {
    const matchesFilter =
      filter === 'おすすめ' ||
      (filter === '今使える' && tool.status === 'ready') ||
      (filter === '導入候補' && tool.status === 'candidate');
    const provider = providerFor(tool);
    const text =
      tool.name +
      ' ' +
      tool.description +
      ' ' +
      tool.category +
      ' ' +
      provider.name;
    return (
      matchesFilter && text.toLowerCase().includes(query.trim().toLowerCase())
    );
  });

  function primaryAction(tool: Automation) {
    if (tool.runner === 'delivery-local') {
      setDeviceOpen(true);
      return;
    }
    setSelected(tool);
  }

  function chooseRole(tool: Automation, request = '') {
    setRoutedTool(tool);
    setRouteMessage(
      request
        ? `「${request}」は${roleFor(tool)}が進められます。`
        : `${roleFor(tool)}につなぎました。`,
    );
  }

  function openRole(tool: Automation, request = '') {
    chooseRole(tool, request);
    primaryAction(tool);
  }

  function submitRequest(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const request = requestText.trim();
    if (!request) return;
    const role = routeSkyRequest(request);
    const tool = role
      ? (catalog.find((item) => item.id === role.toolId) ?? null)
      : null;
    if (tool) openRole(tool, request);
    else {
      setRoutedTool(null);
      setRouteMessage(
        'まだ役割を決められません。下の4つから近い役を選んでください。',
      );
    }
  }

  return (
    <WorkspaceShell
      running={running}
      title="Sky"
      contentClassName="sky-main-feed"
      onConnect={() => setDeviceOpen(true)}
    >
      <div className="sky-feed-layout">
        <section className="sky-feed-column" aria-labelledby="sky-feed-title">
          <header className="sky-feed-header">
            <div className="sky-feed-title-row">
              <div>
                <span className="sky-feed-kicker">
                  <Radio size={13} aria-hidden="true" />
                  LIVE AUTOMATION
                </span>
                <h1 id="sky-feed-title">Sky Timeline</h1>
                <p>やりたいことを送ると、担当の役がすぐ動きます。</p>
              </div>
              <Link
                href="/sky/publish"
                aria-label="Skyにツールを掲載"
                className="sky-publish-orb"
              >
                <PackagePlus size={20} />
              </Link>
            </div>
            <Tabs
              value={filter}
              onValueChange={(value) => setFilter(value as FeedFilter)}
            >
              <TabsList
                className="sky-feed-tabs"
                aria-label="Sky Timelineの表示"
              >
                {feedFilters.map((item) => (
                  <TabsTrigger key={item} value={item}>
                    {item}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </header>

          <section
            className="sky-assistant"
            aria-labelledby="sky-assistant-title"
          >
            <div className="sky-assistant-avatar" aria-hidden="true">
              <span>S</span>
            </div>
            <div className="sky-assistant-body">
              <div className="sky-assistant-heading">
                <div>
                  <span>SKY ROUTER</span>
                  <h2 id="sky-assistant-title">何を進める？</h2>
                </div>
                <span className="sky-router-live">
                  <Activity size={14} aria-hidden="true" />
                  待機中
                </span>
              </div>
              <form className="sky-assistant-composer" onSubmit={submitRequest}>
                <input
                  value={requestText}
                  onChange={(event) => setRequestText(event.target.value)}
                  placeholder="いま、何を進めたい？"
                  aria-label="Skyへの依頼"
                />
                <button
                  disabled={!requestText.trim()}
                  aria-label="Skyへ依頼を送る"
                >
                  <Send size={18} />
                  <span>送る</span>
                </button>
              </form>
              <div className="sky-routing-flow" aria-label="Skyの実行手順">
                <span>依頼</span>
                <i aria-hidden="true" />
                <span>担当を選択</span>
                <i aria-hidden="true" />
                <strong>ツールを開く</strong>
              </div>
              <div className="sky-role-list" aria-label="Skyの役割">
                {skyRoles.map((role) => {
                  const tool = catalog.find((item) => item.id === role.toolId)!;
                  return (
                    <button key={role.toolId} onClick={() => openRole(tool)}>
                      <span
                        className={'sky-role-dot rock-icon-' + tool.color}
                        aria-hidden="true"
                      />
                      {role.label}
                      <ArrowRight size={13} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
              <p className="sky-assistant-connect-note">
                <Zap size={14} aria-hidden="true" />
                ブラウザの役は送信だけで開きます。PCは初回だけ接続します。
              </p>
              {routeMessage && (
                <output className="sky-route-reply">
                  <span className="sky-route-icon">
                    <Sparkles size={16} />
                  </span>
                  <div>
                    <strong>担当が決まりました</strong>
                    <p>{routeMessage}</p>
                  </div>
                  {routedTool && (
                    <button onClick={() => primaryAction(routedTool)}>
                      {routedTool.runner === 'delivery-local'
                        ? 'PC接続へ'
                        : 'もう一度開く'}
                      <ArrowRight size={15} />
                    </button>
                  )}
                </output>
              )}
            </div>
          </section>

          <div className="sky-mobile-search">
            <Search size={18} />
            <input
              type="search"
              aria-label="Skyを検索"
              placeholder="ツールを検索"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button aria-label="検索をクリア" onClick={() => setQuery('')}>
                <X size={16} />
              </button>
            )}
          </div>

          <div className="sky-feed" aria-live="polite">
            {visibleTools.map((tool, index) => {
              const Icon = icons[tool.id] ?? Link2;
              const provider = providerFor(tool);
              const status = statusFor(tool);
              return (
                <article
                  className={'sky-feed-post ' + status.className}
                  key={tool.id}
                  style={{ '--sky-index': index } as CSSProperties}
                >
                  <div className="sky-timeline-node" aria-hidden="true">
                    <span
                      className={'sky-provider-avatar rock-icon-' + tool.color}
                    >
                      {provider.initial}
                    </span>
                  </div>
                  <div className="sky-post-body">
                    <div className="sky-post-meta-row">
                      <div className="sky-post-author">
                        <strong>{provider.name}</strong>
                        {tool.status === 'ready' && (
                          <BadgeCheck
                            className="sky-role-verified"
                            size={16}
                            aria-label="Skyで利用可能"
                          />
                        )}
                        <span>{provider.handle}</span>
                      </div>
                      <span className={'sky-post-state ' + status.className}>
                        <i aria-hidden="true" />
                        {status.label}
                      </span>
                    </div>
                    <button
                      className="sky-post-open"
                      onClick={() => setSelected(tool)}
                    >
                      <span
                        className={'rock-tool-icon rock-icon-' + tool.color}
                      >
                        <Icon size={22} strokeWidth={1.7} />
                      </span>
                      <span>
                        <small>{roleFor(tool)}</small>
                        <strong>{tool.name}</strong>
                      </span>
                      <ArrowUpRight size={18} />
                    </button>
                    <span className="sky-post-label">この役ができること</span>
                    <p className="sky-post-description">{tool.description}</p>
                    <div className="sky-post-facts">
                      <span>
                        <Zap size={13} aria-hidden="true" />
                        {status.detail}
                      </span>
                      <span>{tool.environment}</span>
                    </div>
                    <div className="sky-post-actions">
                      <button onClick={() => setSelected(tool)}>
                        <SlidersHorizontal size={16} />
                        条件を見る
                      </button>
                      <button
                        className="sky-post-primary"
                        onClick={() => primaryAction(tool)}
                      >
                        {tool.status === 'ready' &&
                          tool.runner !== 'delivery-local' && (
                            <Zap size={16} fill="currentColor" />
                          )}
                        {tool.status === 'candidate'
                          ? '詳細を見る'
                          : tool.runner === 'delivery-local'
                            ? 'PCを接続'
                            : '1タップで開く'}
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
            {visibleTools.length === 0 && (
              <div className="sky-feed-empty">
                <Search size={25} />
                <strong>見つかりませんでした</strong>
                <p>検索を消すか、別のタブを選んでください。</p>
                <button
                  onClick={() => {
                    setQuery('');
                    setFilter('おすすめ');
                  }}
                >
                  すべて表示
                </button>
              </div>
            )}
          </div>
        </section>

        <aside className="sky-feed-rail" aria-label="Skyの検索と接続状況">
          <label className="sky-rail-search">
            <Search size={18} />
            <span className="sr-only">Skyを検索</span>
            <input
              type="search"
              placeholder="Skyを検索"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button aria-label="検索をクリア" onClick={() => setQuery('')}>
                <X size={16} />
              </button>
            )}
          </label>
          <section className="sky-rail-card sky-rail-publish">
            <span className="sky-rail-card-icon">
              <PackagePlus size={21} />
            </span>
            <h2>ツールをSkyに掲載</h2>
            <p>
              必要情報を入れて審査へ。MCPの能力はSkyが接続先から確認します。
            </p>
            <Link href="/sky/publish">
              掲載を始める
              <ArrowRight size={16} />
            </Link>
          </section>
          <section className="sky-rail-card">
            <div className="sky-rail-live-heading">
              <h2>接続ステータス</h2>
              <span>
                <i /> LIVE
              </span>
            </div>
            <div className="sky-rail-count">
              <span>今使える</span>
              <strong>{readyTools.length}</strong>
            </div>
            <div className="sky-rail-count">
              <span>導入候補</span>
              <strong>{catalog.length - readyTools.length}</strong>
            </div>
            <button
              className="sky-rail-connect"
              onClick={() => setDeviceOpen(true)}
            >
              <Laptop size={17} />
              PCを接続
              <ArrowRight size={15} />
            </button>
          </section>
          <section className="sky-rail-trust">
            <ShieldCheck size={18} />
            <p>
              権限・料金・実行場所を確認してから接続します。候補は実行できるツールに数えません。
            </p>
          </section>
          <Link href="/rockstaros" className="sky-rail-os">
            RockstarOSについて
            <ArrowUpRight size={15} />
          </Link>
        </aside>
      </div>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open && !running) setSelected(null);
        }}
      >
        <DialogContent className="rock-tool-dialog">
          {selected && (
            <>
              <p className="rock-eyebrow">
                {selected.category} /{' '}
                {selected.status === 'ready' ? 'TOOL' : '導入候補'}
              </p>
              <DialogTitle className="rock-dialog-title">
                {selected.name}
              </DialogTitle>
              <DialogDescription className="rock-dialog-description">
                {selected.description}
              </DialogDescription>
              <div className="rock-tool-facts">
                <div>
                  <span>使う場所</span>
                  <strong>{selected.environment}</strong>
                </div>
                <div>
                  <span>費用・通信</span>
                  <p>{selected.cost}</p>
                </div>
              </div>
              {running && (
                <output className="rock-running-notice">
                  実行中です。結果が表示されるまで、この画面を開いたままにしてください。
                </output>
              )}
              {selected.runner && (
                <MrToolRunner
                  key={selected.id}
                  tool={selected.runner}
                  onRunningChange={setRunning}
                />
              )}
              <details className="rock-tool-details">
                <summary>利用条件・準備・提供元</summary>
                <ol>
                  {selected.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <p>{selected.note}</p>
                <div>
                  <a href={selected.source} target="_blank" rel="noreferrer">
                    提供元のコード
                    <ArrowUpRight size={14} />
                  </a>
                  <a
                    href={selected.licenseUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {selected.license}ライセンス
                    <ArrowUpRight size={14} />
                  </a>
                </div>
              </details>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deviceOpen} onOpenChange={setDeviceOpen}>
        <DialogContent className="rock-tool-dialog">
          <DialogTitle className="rock-dialog-title">PCを接続する</DialogTitle>
          <DialogDescription>
            接続アプリを起動すると、このPCでツールを実行できます。
          </DialogDescription>
          <DeviceConnection />
        </DialogContent>
      </Dialog>
    </WorkspaceShell>
  );
}
