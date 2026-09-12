'use client';
/* oxlint-disable next/no-html-link-for-pages -- Sites sign-in is a top-level gateway route. */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Cable,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import WorkspaceShell from '@/components/workspace-shell';
import { JobHistory, OperationsPanel } from '@/components/operations-panel';
import type { OperationsSnapshot } from '@/lib/operations';
import type { FundSnapshot } from '@/lib/fund';
import { catalog } from '@/lib/catalog';
import { MrToolRunner } from '@/components/mr-tool-runner';
import { DeviceConnection } from '@/components/device-connection';
import { ValueSpendPanel } from '@/components/value-spend-panel';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

type View = 'wallet' | 'activity' | 'settings';
const titles = {
  wallet: 'Wallet',
  activity: 'ツールの実行履歴',
  settings: '接続・利用設定',
};
async function readOperations(view: View, signal: AbortSignal) {
  const response = await fetch('/api/operations', {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) {
    const body = (await response.json()) as { error?: string };
    return {
      data: null,
      legacy: [],
      needsSignin: response.status === 401,
      error: body.error ?? '読み込めませんでした。再読込してください。',
    };
  }
  const data = (await response.json()) as OperationsSnapshot;
  let legacy: FundSnapshot['runs'] = [];
  if (view === 'activity') {
    const history = await fetch('/api/fund', { cache: 'no-store', signal });
    if (!history.ok)
      throw new Error('過去の履歴を読み込めませんでした。再読込してください。');
    legacy = ((await history.json()) as FundSnapshot).runs;
  }
  return { data, legacy, needsSignin: false, error: '' };
}
export default function OperationsWorkspace({ view }: { view: View }) {
  const [data, setData] = useState<OperationsSnapshot | null>(null);
  const [legacy, setLegacy] = useState<FundSnapshot['runs']>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [needsSignin, setNeedsSignin] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [deviceOpen, setDeviceOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const selected = catalog.find((tool) => tool.id === selectedId);
  const requestSequence = useRef<object>({});
  const applyResult = useCallback(
    (result: Awaited<ReturnType<typeof readOperations>>) => {
      setData(result.data);
      setLegacy(result.legacy);
      setNeedsSignin(result.needsSignin);
      setError(result.error);
      setLoading(false);
    },
    [],
  );
  const refresh = useCallback(async () => {
    const sequence = {};
    requestSequence.current = sequence;
    try {
      const result = await readOperations(view, AbortSignal.timeout(10000));
      if (sequence === requestSequence.current) applyResult(result);
    } catch (reason) {
      if (sequence === requestSequence.current)
        applyResult({
          data: null,
          legacy: [],
          needsSignin: false,
          error:
            reason instanceof Error ? reason.message : '読み込めませんでした。',
        });
    }
  }, [view, applyResult]);
  useEffect(() => {
    const controller = new AbortController();
    const sequence = {};
    requestSequence.current = sequence;
    void readOperations(
      view,
      AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
    )
      .then((result) => {
        if (sequence === requestSequence.current) applyResult(result);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted && sequence === requestSequence.current)
          applyResult({
            data: null,
            legacy: [],
            needsSignin: false,
            error:
              reason instanceof Error
                ? reason.message
                : '読み込めませんでした。',
          });
      });
    const updated = () => {
      void refresh();
    };
    window.addEventListener('loop-fund-refresh', updated);
    return () => {
      controller.abort();
      requestSequence.current = {};
      window.removeEventListener('loop-fund-refresh', updated);
    };
  }, [view, refresh, applyResult]);
  const returnTo =
    view === 'activity'
      ? '/activity'
      : view === 'wallet'
        ? '/wallet'
        : '/settings';
  return (
    <WorkspaceShell
      running={running}
      title={titles[view]}
      onConnect={() => setDeviceOpen(true)}
    >
      <div className="rock-page-heading">
        <div>
          <p className="rock-eyebrow">
            {view === 'wallet'
              ? 'YOUR MONEY, CLEARLY'
              : view === 'activity'
                ? 'ACTIVITY'
                : 'CONNECTIONS & CONTROLS'}
          </p>
          <h1>{view === 'wallet' ? '価値を、安心して動かす。' : titles[view]}</h1>
          <p>
            {view === 'wallet'
              ? '資産を分けて管理し、使うときは必ず安全な経路へ。'
              : view === 'activity'
                ? 'いつ、どこで、何を実行したか確認できます。'
                : 'PCの接続と、ツールごとの利用状態を管理。'}
          </p>
        </div>
        <button
          className="rock-button rock-button-subtle"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            void refresh();
          }}
        >
          <RefreshCw size={16} />
          {loading ? '読み込み中' : '再読込'}
        </button>
      </div>
      {view === 'activity' && (
        <nav className="rock-view-nav" aria-label="仕事と履歴">
          <Link href="/work">手順のある仕事</Link>
          <Link href="/activity" aria-current="page">
            ツールの実行履歴
          </Link>
        </nav>
      )}
      {view === 'wallet' && <ValueSpendPanel />}
      {view === 'wallet' && (
        <section className="rock-wallet-boundary">
          <span className="rock-wallet-symbol">
            <Wallet size={30} strokeWidth={1.5} />
          </span>
          <div>
            <h2>手入力の収支記録も、そのまま残しています。</h2>
            <p>
              従来の売上・経費は下に表示します。金融サービスとの自動照合・入金・出金にはまだ対応していません。
            </p>
            <span>
              <ShieldCheck size={15} />
              この画面から請求・送金は行われません
            </span>
          </div>
        </section>
      )}
      {error && (
        <div className="rock-service-notice" role="alert">
          <strong>
            {needsSignin
              ? 'サインインして、自分の記録を開く'
              : '記録を読み込めませんでした'}
          </strong>
          <p>{error}</p>
          {needsSignin && (
            <a
              href={`/signin-with-chatgpt?return_to=${returnTo}`}
              target="_top"
              className="rock-button rock-button-dark"
            >
              サインイン
              <ArrowRight size={16} />
            </a>
          )}
        </div>
      )}
      {loading && !data && !error && (
        <output className="rock-loading">自分の記録を読み込んでいます…</output>
      )}
      {data &&
        (view === 'activity' ? (
          <JobHistory
            data={data}
            legacy={legacy}
            refresh={refresh}
            openTool={setSelectedId}
          />
        ) : (
          <OperationsPanel data={data} refresh={refresh} view={view} />
        ))}
      {view === 'wallet' && (
        <div className="rock-wallet-links">
          <Link href="/fund">
            保存済みのファンド・費用試算
            <ArrowRight size={16} />
          </Link>
          <Link href="/rockstaros#game-title">
            OSの合成Wallet・Gameを知る
            <ArrowRight size={16} />
          </Link>
        </div>
      )}
      {view === 'settings' && (
        <button
          className="rock-button rock-button-subtle"
          onClick={() => setDeviceOpen(true)}
        >
          <Cable size={18} />
          PC接続の準備を見る
        </button>
      )}
      <Dialog
        open={!!selected?.runner}
        onOpenChange={(open) => {
          if (!open && !running) setSelectedId('');
        }}
      >
        <DialogContent className="rock-tool-dialog">
          <DialogTitle className="rock-dialog-title">
            {selected?.name}
          </DialogTitle>
          <DialogDescription>{selected?.description}</DialogDescription>
          {running && (
            <output className="rock-running-notice">
              実行中です。結果が表示されるまで、この画面を開いたままにしてください。
            </output>
          )}
          {selected?.runner && (
            <MrToolRunner
              key={selected.id}
              tool={selected.runner}
              onRunningChange={setRunning}
            />
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
