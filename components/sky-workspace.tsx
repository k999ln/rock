'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpenCheck,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Cpu,
  FileCheck2,
  FilePenLine,
  Laptop,
  Link2,
  PackagePlus,
  PlugZap,
  WalletCards,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { catalog, type Automation } from '@/lib/catalog';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MrToolRunner } from '@/components/mr-tool-runner';
import { DeviceConnection } from '@/components/device-connection';
import { FashionBrandOpsRunner } from '@/components/fashion-brand-ops-runner';
import WorkspaceShell from '@/components/workspace-shell';
import { ExecutionPassport } from '@/components/execution-passport';

const readyTools = catalog.filter((tool) => tool.status === 'ready');
const recommended = readyTools.find((tool) => tool.id === 'mr-citations')!;
const fashionOps = readyTools.find((tool) => tool.id === 'fashion-brand-ops')!;
const subscriptionLedger = readyTools.find(
  (tool) => tool.id === 'rockstar-ledger',
)!;
const icons = {
  coconala: BriefcaseBusiness,
  'mr-free-article': FilePenLine,
  'mr-citations': BookOpenCheck,
  'mr-delivery': FileCheck2,
  'rockstar-ledger': WalletCards,
};
const filters = [
  'すべて',
  'ブランド運営',
  '記事制作',
  '案件・納品支援',
  '経費・契約管理',
] as const;

function executionLabel(tool: Automation) {
  if (tool.execution.primaryHost === 'rockstaros_device')
    return tool.execution.supportedHosts.includes('user_pc')
      ? 'RockstarOS / PC'
      : 'RockstarOSで実行';
  if (tool.execution.primaryHost === 'user_pc') return 'PCで実行';
  if (tool.execution.primaryHost === 'self_hosted') return '自前サーバー';
  if (tool.execution.primaryHost === 'provider_cloud') return 'Cloudで実行';
  return 'ブラウザで実行';
}

export default function SkyWorkspace() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string>('すべて');
  const [selected, setSelected] = useState<Automation | null>(null);
  const [deviceOpen, setDeviceOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const tools = readyTools.filter(
    (tool) =>
      (filter === 'すべて' || tool.category === filter) &&
      `${tool.name} ${tool.description} ${tool.category}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <WorkspaceShell
      running={running}
      title="Sky"
      onConnect={() => setDeviceOpen(true)}
    >
      <div className="rock-page-heading">
        <div>
          <p className="rock-eyebrow">SKY · AUTOMATION CONTROL</p>
          <h1>自動化を選ぶ、動かす、止める。</h1>
          <p>Skyなら、ツールの条件確認から実行結果まで一か所で追えます。</p>
        </div>
        <Link href="/work" className="rock-button rock-button-dark">
          仕事を進める
          <ArrowRight size={17} />
        </Link>
      </div>
      <section className="rock-sky-map" aria-labelledby="sky-map-title">
        <div className="rock-sky-map-copy">
          <p className="rock-eyebrow">WHAT SKY DOES</p>
          <h2 id="sky-map-title">ツール置き場ではなく、実行を管理する場所。</h2>
          <p>
            Skyは、自動化ツールごとに必要な権限・料金・実行場所を見せ、
            同意した仕事だけを端末・PC・クラウドへ送り、停止と結果確認までつなぎます。
          </p>
        </div>
        <ol className="rock-sky-flow" aria-label="Skyで自動化を使う流れ">
          <li>
            <span>1</span>
            <strong>探す</strong>
            <small>目的から選ぶ</small>
          </li>
          <li>
            <span>2</span>
            <strong>確認</strong>
            <small>権限・料金</small>
          </li>
          <li>
            <span>3</span>
            <strong>届ける</strong>
            <small>端末・PC・Cloud</small>
          </li>
          <li>
            <span>4</span>
            <strong>制御</strong>
            <small>実行・停止</small>
          </li>
          <li>
            <span>5</span>
            <strong>受け取る</strong>
            <small>結果・記録</small>
          </li>
        </ol>
        <div className="rock-sky-inventory" aria-label="Skyの現在の収録状況">
          <div>
            <strong>{readyTools.length}</strong>
            <span>Web / PCで使用可能</span>
          </div>
          <div>
            <strong>{catalog.length - readyTools.length}</strong>
            <span>OSS導入候補</span>
          </div>
          <div>
            <strong>6</strong>
            <span>native OS内蔵・9バージョン</span>
          </div>
        </div>
      </section>
      <div className="rock-start-grid">
        <section className="rock-first-task" aria-labelledby="first-task-title">
          <div className="rock-feature-tag">
            <span className="rock-small-square" />
            <span>はじめての方に</span>
            <span>ブラウザで完結</span>
          </div>
          <div className="rock-feature-body">
            <div>
              <h2 id="first-task-title">
                ばらばらの出典を、
                <br />
                読みやすい一覧に。
              </h2>
              <p>
                文章を貼り付けるだけで、重複したリンクを整理。
                <br className="rock-desktop-break" />
                サインイン後、サンプルから試せます。
              </p>
              <button
                className="rock-button rock-button-dark"
                onClick={() => setSelected(recommended)}
              >
                出典整理を試す
                <ArrowUpRight size={18} />
              </button>
            </div>
            <div className="rock-feature-symbol" aria-hidden="true">
              <BookOpenCheck size={78} strokeWidth={1.1} />
            </div>
          </div>
          <div className="rock-feature-footer">
            <span>
              <ShieldCheck size={15} />
              外部APIへの本文送信なし
            </span>
            <span>追加API料金なし</span>
          </div>
        </section>
        <section className="rock-quickstart" aria-labelledby="quickstart-title">
          <div className="rock-section-top">
            <h2 id="quickstart-title">最初の結果まで</h2>
            <span>3 STEPS</span>
          </div>
          <ol>
            <li>
              <span>01</span>
              <div>
                <strong>自分の作業に合うツールを選ぶ</strong>
                <p>使う場所と必要な準備を確認。</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>入力して、実行する</strong>
                <p>まずはサンプルでも大丈夫。</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>確認して、手元に保存</strong>
                <p>結果はコピーかファイルで保存。</p>
              </div>
            </li>
          </ol>
          <Link href="/work">
            複数の手順をまとめて進める
            <ChevronRight size={17} />
          </Link>
        </section>
      </div>
      <section className="sky-timeline" aria-labelledby="sky-timeline-title">
        <div className="sky-timeline-heading">
          <div>
            <p className="rock-eyebrow">SKY TIMELINE</p>
            <h2 id="sky-timeline-title">
              流れてきた自動化を、状態を見て接続。
            </h2>
            <p>使える、接続が必要、導入候補。違いを隠さず時系列で並べます。</p>
          </div>
          <Link href="/sky/publish" className="rock-button rock-button-subtle">
            <PackagePlus size={17} />
            ツールを掲載
          </Link>
        </div>
        <div className="sky-timeline-feed">
          <article className="sky-timeline-item is-connect">
            <span className="sky-timeline-dot">
              <PlugZap size={15} />
            </span>
            <div className="sky-timeline-copy">
              <div>
                <time>MCP接続後</time>
                <span>PC・外部Providerは任意</span>
              </div>
              <h3>Instagram運用・受注型ブランド管理</h3>
              <p>
                売上目標から広告、接客、受注、制作・発送、改善までを38操作で管理します。
              </p>
            </div>
            <button onClick={() => setSelected(fashionOps)}>
              接続
              <ArrowRight size={16} />
            </button>
          </article>
          <article className="sky-timeline-item is-ready">
            <span className="sky-timeline-dot">
              <Check size={15} />
            </span>
            <div className="sky-timeline-copy">
              <div>
                <time>今すぐ</time>
                <span>ブラウザで使用可能</span>
              </div>
              <h3>出典整理ツール</h3>
              <p>外部APIへ本文を送らず、この画面ですぐ実行できます。</p>
            </div>
            <button onClick={() => setSelected(recommended)}>
              使う
              <ArrowRight size={16} />
            </button>
          </article>
          <article className="sky-timeline-item is-connect">
            <span className="sky-timeline-dot">
              <WalletCards size={15} />
            </span>
            <div className="sky-timeline-copy">
              <div>
                <time>RockstarOS / PC接続後</time>
                <span>端末内のローカル台帳を読み取り専用で確認</span>
              </div>
              <h3>サブスク顧問</h3>
              <p>
                契約、更新日、支払い失敗をRockstarOS端末または接続PC内の台帳から確認します。
              </p>
            </div>
            <button onClick={() => setSelected(subscriptionLedger)}>
              接続
              <ArrowRight size={16} />
            </button>
          </article>
          <article className="sky-timeline-item is-connect">
            <span className="sky-timeline-dot">
              <PlugZap size={15} />
            </span>
            <div className="sky-timeline-copy">
              <div>
                <time>接続後</time>
                <span>PCで使用可能</span>
              </div>
              <h3>納品記録の照合</h3>
              <p>接続アプリを起動し、手元のPCで処理します。</p>
            </div>
            <button onClick={() => setDeviceOpen(true)}>
              PC接続
              <ArrowRight size={16} />
            </button>
          </article>
          <article className="sky-timeline-item is-review">
            <span className="sky-timeline-dot">
              <Clock3 size={15} />
            </span>
            <div className="sky-timeline-copy">
              <div>
                <time>審査前</time>
                <span>OSS導入候補</span>
              </div>
              <h3>faster-whisper</h3>
              <p>音声文字起こし候補。Skyからの取得・実行はまだできません。</p>
            </div>
            <button
              onClick={() =>
                setSelected(
                  catalog.find((tool) => tool.id === 'faster-whisper') ?? null,
                )
              }
            >
              詳細
              <ArrowRight size={16} />
            </button>
          </article>
        </div>
        <p className="sky-timeline-note">
          MCP掲載ツールは、接続先・権限・料金・データ利用をSkyが確認してから、このタイムラインへ追加します。
        </p>
      </section>
      <section className="rock-tool-section" aria-labelledby="tools-title">
        <div className="rock-section-heading">
          <div>
            <h2 id="tools-title">
              Skyで今使えるツール<span>{readyTools.length}</span>
            </h2>
            <p>用途に合わせて、必要なものから。</p>
          </div>
          <label className="rock-search">
            <Search size={18} />
            <span className="sr-only">ツールを検索</span>
            <input
              type="search"
              placeholder="ツール名・やりたいことで検索"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button aria-label="検索をクリア" onClick={() => setQuery('')}>
                <X size={16} />
              </button>
            )}
          </label>
        </div>
        <Tabs
          value={filter}
          onValueChange={(value) => setFilter(String(value))}
          className="rock-tool-tabs"
        >
          <TabsList aria-label="ツールの用途" className="rock-filter-list">
            {filters.map((item) => (
              <TabsTrigger key={item} value={item}>
                {item}
              </TabsTrigger>
            ))}
          </TabsList>
          {filters.map((item) => (
            <TabsContent key={item} value={item}>
              <div className="rock-tool-grid">
                {tools.map((tool) => {
                  const Icon = icons[tool.id as keyof typeof icons] ?? Link2;
                  return (
                    <article className="rock-tool-card" key={tool.id}>
                      <div className="rock-card-top">
                        <span
                          className={`rock-tool-icon rock-icon-${tool.color}`}
                        >
                          <Icon size={24} strokeWidth={1.6} />
                        </span>
                        <span className="rock-execution-label">
                          {tool.execution.primaryHost ===
                          'rockstaros_device' ? (
                            <Cpu size={14} />
                          ) : tool.execution.primaryHost === 'browser' ? (
                            <Check size={14} />
                          ) : (
                            <Laptop size={14} />
                          )}
                          {executionLabel(tool)}
                        </span>
                      </div>
                      <p className="rock-tool-category">{tool.category}</p>
                      <h3>{tool.name}</h3>
                      <p className="rock-tool-description">
                        {tool.description}
                      </p>
                      <div className="rock-card-bottom">
                        <span>
                          {tool.origin === 'rockstaros' ? 'RockstarOS' : 'Mr.'}{' '}
                          <span>· {tool.license}</span>
                        </span>
                        <button
                          aria-label={`${tool.name}を開く`}
                          onClick={() => setSelected(tool)}
                        >
                          {tool.integration === 'fashion-brand-ops'
                            ? '接続を確認'
                            : tool.runner === 'delivery-local' ||
                                tool.runner === 'subscription-ledger'
                              ? '準備を確認'
                              : '使ってみる'}
                          <ArrowRight size={17} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              {tools.length === 0 && (
                <div className="rock-search-empty" aria-live="polite">
                  <Search size={25} />
                  <h3>条件に合うツールが見つかりません</h3>
                  <p>別の言葉で検索するか、絞り込みを解除してください。</p>
                  <button
                    className="rock-button rock-button-subtle"
                    onClick={() => {
                      setQuery('');
                      setFilter('すべて');
                    }}
                  >
                    すべてのツールを表示
                  </button>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </section>
      <div className="rock-secondary-grid">
        <Link href="/rockstaros" className="rock-os-link">
          <span className="rock-os-monogram">
            R<span>1.0</span>
          </span>
          <div>
            <span className="rock-eyebrow">THE NEXT WORKSPACE</span>
            <h2>RockstarOSを、Macの仮想端末で。</h2>
            <p>Sky・合成Wallet・Gameの操作例と、開発版の導入案内。</p>
          </div>
          <ArrowUpRight size={23} />
        </Link>
        <div className="rock-help-link">
          <CircleHelp size={23} />
          <div>
            <h2>PCで使いたいときは</h2>
            <p>接続方法と、使える6つのツールを確認。</p>
            <button onClick={() => setDeviceOpen(true)}>
              PC接続の準備を見る
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
      <details className="rock-candidates">
        <summary>
          追加のOSS導入候補を見る{' '}
          <span>
            {catalog.length - readyTools.length}件 · Skyからの実行は未対応
          </span>
        </summary>
        <div>
          {catalog
            .filter((tool) => tool.status === 'candidate')
            .map((tool) => (
              <button key={tool.id} onClick={() => setSelected(tool)}>
                <span>
                  <strong>{tool.name}</strong>
                  <span>{tool.description}</span>
                </span>
                <ArrowUpRight size={17} />
              </button>
            ))}
        </div>
      </details>
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
              <ExecutionPassport tool={selected} />
              {running && (
                <output className="rock-running-notice">
                  実行中です。結果が表示されるまで、この画面を開いたままにしてください。
                </output>
              )}
              {selected.integration === 'fashion-brand-ops' ? (
                <FashionBrandOpsRunner />
              ) : selected.runner ? (
                <MrToolRunner
                  key={selected.id}
                  tool={selected.runner}
                  onRunningChange={setRunning}
                />
              ) : null}
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
