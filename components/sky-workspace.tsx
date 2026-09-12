'use client';

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type SyntheticEvent,
} from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BookOpenCheck,
  BriefcaseBusiness,
  FileCheck2,
  FilePenLine,
  Lightbulb,
  Link2,
  PackagePlus,
  Scale,
  Search,
  Send,
  X,
  WalletCards,
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

const feedFilters: FeedFilter[] = ['おすすめ', '今使える', '導入候補'];
const icons: Record<string, LucideIcon> = {
  coconala: BriefcaseBusiness,
  'mr-free-article': FilePenLine,
  'mr-citations': BookOpenCheck,
  'mr-delivery': FileCheck2,
  'rockstar-ledger': WalletCards,
  'rockstar-legal-intake': Scale,
  'rockstar-patent-assistant': Lightbulb,
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
  'rockstar-ledger': {
    name: 'Sky サブスク顧問',
    handle: '@sky_subscriptions',
    initial: '顧',
  },
  'rockstar-legal-intake': {
    name: 'Sky 法務受付',
    handle: '@sky_legal',
    initial: '法',
  },
  'rockstar-patent-assistant': {
    name: 'Sky 特許出願担当',
    handle: '@sky_patent',
    initial: '特',
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
  const [lastRequest, setLastRequest] = useState('');
  const [routedTool, setRoutedTool] = useState<Automation | null>(null);
  const [routeMessage, setRouteMessage] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);

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
    setLastRequest(request);
    setRoutedTool(tool);
    setRouteMessage(
      `${roleFor(tool)}が進めます。内容を確認してツールを開いてください。`,
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
    setRequestText('');
    setLastRequest(request);
    if (tool) chooseRole(tool, request);
    else {
      setRoutedTool(null);
      setRouteMessage(
        '近い役割を選んでください。選ぶと、その担当につながります。',
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
          <section
            className="sky-assistant"
            aria-labelledby="sky-assistant-title"
          >
            <div className="sky-assistant-avatar" aria-hidden="true">
              <span>S</span>
            </div>
            <div className="sky-assistant-body">
              <h2 id="sky-assistant-title" className="sr-only">
                Skyに頼む
              </h2>
              <form className="sky-assistant-composer" onSubmit={submitRequest}>
                <input
                  value={requestText}
                  onChange={(event) => setRequestText(event.target.value)}
                  placeholder="何をしてほしい？"
                  aria-label="Skyへの依頼"
                />
                <button
                  disabled={!requestText.trim()}
                  aria-label="Skyへ依頼を送る"
                >
                  <Send size={18} />
                  <span>送信</span>
                </button>
              </form>
              <div className="sky-role-list" aria-label="Skyの役割">
                {skyRoles.map((role) => {
                  const tool = catalog.find((item) => item.id === role.toolId)!;
                  return (
                    <button
                      key={role.toolId}
                      onClick={() => openRole(tool, role.label)}
                    >
                      {role.label}
                    </button>
                  );
                })}
              </div>
              {routeMessage && (
                <output className="sky-route-reply">
                  <div className="sky-route-conversation">
                    {lastRequest && (
                      <p className="sky-route-request">{lastRequest}</p>
                    )}
                    <p className="sky-route-answer">{routeMessage}</p>
                  </div>
                  {routedTool && (
                    <button onClick={() => primaryAction(routedTool)}>
                      {routedTool.runner === 'delivery-local'
                        ? 'PC接続へ'
                        : 'ツールを開く'}
                      <ArrowRight size={15} />
                    </button>
                  )}
                </output>
              )}
            </div>
          </section>

          <header className="sky-feed-header">
            <h1 id="sky-feed-title" className="sr-only">
              Sky
            </h1>
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
            <div className="sky-feed-header-actions">
              <button
                className="sky-header-action"
                aria-label={searchOpen ? '検索を閉じる' : 'ツールを検索'}
                aria-expanded={searchOpen}
                onClick={() => {
                  setSearchOpen((open) => !open);
                  if (searchOpen) setQuery('');
                }}
              >
                {searchOpen ? <X size={19} /> : <Search size={19} />}
              </button>
              <Link
                href="/sky/publish"
                aria-label="Skyにツールを掲載"
                className="sky-header-action"
              >
                <PackagePlus size={19} />
              </Link>
            </div>
          </header>

          {(searchOpen || query) && (
            <div className="sky-feed-search">
              <Search size={18} />
              <input
                type="search"
                aria-label="Skyを検索"
                placeholder="ツール名・できることで検索"
                value={query}
                ref={searchInput}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <button aria-label="検索をクリア" onClick={() => setQuery('')}>
                  <X size={16} />
                </button>
              )}
            </div>
          )}

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
                    <div className="sky-post-open">
                      <span
                        className={'rock-tool-icon rock-icon-' + tool.color}
                      >
                        <Icon size={22} strokeWidth={1.7} />
                      </span>
                      <span>
                        <small>{roleFor(tool)}</small>
                        <strong>{tool.name}</strong>
                      </span>
                    </div>
                    <p className="sky-post-description">{tool.description}</p>
                    <p className="sky-post-place">{status.detail}</p>
                    <div className="sky-post-actions">
                      <button
                        className="sky-post-primary"
                        onClick={() => primaryAction(tool)}
                      >
                        {tool.status === 'ready' &&
                          tool.runner !== 'delivery-local' && (
                            <Zap size={16} fill="currentColor" />
                          )}
                        {tool.status === 'candidate'
                          ? '詳細'
                          : tool.runner === 'delivery-local'
                            ? 'PC接続'
                            : '使う'}
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
      </div>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open && !running) setSelected(null);
        }}
      >
        <DialogContent
          initialFocus={
            selected?.runner === 'legal-intake' ||
            selected?.runner === 'patent-assistant'
              ? false
              : undefined
          }
          className={`rock-tool-dialog sky-tool-dialog ${
            selected?.runner === 'legal-intake' ||
            selected?.runner === 'patent-assistant'
              ? 'sky-tool-dialog-wide'
              : ''
          }`}
        >
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
        <DialogContent className="rock-tool-dialog sky-tool-dialog">
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
