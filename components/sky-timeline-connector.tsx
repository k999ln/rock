'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Cable } from 'lucide-react';
import { captureDeviceSession } from '@/lib/device';
import {
  listMcpConnections,
  prepareMcpTool,
  executeApprovedMcpTool,
  type McpApproval,
  type McpConnection,
} from '@/lib/mcp-hub';
import {
  parseTimelineEnvelope,
  TIMELINE_TOOL,
  TIMELINE_TTL,
  type TimelineEnvelope,
  type TimelineFeed,
} from '@/lib/sky-timeline-provider';
import { SkyXPostRows } from './sky-x-account';
import { SkyNotice } from './sky-feedback';
import styles from './sky-x-account.module.css';

export function useTimelineConnector() {
  const [servers, setServers] = useState<McpConnection[]>([]),
    [selected, setSelected] = useState(''),
    [feed, setFeed] = useState<TimelineFeed>('following'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [scanned, setScanned] = useState(false),
    [pending, setPending] = useState<{
      approval: McpApproval;
      server: string;
      name: string;
      feed: TimelineFeed;
      session: ReturnType<typeof captureDeviceSession>;
    } | null>(null),
    [received, setReceived] = useState<{
      envelope: TimelineEnvelope;
      provider: string;
    } | null>(null),
    [now, setNow] = useState(0);
  const epoch = useRef(0),
    running = useRef(false);
  const clear = () => {
    epoch.current++;
    setPending(null);
    setReceived(null);
    setError('');
  };
  useEffect(() => {
    const cancelPending = () => {
      epoch.current++;
    };
    const invalidate = () => {
      epoch.current++;
      setPending(null);
      setReceived(null);
      setServers([]);
      setSelected('');
      setScanned(false);
    };
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    window.addEventListener('loop-device', invalidate);
    window.addEventListener('sky-mcp-servers', invalidate);
    return () => {
      cancelPending();
      clearInterval(timer);
      window.removeEventListener('loop-device', invalidate);
      window.removeEventListener('sky-mcp-servers', invalidate);
    };
  }, []);
  const run = async (action: 'scan' | 'prepare' | 'execute') => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    const ticket = epoch.current;
    try {
      const session = captureDeviceSession();
      const current = () => ticket === epoch.current && session.isCurrent();
      if (action === 'scan') {
        const found = (await listMcpConnections()).filter(
          (s) =>
            s.state === 'connected' &&
            s.passport?.tools.some((t) => t.name === TIMELINE_TOOL),
        );
        if (!current()) return;
        setServers(found);
        setSelected(found[0]?.id ?? '');
        setScanned(true);
        setPending(null);
      } else if (action === 'prepare') {
        const server = servers.find((s) => s.id === selected);
        if (!server) throw Error('投稿を供給する接続先を選んでください。');
        const approval = await prepareMcpTool(server.id, TIMELINE_TOOL, {
          source: 'x',
          feed,
          limit: 10,
        });
        if (!current()) return;
        if (
          approval.server !== server.name ||
          approval.toolId !== TIMELINE_TOOL ||
          !approval.approvalRequired ||
          !approval.approvalToken ||
          !Number.isFinite(Date.parse(approval.expiresAt))
        )
          throw Error('実行確認の内容を照合できません。');
        setPending({
          approval,
          server: server.id,
          name: server.name,
          feed,
          session,
        });
      } else {
        if (
          !pending ||
          !pending.session.isCurrent() ||
          pending.server !== selected ||
          pending.feed !== feed ||
          Date.parse(pending.approval.expiresAt) <= Date.now()
        )
          throw Error(
            '接続または確認の期限が変わりました。もう一度準備してください。',
          );
        if (pending.approval.pricing.model !== 'free')
          throw Error(
            'この接続先の外部費用が未承認です。この画面では実行しません。',
          );
        const value = await executeApprovedMcpTool(
          pending.server,
          TIMELINE_TOOL,
          { source: 'x', feed: pending.feed, limit: 10 },
          pending.approval.approvalToken,
        );
        if (!current() || !pending.session.isCurrent()) return;
        const envelope = parseTimelineEnvelope(value, pending.feed);
        setNow(Date.now());
        setReceived({ envelope, provider: pending.name });
        setPending(null);
      }
    } catch (cause) {
      if (ticket === epoch.current) {
        setError(
          cause instanceof Error ? cause.message : '配信元へ接続できません。',
        );
        setPending(null);
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return {
    servers,
    selected,
    feed,
    busy,
    error,
    scanned,
    pending,
    received:
      received && received.envelope.fetchedAt + TIMELINE_TTL > now
        ? received
        : null,
    select: (id: string) => {
      clear();
      setSelected(id);
    },
    chooseFeed: (value: TimelineFeed) => {
      clear();
      setFeed(value);
    },
    clear,
    run,
  };
}
type Receiver = ReturnType<typeof useTimelineConnector>;
export function SkyTimelineConnector({ receiver }: { receiver: Receiver }) {
  const r = receiver;
  return (
    <section
      className={styles.connection}
      data-timeline-skin="x"
      aria-label="投稿ソースのAPI・MCP連携"
    >
      <header>
        <span className={styles.mark}>
          <Cable size={22} />
        </span>
        <div>
          <h2>つないだ情報が、ここに流れる。</h2>
          <p>SkyはAPI・MCPの受け皿。投稿の供給元を選べます。</p>
        </div>
      </header>
      <p>
        Skyに追加した配信元から、自分専用のストリームへ受け取ります。アカウントの接続は、利用する配信元で認可します。
      </p>
      {r.error && <SkyNotice message={r.error} className={styles.error} />}
      <div className={styles.buttons}>
        <button disabled={r.busy} onClick={() => void r.run('scan')}>
          接続済みMCPを確認
        </button>
        <Link href="/sky/network">Skyで接続先を追加</Link>
      </div>
      {r.scanned && !r.servers.length && (
        <p>
          投稿用ツールがある接続先はまだありません。Xの実投稿は取得していません。
        </p>
      )}
      {!!r.servers.length && (
        <>
          <label className={styles.field}>
            配信元
            <select
              value={r.selected}
              onChange={(e) => r.select(e.target.value)}
              disabled={r.busy}
            >
              {r.servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            受け取る投稿
            <select
              value={r.feed}
              onChange={(e) => r.chooseFeed(e.target.value as TimelineFeed)}
              disabled={r.busy}
            >
              <option value="following">フォロー中</option>
              <option value="recommended">おすすめ（接続先提供）</option>
            </select>
          </label>
          <button disabled={r.busy} onClick={() => void r.run('prepare')}>
            取得内容を確認
          </button>
        </>
      )}
      {r.pending && (
        <div className={styles.approval}>
          <strong>{r.pending.name} · 投稿を一度取得</strong>
          <p>{r.pending.approval.summary}</p>
          <p>
            提供元の料金申告: {r.pending.approval.pricing.model} ·{' '}
            {r.pending.approval.pricing.note}
          </p>
          <small>
            料金や投稿の正確性は提供元の申告です。未承認の従量課金はこの画面から実行しません。
          </small>
          <button
            disabled={r.busy || r.pending.approval.pricing.model !== 'free'}
            onClick={() => void r.run('execute')}
          >
            確認してホームへ読み込む
          </button>
        </div>
      )}
      {r.received && (
        <div className={styles.buttons}>
          <Link href="/#timeline">受け取った投稿を読む</Link>
          <button onClick={r.clear}>表示と接続先の選択を解除</button>
        </div>
      )}
      <details>
        <summary>対応する接続先と保存について</summary>
        <small>
          対応形式
          sky.timeline.v1。現在は投稿用MCPの手動取得に対応。APIは対応adapterを追加する構造です。X本人のFor
          Youそのものかは供給元での確認が必要です。受信内容はこのページのメモリだけに置き、15分で表示を止めます。
        </small>
      </details>
    </section>
  );
}
export function SkyMcpTimeline({ receiver }: { receiver: Receiver }) {
  if (!receiver.received) return null;
  const { envelope, provider } = receiver.received;
  return (
    <section
      className={styles.feed}
      aria-label="接続先から受け取った投稿"
      data-timeline-skin="x"
    >
      <header className={styles.feedHeading}>
        <div>
          <strong>
            𝕏 ·{' '}
            {envelope.feed === 'following'
              ? 'フォロー中'
              : 'おすすめ（接続先提供）'}
          </strong>
          <small>{provider}から受信 · 提供元申告</small>
        </div>
      </header>
      <SkyXPostRows posts={envelope.posts} />
      {!envelope.posts.length && (
        <p className={styles.note}>接続先から取得した投稿は0件でした。</p>
      )}
    </section>
  );
}
