'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type SyntheticEvent,
} from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Ban,
  Bot,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Grid2X2,
  History,
  House,
  LoaderCircle,
  MessageCircle,
  Plus,
  Send,
  Sparkles,
} from 'lucide-react';
import { catalog, type Automation } from '@/lib/catalog';
import { fashionMcpConnected } from '@/lib/fashion-mcp-client';
import { routeSkyRequest, skyRoles, type SkyRole } from '@/lib/sky-routing';
import WorkspaceShell from '@/components/workspace-shell';
import { MrToolRunner } from '@/components/mr-tool-runner';
import { FashionBrandOpsRunner } from '@/components/fashion-brand-ops-runner';
import { McpBotRunner } from '@/components/mcp-bot-runner';
import {
  ExecutionSignin,
  useExecutionAccess,
} from '@/components/execution-access';
import {
  operationRequest,
  OperationRequestError,
} from '@/lib/operations-client';
import type { Job, SkyConnection } from '@/lib/operations';
import { deviceToken } from '@/lib/device';
import {
  listMcpConnections,
  type McpConnection,
} from '@/lib/mcp-hub';

type ChatEntry = {
  id: string;
  side: 'me' | 'sky';
  text: string;
  tool?: string;
  suggestedTool?: string;
};

type ActiveRequest = {
  id: string;
  text: string;
  toolId: string;
};

type WorkflowStatus = 'ready' | 'running' | 'completed' | 'failed';

const AUTO_MODE = 'sky-auto';
const MCP_PREFIX = 'mcp:';
const readyApps = catalog.filter(
  (tool) => tool.status === 'ready' && tool.runner !== 'delivery-local',
);
const quickRequests = [
  '案件を見て',
  '記事を整えて',
  '法律の相談',
  '特許を調べて',
];

function roleFor(tool: Automation) {
  return skyRoles.find((role) => role.toolId === tool.id)?.label ?? 'Skyアプリ';
}

function markFor(tool: Automation) {
  return roleFor(tool).slice(0, 1);
}

function mcpMode(serverId: string) {
  return `${MCP_PREFIX}${serverId}`;
}

function jobMessage(job: Job) {
  if (job.status === 'completed') return '完了';
  if (job.status === 'failed' || job.status === 'interrupted')
    return '確認が必要';
  if (job.status === 'cancelled') return '停止';
  if (job.status === 'running') return '処理中';
  return '受付済み';
}

function jobStateClass(job: Job) {
  if (job.status === 'completed') return 'is-completed';
  if (job.status === 'failed' || job.status === 'interrupted')
    return 'is-attention';
  if (job.status === 'cancelled') return 'is-cancelled';
  if (job.status === 'running') return 'is-running';
  return 'is-queued';
}

function responseFor(
  tool: Automation | null,
  routedRole: SkyRole | null,
  connectedCount: number,
) {
  if (tool)
    return `${roleFor(tool)}で進めます。下の処理カードで必要な入力を確認し、そのまま実行できます。`;
  if (routedRole)
    return `${routedRole.label}はまだ接続されていません。Skyで接続すると、次からはここで頼めます。`;
  if (connectedCount === 0)
    return '使えるアプリがまだありません。Skyでひとつ接続すれば、次からはここに話すだけです。';
  return '目的をもう少しだけ教えてください。「案件」「記事」「出典」「法律」「特許」のように一言足すと、自動で選べます。';
}

export default function SkyChatWorkspace() {
  const searchParams = useSearchParams();
  const preferredTool = searchParams.get('tool') ?? '';
  const [connectedTools, setConnectedTools] = useState<string[]>([]);
  const [fashionConnected, setFashionConnected] = useState(false);
  const [mcpServers, setMcpServers] = useState<McpConnection[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedToolId, setSelectedToolId] = useState(AUTO_MODE);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [activeRequest, setActiveRequest] = useState<ActiveRequest | null>(
    null,
  );
  const [running, setRunning] = useState(false);
  const [workflowStatus, setWorkflowStatus] =
    useState<WorkflowStatus>('ready');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { needsSignin, setNeedsSignin } = useExecutionAccess();
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const nextMessageIdRef = useRef(0);

  useEffect(() => {
    let active = true;
    void Promise.all([
      operationRequest<SkyConnection[]>('/api/sky/connections'),
      operationRequest<Job[]>('/api/jobs'),
    ])
      .then(([connections, recentJobs]) => {
        if (!active) return;
        const ids = connections.map(({ tool }) => tool);
        const preferred = connections.find(
          ({ tool }) => tool === preferredTool,
        )?.tool;
        setConnectedTools(ids);
        setJobs(recentJobs);
        setSelectedToolId(preferred ?? AUTO_MODE);
      })
      .catch((reason) => {
        if (!active) return;
        if (reason instanceof OperationRequestError && reason.status === 401)
          setNeedsSignin(true);
        else
          setError(
            reason instanceof Error
              ? reason.message
              : 'Chatを読み込めませんでした。',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [preferredTool, setNeedsSignin]);

  useEffect(() => {
    const update = () => setFashionConnected(fashionMcpConnected());
    update();
    window.addEventListener('sky-fashion-mcp', update);
    return () => window.removeEventListener('sky-fashion-mcp', update);
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (!deviceToken()) {
        if (active) setMcpServers([]);
        return;
      }
      void listMcpConnections()
        .then((servers) => {
          if (active) setMcpServers(servers);
        })
        .catch(() => {
          if (active) setMcpServers([]);
        });
    };
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('loop-device', refresh);
    window.addEventListener('sky-mcp-servers', refresh);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
      window.removeEventListener('loop-device', refresh);
      window.removeEventListener('sky-mcp-servers', refresh);
    };
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    messagesEndRef.current?.scrollIntoView({
      block: 'nearest',
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }, [messages]);

  const connectedApps = useMemo(
    () =>
      readyApps.filter(
        (tool) =>
          connectedTools.includes(tool.id) ||
          (tool.integration === 'fashion-brand-ops' && fashionConnected),
      ),
    [connectedTools, fashionConnected],
  );
  const connectedMcpServers = useMemo(
    () =>
      mcpServers.filter(
        (server) => server.state === 'connected' && server.passport,
      ),
    [mcpServers],
  );
  const selectedTool =
    connectedApps.find((tool) => tool.id === selectedToolId) ?? null;
  const selectedMcpServer =
    connectedMcpServers.find(
      (server) => mcpMode(server.id) === selectedToolId,
    ) ?? null;
  const activeTool = activeRequest
    ? (connectedApps.find((tool) => tool.id === activeRequest.toolId) ?? null)
    : null;
  const activeMcpServer = activeRequest
    ? (connectedMcpServers.find(
        (server) => mcpMode(server.id) === activeRequest.toolId,
      ) ?? null)
    : null;
  const visibleJobs = jobs
    .filter((job) =>
      selectedTool
        ? job.tool === selectedTool.id
        : connectedTools.includes(job.tool),
    )
    .slice(0, 3);

  function chooseMode(toolId: string) {
    setSelectedToolId(toolId);
    setError('');
  }

  function directBot(toolId: string) {
    chooseMode(toolId);
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  function refreshConnectedMcp() {
    if (!deviceToken()) return setMcpServers([]);
    void listMcpConnections()
      .then(setMcpServers)
      .catch(() => setMcpServers([]));
  }

  function updateDraft(value: string) {
    setDraft(value);
    setError('');
  }

  function chooseQuickRequest(value: string) {
    updateDraft(value);
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  function sendMessage(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;

    const onlyConnectedMcp =
      !selectedTool &&
      !selectedMcpServer &&
      connectedApps.length === 0 &&
      connectedMcpServers.length === 1
        ? connectedMcpServers[0]
        : null;
    const targetMcp = selectedMcpServer ?? onlyConnectedMcp;
    const routedRole = selectedTool || targetMcp ? null : routeSkyRequest(text);
    const routedTool = routedRole
      ? (connectedApps.find((item) => item.id === routedRole.toolId) ?? null)
      : null;
    const onlyConnectedTool =
      connectedApps.length === 1 && connectedMcpServers.length === 0
        ? connectedApps[0]
        : null;
    const tool = selectedTool ?? routedTool ?? onlyConnectedTool;
    const toolId = targetMcp ? mcpMode(targetMcp.id) : tool?.id;
    const suggestedToolId = routedRole?.toolId;
    const id = `chat-${nextMessageIdRef.current++}`;

    setDraft('');
    setError('');
    setMessages((current) => [
      ...current,
      {
        id: `${id}-me`,
        side: 'me',
        text,
        tool: toolId,
      },
      {
        id: `${id}-sky`,
        side: 'sky',
        text: targetMcp
          ? `${targetMcp.name}への方向を受け取りました。下の管理カードで機能と引数を確認し、1回ごとに承認して実行できます。`
          : responseFor(
              tool,
              routedRole,
              connectedApps.length + connectedMcpServers.length,
            ),
        tool: toolId,
        suggestedTool: tool ? undefined : suggestedToolId,
      },
    ]);
    if (toolId) {
      setWorkflowStatus('ready');
      setActiveRequest({ id, text, toolId });
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    )
      return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <WorkspaceShell
      title="Chat"
      contentClassName="sky-chat-page"
      running={running}
    >
      <section className="sky-chat-simple" aria-label="Chatスレッド">
        <header className="sky-chat-commandbar">
          <div>
            <span>RockstarOS</span>
            <h1>Chat</h1>
          </div>
          <nav aria-label="Chatナビゲーション">
            <Link href="/" aria-label="ホームへ戻る">
              <House size={18} />
              <span>ホーム</span>
            </Link>
            <Link href="/sky" aria-label="Skyでアプリを見る">
              <Grid2X2 size={19} />
              <span>Sky</span>
            </Link>
          </nav>
        </header>

        <div className="sky-chat-mode-row" aria-label="依頼先を選ぶ">
          <button
            type="button"
            aria-pressed={selectedToolId === AUTO_MODE}
            className={selectedToolId === AUTO_MODE ? 'is-selected' : ''}
            onClick={() => chooseMode(AUTO_MODE)}
          >
            <span className="sky-chat-auto-mark">
              <Sparkles size={16} />
            </span>
            <span>
              <strong>Sky Auto</strong>
              <small>内容から自動で選ぶ</small>
            </span>
          </button>
          {connectedApps.map((tool) => (
            <button
              type="button"
              aria-pressed={selectedToolId === tool.id}
              key={tool.id}
              className={selectedToolId === tool.id ? 'is-selected' : ''}
              onClick={() => chooseMode(tool.id)}
            >
              <span className={`sky-chat-app-mark rock-icon-${tool.color}`}>
                {markFor(tool)}
              </span>
              <span>
                <strong>{roleFor(tool)}</strong>
                <small>{tool.name}</small>
              </span>
            </button>
          ))}
          <Link href="/sky" className="sky-chat-add-compact">
            <Plus size={17} />
            <span>追加</span>
          </Link>
        </div>

        {needsSignin ? (
          <div className="sky-chat-centered">
            <ExecutionSignin />
          </div>
        ) : loading ? (
          <div className="sky-chat-centered">Chatを読み込んでいます…</div>
        ) : (
          <>
            <div
              className="sky-chat-messages"
              role="log"
              aria-live="polite"
              aria-relevant="additions"
            >
              <div className="sky-chat-day">今日</div>
              <div className="sky-chat-bubble is-sky sky-chat-welcome">
                <span className="sky-chat-sky-mark">
                  <Sparkles size={16} />
                </span>
                <div>
                  <strong>
                    {selectedTool
                      ? roleFor(selectedTool)
                      : selectedMcpServer
                        ? selectedMcpServer.name
                        : 'Sky Auto'}
                  </strong>
                  <p>
                    {selectedTool
                      ? `${selectedTool.name}に直接頼めます。`
                      : selectedMcpServer
                        ? `${selectedMcpServer.passport?.tools.length ?? 0}機能を持つMCP botへ指示できます。`
                      : 'やりたいことを、そのまま話してください。接続済みの役割からSkyが選びます。'}
                  </p>
                  <small>
                    {connectedApps.length + connectedMcpServers.length > 0
                      ? `${connectedApps.length + connectedMcpServers.length}個のbotに接続済み`
                      : 'まだ役割に接続されていません'}
                  </small>
                </div>
              </div>

              {(connectedApps.length > 0 || connectedMcpServers.length > 0) && (
                <section className="sky-chat-bot-board" aria-label="接続中のMCP bot">
                  <header>
                    <div>
                      <small>BOT CONTROL</small>
                      <h2>接続中のbot</h2>
                    </div>
                    <span>
                      <i /> {connectedApps.length + connectedMcpServers.length} online
                    </span>
                  </header>
                  <div className="sky-chat-bot-grid">
                    {connectedApps.map((tool) => {
                      const latest = jobs.find((job) => job.tool === tool.id);
                      return (
                        <button
                          type="button"
                          key={`bot-${tool.id}`}
                          className={selectedToolId === tool.id ? 'is-selected' : ''}
                          onClick={() => directBot(tool.id)}
                        >
                          <span className={`sky-chat-bot-mark rock-icon-${tool.color}`}>
                            {markFor(tool)}
                          </span>
                          <span>
                            <strong>{roleFor(tool)}</strong>
                            <small>{latest ? jobMessage(latest) : '待機中'} · 指示する</small>
                          </span>
                          <i className={latest ? jobStateClass(latest) : 'is-online'} />
                        </button>
                      );
                    })}
                    {connectedMcpServers.map((server) => (
                      <button
                        type="button"
                        key={`mcp-bot-${server.id}`}
                        className={selectedToolId === mcpMode(server.id) ? 'is-selected' : ''}
                        onClick={() => directBot(mcpMode(server.id))}
                      >
                        <span className="sky-chat-bot-mark is-mcp">
                          <Bot size={17} />
                        </span>
                        <span>
                          <strong>{server.name}</strong>
                          <small>{server.passport?.tools.length ?? 0}機能 · 管理する</small>
                        </span>
                        <i className="is-online" />
                      </button>
                    ))}
                  </div>
                  <p>
                    botを選んで方向を伝えます。停止・失敗・結果はこのスレッドで確認できます。
                  </p>
                </section>
              )}

              {messages.length === 0 && !selectedTool && (
                <div className="sky-chat-quick-requests" aria-label="依頼例">
                  {quickRequests.map((request) => (
                    <button
                      type="button"
                      key={request}
                      onClick={() => chooseQuickRequest(request)}
                    >
                      {request}
                    </button>
                  ))}
                </div>
              )}

              {messages.map((message) => {
                const messageTool = connectedApps.find(
                  (tool) => tool.id === message.tool,
                );
                return (
                  <div
                    className={`sky-chat-bubble is-${message.side}`}
                    key={message.id}
                  >
                    {message.side === 'sky' && (
                      <MessageCircle size={16} aria-hidden="true" />
                    )}
                    <div>
                      {message.side === 'sky' && messageTool && (
                        <small>{roleFor(messageTool)}</small>
                      )}
                      <p>{message.text}</p>
                      {message.side === 'sky' && message.suggestedTool && (
                        <Link className="sky-chat-inline-action" href="/">
                          Skyで接続する
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}

              {activeRequest && (activeTool || activeMcpServer) && (
                <section
                  className="sky-chat-workflow"
                  aria-labelledby={`workflow-${activeRequest.id}`}
                >
                  <header>
                    <span className="sky-chat-workflow-orb">
                      <Sparkles size={18} />
                    </span>
                    <div>
                      <small>ACTIVE TASK</small>
                      <h2 id={`workflow-${activeRequest.id}`}>
                        {activeTool ? roleFor(activeTool) : activeMcpServer?.name}
                        が処理します
                      </h2>
                    </div>
                    <span className={`is-${workflowStatus}`}>
                      {workflowStatus === 'running'
                        ? '処理中'
                        : workflowStatus === 'completed'
                          ? '結果あり'
                          : workflowStatus === 'failed'
                            ? '要確認'
                            : '入力待ち'}
                    </span>
                  </header>
                  <blockquote>{activeRequest.text}</blockquote>
                  <ol className="sky-chat-workflow-steps" aria-label="処理の流れ">
                    <li className="is-done">
                      <CheckCircle2 size={16} />
                      担当を選択
                    </li>
                    <li
                      className={
                        workflowStatus === 'ready' ? 'is-current' : 'is-done'
                      }
                    >
                      <span>2</span>
                      入力を確認
                    </li>
                    <li
                      className={
                        workflowStatus === 'running'
                          ? 'is-current'
                          : workflowStatus === 'completed'
                            ? 'is-done'
                            : workflowStatus === 'failed'
                              ? 'is-attention'
                              : ''
                      }
                    >
                      <span>3</span>
                      実行・結果
                    </li>
                    <li
                      className={
                        workflowStatus === 'completed' ? 'is-done' : ''
                      }
                    >
                      <span>4</span>
                      {activeMcpServer ? 'Chatで結果管理' : '履歴へ保存'}
                    </li>
                  </ol>
                  <div className="sky-chat-workflow-body">
                    {activeTool?.runner ? (
                      <MrToolRunner
                        key={activeRequest.id}
                        tool={activeTool.runner}
                        onRunningChange={(value) => {
                          setRunning(value);
                          setWorkflowStatus((current) =>
                            value
                              ? 'running'
                              : current === 'running'
                                ? 'ready'
                                : current,
                          );
                        }}
                        onRecord={(_tool, _transport, status) => {
                          setWorkflowStatus(status);
                          return Promise.resolve();
                        }}
                      />
                    ) : activeTool?.integration === 'fashion-brand-ops' ? (
                      <FashionBrandOpsRunner />
                    ) : activeMcpServer ? (
                      <McpBotRunner
                        key={`${activeRequest.id}-${activeMcpServer.id}`}
                        server={activeMcpServer}
                        request={activeRequest.text}
                        onRunningChange={setRunning}
                        onStatusChange={setWorkflowStatus}
                        onDisconnected={() => {
                          setActiveRequest(null);
                          setSelectedToolId(AUTO_MODE);
                          refreshConnectedMcp();
                          setMessages((current) => [
                            ...current,
                            {
                              id: `chat-${nextMessageIdRef.current++}-sky`,
                              side: 'sky',
                              text: `${activeMcpServer.name}を停止しました。再接続するとbot一覧へ戻ります。`,
                            },
                          ]);
                        }}
                      />
                    ) : (
                      <p>
                        この担当の実行画面は準備中です。接続状態と対応環境をSkyで確認してください。
                      </p>
                    )}
                  </div>
                </section>
              )}

              {visibleJobs.length > 0 && (
                <div className="sky-chat-recent">
                  <div className="sky-chat-recent-title">
                    <span>最近の処理</span>
                    <Link href="/activity">
                      <History size={14} /> すべて見る
                    </Link>
                  </div>
                  {visibleJobs.map((job) => {
                    const jobTool = readyApps.find(
                      (tool) => tool.id === job.tool,
                    );
                    return (
                      <Link
                        className={`sky-chat-receipt ${jobStateClass(job)}`}
                        href="/activity"
                        key={job.id}
                        aria-label={`${jobMessage(job)}、履歴を開く`}
                      >
                        {job.status === 'completed' ? (
                          <CheckCircle2 size={17} />
                        ) : job.status === 'failed' ||
                          job.status === 'interrupted' ? (
                          <CircleAlert size={17} />
                        ) : job.status === 'cancelled' ? (
                          <Ban size={17} />
                        ) : job.status === 'running' ? (
                          <LoaderCircle className="sky-chat-spin" size={17} />
                        ) : (
                          <Clock3 size={17} />
                        )}
                        <div>
                          <strong>{jobMessage(job)}</strong>
                          <span>
                            {jobTool ? roleFor(jobTool) : 'Sky'} ·{' '}
                            {new Date(job.createdAt).toLocaleString('ja-JP')}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
              <div ref={messagesEndRef} aria-hidden="true" />
            </div>

            <form className="sky-chat-composer" onSubmit={sendMessage}>
              {error && <p role="alert">{error}</p>}
              <div className="sky-chat-composer-box">
                <span className="sky-chat-composer-mode">
                  {selectedTool
                    ? roleFor(selectedTool)
                    : selectedMcpServer
                      ? selectedMcpServer.name
                      : 'Auto'}
                </span>
                <textarea
                  ref={composerRef}
                  value={draft}
                  onChange={(event) => updateDraft(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  rows={1}
                  maxLength={2000}
                  aria-describedby="sky-chat-composer-help"
                  aria-label={
                    selectedTool
                      ? `${roleFor(selectedTool)}への依頼`
                      : selectedMcpServer
                        ? `${selectedMcpServer.name}への指示`
                      : 'Skyへの依頼'
                  }
                  placeholder="何をしてほしい？"
                />
                <button disabled={!draft.trim()} aria-label="送信">
                  <Send size={18} />
                </button>
              </div>
              <div className="sky-chat-composer-help" id="sky-chat-composer-help">
                <small>Enterで送信 · Shift+Enterで改行</small>
                <small>{draft.length}/2000</small>
              </div>
            </form>
          </>
        )}
      </section>
    </WorkspaceShell>
  );
}
