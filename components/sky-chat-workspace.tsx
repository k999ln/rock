'use client';

import { useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  CheckCircle2,
  Clock3,
  Grid2X2,
  History,
  MessageCircle,
  Plus,
  Send,
  Sparkles,
} from 'lucide-react';
import { catalog, type Automation } from '@/lib/catalog';
import { routeSkyRequest, skyRoles, type SkyRole } from '@/lib/sky-routing';
import WorkspaceShell from '@/components/workspace-shell';
import {
  ExecutionSignin,
  useExecutionAccess,
} from '@/components/execution-access';
import {
  operationRequest,
  OperationRequestError,
} from '@/lib/operations-client';
import type { Job, SkyConnection } from '@/lib/operations';

type ChatEntry = {
  id: string;
  side: 'me' | 'sky';
  text: string;
  tool?: string;
};

const AUTO_MODE = 'sky-auto';
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

function jobMessage(job: Job) {
  if (job.status === 'completed') return '完了';
  if (job.status === 'failed') return '確認が必要';
  if (job.status === 'cancelled') return '停止';
  if (job.status === 'running') return '処理中';
  return '受付済み';
}

function responseFor(
  tool: Automation | null,
  routedRole: SkyRole | null,
  connectedCount: number,
) {
  if (tool)
    return `Skyが${roleFor(tool)}を選びました。必要な確認と次の操作を、このChatにまとめます。`;
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
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedToolId, setSelectedToolId] = useState(AUTO_MODE);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { needsSignin, setNeedsSignin } = useExecutionAccess();

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

  const connectedApps = useMemo(
    () => readyApps.filter((tool) => connectedTools.includes(tool.id)),
    [connectedTools],
  );
  const selectedTool =
    connectedApps.find((tool) => tool.id === selectedToolId) ?? null;
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

  function updateDraft(value: string) {
    setDraft(value);
    setError('');
  }

  function sendMessage(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;

    const routedRole = selectedTool ? null : routeSkyRequest(text);
    const routedTool = routedRole
      ? (connectedApps.find((item) => item.id === routedRole.toolId) ?? null)
      : null;
    const onlyConnectedTool =
      connectedApps.length === 1 ? connectedApps[0] : null;
    const tool = selectedTool ?? routedTool ?? onlyConnectedTool;
    const messageIndex = messages.length;
    const toolId = tool?.id;

    setDraft('');
    setError('');
    setMessages((current) => [
      ...current,
      {
        id: `chat-${messageIndex}-me`,
        side: 'me',
        text,
        tool: toolId,
      },
      {
        id: `chat-${messageIndex}-sky`,
        side: 'sky',
        text: responseFor(tool, routedRole, connectedApps.length),
        tool: toolId,
      },
    ]);
  }

  return (
    <WorkspaceShell title="Chat" contentClassName="sky-chat-page">
      <section className="sky-chat-simple" aria-label="Chatスレッド">
        <header className="sky-chat-commandbar">
          <div>
            <span>RockstarOS</span>
            <h1>Chat</h1>
          </div>
          <Link href="/sky" aria-label="Skyでアプリを見る">
            <Grid2X2 size={19} />
            <span>Sky</span>
          </Link>
        </header>

        <div className="sky-chat-mode-row" aria-label="依頼先を選ぶ">
          <button
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
            <div className="sky-chat-messages" aria-live="polite">
              <div className="sky-chat-day">今日</div>
              <div className="sky-chat-bubble is-sky sky-chat-welcome">
                <span className="sky-chat-sky-mark">
                  <Sparkles size={16} />
                </span>
                <div>
                  <strong>
                    {selectedTool ? roleFor(selectedTool) : 'Sky Auto'}
                  </strong>
                  <p>
                    {selectedTool
                      ? `${selectedTool.name}に直接頼めます。`
                      : 'やりたいことを、そのまま話してください。接続済みの役割からSkyが選びます。'}
                  </p>
                </div>
              </div>

              {messages.length === 0 && !selectedTool && (
                <div className="sky-chat-quick-requests" aria-label="依頼例">
                  {quickRequests.map((request) => (
                    <button key={request} onClick={() => updateDraft(request)}>
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
                    </div>
                  </div>
                );
              })}

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
                      <div className="sky-chat-receipt" key={job.id}>
                        {job.status === 'completed' ? (
                          <CheckCircle2 size={17} />
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
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <form className="sky-chat-composer" onSubmit={sendMessage}>
              {error && <p role="alert">{error}</p>}
              <div className="sky-chat-composer-box">
                <span className="sky-chat-composer-mode">
                  {selectedTool ? roleFor(selectedTool) : 'Auto'}
                </span>
                <input
                  value={draft}
                  onChange={(event) => updateDraft(event.target.value)}
                  aria-label={
                    selectedTool
                      ? `${roleFor(selectedTool)}への依頼`
                      : 'Skyへの依頼'
                  }
                  placeholder="何をしてほしい？"
                />
                <button disabled={!draft.trim()} aria-label="送信">
                  <Send size={18} />
                </button>
              </div>
              <small>使う役割は送信後に表示されます。</small>
            </form>
          </>
        )}
      </section>
    </WorkspaceShell>
  );
}
