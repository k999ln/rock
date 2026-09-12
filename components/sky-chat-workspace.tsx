'use client';

import { useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Grid2X2,
  MessageCircle,
  Plus,
  Send,
} from 'lucide-react';
import { catalog, type Automation } from '@/lib/catalog';
import { routeSkyRequest, skyRoles } from '@/lib/sky-routing';
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
  tool: string;
};

const readyApps = catalog.filter(
  (tool) => tool.status === 'ready' && tool.runner !== 'delivery-local',
);

function roleFor(tool: Automation) {
  return skyRoles.find((role) => role.toolId === tool.id)?.label ?? 'Skyアプリ';
}

function markFor(tool: Automation) {
  return roleFor(tool).slice(0, 1);
}

function jobMessage(job: Job) {
  if (job.status === 'completed') return '処理が完了しました';
  if (job.status === 'failed') return '処理できませんでした';
  if (job.status === 'cancelled') return '処理を停止しました';
  if (job.status === 'running') return '処理中です';
  return '処理を受け付けました';
}

export default function SkyChatWorkspace() {
  const searchParams = useSearchParams();
  const preferredTool = searchParams.get('tool') ?? '';
  const [connectedTools, setConnectedTools] = useState<string[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedToolId, setSelectedToolId] = useState('');
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
        setSelectedToolId(preferred ?? ids[0] ?? '');
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
  const selectedJobs = jobs
    .filter((job) => job.tool === selectedTool?.id)
    .slice(0, 4);
  const selectedMessages = messages.filter(
    (message) => message.tool === selectedTool?.id,
  );

  function sendMessage(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    let tool = selectedTool;
    if (!tool) {
      const routed = routeSkyRequest(text);
      tool = routed
        ? (connectedApps.find((item) => item.id === routed.toolId) ?? null)
        : null;
    }
    if (!tool) {
      setError('先にSkyでアプリを接続してください。');
      return;
    }
    const messageIndex = messages.length;
    setDraft('');
    setError('');
    setSelectedToolId(tool.id);
    setMessages((current) => [
      ...current,
      { id: `${tool.id}-${messageIndex}-me`, side: 'me', text, tool: tool.id },
      {
        id: `${tool.id}-${messageIndex}-sky`,
        side: 'sky',
        text: `${roleFor(tool)}が受け取りました。確認・処理状況・完了通知は、このChatにまとめます。`,
        tool: tool.id,
      },
    ]);
  }

  return (
    <WorkspaceShell title="Chat" contentClassName="sky-chat-page">
      <div className="sky-chat-layout">
        <aside className="sky-chat-app-picker" aria-label="接続済みアプリ">
          <header>
            <div>
              <span>RockstarOS</span>
              <h1>Chat</h1>
            </div>
            <Link href="/" aria-label="Skyを開く">
              <Grid2X2 size={19} />
            </Link>
          </header>
          <div className="sky-chat-app-list">
            {connectedApps.map((tool) => (
              <button
                key={tool.id}
                className={selectedToolId === tool.id ? 'is-selected' : ''}
                onClick={() => {
                  setSelectedToolId(tool.id);
                  setError('');
                }}
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
            <Link href="/" className="sky-chat-add-app">
              <span>
                <Plus size={18} />
              </span>
              <strong>Skyから追加</strong>
            </Link>
          </div>
        </aside>

        <section className="sky-chat-thread" aria-label="Chatスレッド">
          {needsSignin ? (
            <div className="sky-chat-centered">
              <ExecutionSignin />
            </div>
          ) : loading ? (
            <div className="sky-chat-centered">Chatを読み込んでいます…</div>
          ) : selectedTool ? (
            <>
              <header className="sky-chat-thread-header">
                <span
                  className={`sky-chat-app-mark rock-icon-${selectedTool.color}`}
                >
                  {markFor(selectedTool)}
                </span>
                <div>
                  <strong>{roleFor(selectedTool)}</strong>
                  <span>接続済み</span>
                </div>
              </header>
              <div className="sky-chat-messages" aria-live="polite">
                <div className="sky-chat-day">今日</div>
                <div className="sky-chat-bubble is-sky">
                  <MessageCircle size={16} />
                  <p>
                    {selectedTool.name}
                    です。依頼、確認、完了通知をここで受け取れます。
                  </p>
                </div>
                {selectedJobs.map((job) => (
                  <div className="sky-chat-receipt" key={job.id}>
                    {job.status === 'completed' ? (
                      <CheckCircle2 size={17} />
                    ) : (
                      <Clock3 size={17} />
                    )}
                    <div>
                      <strong>{jobMessage(job)}</strong>
                      <span>
                        {new Date(job.createdAt).toLocaleString('ja-JP')}
                      </span>
                    </div>
                    <Link href="/activity">履歴</Link>
                  </div>
                ))}
                {selectedMessages.map((message) => (
                  <div
                    className={`sky-chat-bubble is-${message.side}`}
                    key={message.id}
                  >
                    {message.side === 'sky' && <MessageCircle size={16} />}
                    <p>{message.text}</p>
                  </div>
                ))}
              </div>
              <form className="sky-chat-composer" onSubmit={sendMessage}>
                {error && <p role="alert">{error}</p>}
                <div>
                  <input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    aria-label={`${roleFor(selectedTool)}への依頼`}
                    placeholder="依頼を入力"
                  />
                  <button disabled={!draft.trim()} aria-label="送信">
                    <Send size={18} />
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="sky-chat-empty">
              <span>
                <MessageCircle size={28} />
              </span>
              <h2>アプリをChatにつなぐ</h2>
              <p>Skyで使いたいアプリを選ぶと、ここに会話が届きます。</p>
              <Link href="/">
                Skyを開く <ArrowRight size={16} />
              </Link>
            </div>
          )}
        </section>
      </div>
    </WorkspaceShell>
  );
}
