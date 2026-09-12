'use client';

import {
  BriefcaseBusiness,
  Cable,
  Check,
  Cloud,
  FileCheck2,
  FilePenLine,
  Globe2,
  Laptop2,
  Network,
  PlugZap,
  Quote,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  connectMcp,
  listMcpConnections,
  type McpConnection,
} from '@/lib/mcp-hub';
import styles from '@/components/sky-mcp-center.module.css';

type View = 'setup' | 'tools';
type ConnectionTarget = 'device' | 'sky-cloud' | 'provider';

const connectionTargets = [
  {
    id: 'device',
    name: 'このPC',
    detail: 'ファイルや本文をPC内で処理',
    note: '利用可能',
    ready: true,
    recommended: true,
    Icon: Laptop2,
  },
  {
    id: 'sky-cloud',
    name: 'Sky Cloud',
    detail: '常時動くSky管理の実行先',
    note: '準備中',
    ready: false,
    recommended: false,
    Icon: Cloud,
  },
  {
    id: 'provider',
    name: '提供者のMCP',
    detail: 'OAuthで提供者へ直接接続',
    note: '準備中',
    ready: false,
    recommended: false,
    Icon: Globe2,
  },
] as const satisfies readonly {
  id: ConnectionTarget;
  name: string;
  detail: string;
  note: string;
  ready: boolean;
  recommended: boolean;
  Icon: typeof Laptop2;
}[];

const mcpTools = [
  {
    name: '案件チェック',
    id: 'coconala_check',
    detail: '依頼と提案の条件差を確認',
    Icon: BriefcaseBusiness,
  },
  {
    name: '出典整理',
    id: 'format_citations',
    detail: 'Markdownの出典を整理',
    Icon: Quote,
  },
  {
    name: '無料版記事',
    id: 'make_free_article',
    detail: '原稿から無料公開版を作成',
    Icon: FilePenLine,
  },
  {
    name: '納品照合',
    id: 'verify_delivery',
    detail: '契約・成果物・記録を照合',
    Icon: FileCheck2,
  },
] as const;

export default function SkyMcpCenter({
  open,
  connected,
  onOpenChange,
  onOpenDevice,
}: {
  open: boolean;
  connected: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenDevice: () => void;
}) {
  const [view, setView] = useState<View>('setup');
  const [target, setTarget] = useState<ConnectionTarget>('device');
  const [servers, setServers] = useState<McpConnection[]>([]);
  const [busyServer, setBusyServer] = useState('');
  const [connectionMessage, setConnectionMessage] = useState('');

  const toolCount = useMemo(
    () =>
      servers.reduce(
        (total, server) => total + (server.passport?.tools.length ?? 0),
        0,
      ),
    [servers],
  );
  const visibleServers = useMemo(
    () =>
      servers.filter((server) =>
        target === 'device'
          ? server.transport === 'stdio'
          : target === 'provider'
            ? server.transport === 'streamable_http'
            : false,
      ),
    [servers, target],
  );

  const refreshServers = useCallback(async () => {
    if (!connected) return setServers([]);
    try {
      setServers(await listMcpConnections());
    } catch {
      setServers([]);
    }
  }, [connected]);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => void refreshServers(), 0);
    return () => window.clearTimeout(timeout);
  }, [open, refreshServers]);

  async function connectServer(server: McpConnection) {
    setBusyServer(server.id);
    setConnectionMessage('');
    try {
      const passport = await connectMcp(server.id);
      setConnectionMessage(
        `${server.name}へ接続しました。${passport.tools.length}機能を確認済みです。`,
      );
      await refreshServers();
    } catch (error) {
      setConnectionMessage(
        error instanceof Error ? error.message : 'MCPへ接続できませんでした。',
      );
    } finally {
      setBusyServer('');
    }
  }

  function openDevice() {
    onOpenChange(false);
    onOpenDevice();
  }

  return (
    <>
      <section className={styles.rail} aria-label="MCP接続状態">
        <div className={styles.railIcon} aria-hidden="true">
          <Network size={20} />
        </div>
        <div className={styles.railCopy}>
          <div>
            <strong>MCP</strong>
            <span>{toolCount || 4}機能</span>
          </div>
          <p>
            {connected
              ? 'このPCで自動化を実行できます'
              : '初回だけ接続アプリを起動します'}
          </p>
        </div>
        <span
          className={`${styles.connectionStatus} ${connected ? styles.isConnected : ''}`}
        >
          <i /> {connected ? 'PC接続中' : 'PC未接続'}
        </span>
        <button
          className={styles.manageButton}
          onClick={() => onOpenChange(true)}
        >
          <PlugZap size={16} />
          {connected ? '接続・機能' : '導入する'}
        </button>
      </section>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={styles.dialog}>
          <header className={styles.dialogHeader}>
            <div className={styles.dialogTitleRow}>
              <span className={styles.dialogMark} aria-hidden="true">
                <Network size={21} />
              </span>
              <div>
                <DialogTitle>Sky MCP</DialogTitle>
                <DialogDescription>
                  自動化ごとのMCPを、共通Connectorから安全に接続します。
                </DialogDescription>
              </div>
            </div>
            <div className={styles.policyBadges}>
              <span>
                <ShieldCheck size={14} /> 入力はPC内で処理
              </span>
              <span className={connected ? styles.liveOn : styles.liveOff}>
                {connected ? 'MCP接続中' : 'MCP未接続'}
              </span>
            </div>
          </header>

          <div className={styles.tabs} role="tablist" aria-label="MCPメニュー">
            <button
              id="sky-mcp-setup-tab"
              role="tab"
              aria-controls="sky-mcp-setup-panel"
              aria-selected={view === 'setup'}
              tabIndex={view === 'setup' ? 0 : -1}
              onClick={() => setView('setup')}
            >
              導入・接続
            </button>
            <button
              id="sky-mcp-tools-tab"
              role="tab"
              aria-controls="sky-mcp-tools-panel"
              aria-selected={view === 'tools'}
              tabIndex={view === 'tools' ? 0 : -1}
              onClick={() => setView('tools')}
            >
              使える機能 <span>{toolCount || 4}</span>
            </button>
          </div>

          {view === 'setup' ? (
            <div
              id="sky-mcp-setup-panel"
              className={styles.setupView}
              role="tabpanel"
              aria-labelledby="sky-mcp-setup-tab"
            >
              <section className={styles.targetSection}>
                <div className={styles.sectionHeading}>
                  <div>
                    <strong>接続先を選ぶ</strong>
                    <p>MCPごとの推奨先をSkyが表示し、対応先だけ選べます。</p>
                  </div>
                  <span>STEP 1</span>
                </div>
                <div className={styles.targetGrid}>
                  {connectionTargets.map(
                    ({ id, name, detail, note, ready, recommended, Icon }) => {
                      const available =
                        ready ||
                        (id === 'provider' &&
                          servers.some(
                            (server) => server.transport === 'streamable_http',
                          ));
                      return (
                        <button
                          key={id}
                          type="button"
                          className={`${styles.targetCard} ${target === id ? styles.targetSelected : ''}`}
                          aria-pressed={target === id}
                          aria-disabled={!available}
                          disabled={!available}
                          onClick={() => setTarget(id)}
                        >
                          <span className={styles.targetIcon}>
                            <Icon size={19} />
                          </span>
                          <span className={styles.targetCopy}>
                            <strong>{name}</strong>
                            <small>{detail}</small>
                          </span>
                          <span
                            className={
                              available
                                ? styles.targetReady
                                : styles.targetPending
                            }
                          >
                            {recommended ? '推奨 · ' : ''}
                            {available && id === 'provider' ? '登録済み' : note}
                          </span>
                        </button>
                      );
                    },
                  )}
                </div>
              </section>

              <section className={styles.currentState}>
                <div className={connected ? styles.stateOn : styles.stateOff}>
                  {connected ? <Check size={21} /> : <Cable size={21} />}
                </div>
                <div>
                  <strong>
                    {connected ? 'このPCは接続済みです' : '3ステップで使えます'}
                  </strong>
                  <p>
                    {connected
                      ? 'Skyのツール画面から、対応する自動化を実行できます。'
                      : '追加アカウント・APIキー・有料契約は必要ありません。'}
                  </p>
                </div>
              </section>

              {connected && servers.length > 0 && (
                <section className={styles.serverSection}>
                  <div className={styles.sectionHeading}>
                    <div>
                      <strong>接続できるMCP</strong>
                      <p>
                        Connectorが登録定義を読み、安全確認後に機能を取得します。
                      </p>
                    </div>
                    <span>ONE TAP</span>
                  </div>
                  <div className={styles.serverList}>
                    {visibleServers.map((server) => (
                      <article key={server.id}>
                        <span className={styles.serverIcon} aria-hidden="true">
                          {server.transport === 'stdio' ? (
                            <Laptop2 size={18} />
                          ) : (
                            <Globe2 size={18} />
                          )}
                        </span>
                        <div>
                          <strong>{server.name}</strong>
                          <p>{server.description}</p>
                          <small>
                            {server.transport === 'stdio'
                              ? 'このPC内'
                              : 'Streamable HTTP'}
                            {server.toolCount !== null
                              ? ` · ${server.toolCount}機能を確認済み`
                              : ' · 未接続'}
                          </small>
                        </div>
                        <button
                          type="button"
                          disabled={busyServer === server.id}
                          onClick={() => void connectServer(server)}
                        >
                          {server.state === 'connected' ? (
                            <Check size={15} />
                          ) : (
                            <PlugZap size={15} />
                          )}
                          {busyServer === server.id
                            ? '確認中…'
                            : server.state === 'connected'
                              ? '再確認'
                              : '接続'}
                        </button>
                      </article>
                    ))}
                    {visibleServers.length === 0 && (
                      <p className={styles.serverEmpty}>
                        {target === 'provider'
                          ? '登録済みの外部MCPはありません。OAuthが必要な接続先は、認可対応後に表示します。'
                          : 'この接続先で利用できるMCPはありません。'}
                      </p>
                    )}
                  </div>
                  {connectionMessage && (
                    <output className={styles.connectionMessage}>
                      {connectionMessage}
                    </output>
                  )}
                </section>
              )}

              <ol className={styles.installSteps}>
                <li>
                  <span>1</span>
                  <div>
                    <strong>無料パックをダウンロード</strong>
                    <p>共通Connectorと、導入済みの2つのMCPが入っています。</p>
                  </div>
                </li>
                <li>
                  <span>2</span>
                  <div>
                    <strong>接続アプリを起動</strong>
                    <p>macOSは「Sky MCP接続.command」を開きます。</p>
                  </div>
                </li>
                <li>
                  <span>3</span>
                  <div>
                    <strong>Skyから接続を確認</strong>
                    <p>Connectorと登録済みMCPの検出まで自動で確認します。</p>
                  </div>
                </li>
              </ol>

              <button className={styles.primaryAction} onClick={openDevice}>
                <Cable size={17} />
                {connected ? 'このPCの接続を確認' : 'このPCへの接続をはじめる'}
              </button>

              <p className={styles.boundaryNote}>
                登録済みのstdio MCPとStreamable HTTP
                MCPに対応します。秘密情報はSkyへ渡さず、OAuthが必要な接続先は権限確認と接続証跡が揃うまで実行できません。
              </p>
            </div>
          ) : (
            <div
              id="sky-mcp-tools-panel"
              className={styles.toolsView}
              role="tabpanel"
              aria-labelledby="sky-mcp-tools-tab"
            >
              <div className={styles.toolList}>
                {(servers.length
                  ? servers.flatMap((server) =>
                      (server.passport?.tools ?? []).map((tool) => ({
                        name: tool.title || tool.name,
                        id: `${server.id}/${tool.name}`,
                        detail: tool.description || `${server.name}の機能`,
                        Icon: PlugZap,
                      })),
                    )
                  : mcpTools
                ).map(({ name, id, detail, Icon }) => (
                  <article key={id}>
                    <span className={styles.toolIcon} aria-hidden="true">
                      <Icon size={18} />
                    </span>
                    <div>
                      <strong>{name}</strong>
                      <p>{detail}</p>
                    </div>
                    <code>{id}</code>
                  </article>
                ))}
              </div>
              <div className={styles.toolFooter}>
                <p>
                  機能の注釈は未信頼として扱い、外部作用は内容に結び付いた1回限りの承認後に実行します。
                </p>
                <button onClick={openDevice}>
                  <Cable size={16} />
                  {connected ? '接続を確認' : 'PCを接続'}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
