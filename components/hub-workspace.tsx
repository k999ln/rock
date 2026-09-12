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
  FileCheck2,
  FilePenLine,
  Laptop,
  Link2,
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
import WorkspaceShell from '@/components/workspace-shell';

const readyTools = catalog.filter((tool) => tool.status === 'ready');
const recommended = readyTools.find((tool) => tool.id === 'mr-citations')!;
const icons = {
  coconala: BriefcaseBusiness,
  'mr-free-article': FilePenLine,
  'mr-citations': BookOpenCheck,
  'mr-delivery': FileCheck2,
  'rockstar-ledger': WalletCards,
};
const filters = [
  'すべて',
  '記事制作',
  '案件・納品支援',
  '経費・契約管理',
] as const;

export default function HubWorkspace() {
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
      title="自動化Hub"
      onConnect={() => setDeviceOpen(true)}
    >
      <div className="rock-page-heading">
        <div>
          <p className="rock-eyebrow">YOUR AUTOMATION HUB</p>
          <h1>次の仕事を、ここから。</h1>
          <p>ツールを選んで、小さな作業をひとつ片づけよう。</p>
        </div>
        <Link href="/work" className="rock-button rock-button-dark">
          仕事を進める
          <ArrowRight size={17} />
        </Link>
      </div>
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
      <section className="rock-tool-section" aria-labelledby="tools-title">
        <div className="rock-section-heading">
          <div>
            <h2 id="tools-title">
              使えるツール<span>{readyTools.length}</span>
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
                          {tool.runner === 'delivery-local' ||
                          tool.runner === 'subscription-ledger' ? (
                            <Laptop size={14} />
                          ) : (
                            <Check size={14} />
                          )}
                          {tool.runner === 'delivery-local' ||
                          tool.runner === 'subscription-ledger'
                            ? 'PCで実行'
                            : 'ブラウザで実行'}
                        </span>
                      </div>
                      <p className="rock-tool-category">{tool.category}</p>
                      <h3>{tool.name}</h3>
                      <p className="rock-tool-description">
                        {tool.description}
                      </p>
                      <div className="rock-card-bottom">
                        <span>
                          {tool.origin === 'mr' ? 'Mr.' : 'RockstarOS'}{' '}
                          <span>· {tool.license}</span>
                        </span>
                        <button
                          aria-label={`${tool.name}を開く`}
                          onClick={() => setSelected(tool)}
                        >
                          {tool.runner === 'delivery-local' ||
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
            <p>Hub・合成Wallet・Gameの操作例と、開発版の導入案内。</p>
          </div>
          <ArrowUpRight size={23} />
        </Link>
        <div className="rock-help-link">
          <CircleHelp size={23} />
          <div>
            <h2>PCで使いたいときは</h2>
            <p>接続方法と、使える4つのツールを確認。</p>
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
            {catalog.length - readyTools.length}件 · Hubからの実行は未対応
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
