'use client';

import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import {
  disconnectMcp,
  executeApprovedMcpTool,
  prepareMcpTool,
  type McpApproval,
  type McpConnection,
  type McpToolPassport,
} from '@/lib/mcp-hub';

type RunState = 'ready' | 'approval' | 'running' | 'completed' | 'failed';
type ParentRunState = 'ready' | 'running' | 'completed' | 'failed';

function fallbackValue(schema: unknown) {
  if (!schema || typeof schema !== 'object') return '';
  const type = (schema as { type?: unknown }).type;
  if (type === 'boolean') return false;
  if (type === 'number' || type === 'integer') return 0;
  if (type === 'array') return [];
  if (type === 'object') return {};
  return '';
}

function requestField(properties: Record<string, unknown>) {
  return [
    'instruction',
    'prompt',
    'request',
    'query',
    'text',
    'message',
    'task',
    'direction',
  ].find((key) => key in properties);
}

function toolForRequest(tools: McpToolPassport[], request: string) {
  const value = request.toLowerCase();
  const preferred = [
    { request: /出典|引用|url|リンク/, tool: /citation|source|reference|出典|引用/ },
    { request: /記事|原稿|無料版|note/, tool: /article|writer|記事|原稿/ },
    { request: /納品|成果物|照合|検品/, tool: /delivery|deliverable|納品|成果物/ },
    { request: /案件|応募|提案|ココナラ/, tool: /coconala|proposal|案件|応募|提案/ },
  ].find((candidate) => candidate.request.test(value));
  if (preferred) {
    const match = tools.find((tool) =>
      preferred.tool.test(
        `${tool.name} ${tool.title ?? ''} ${tool.description}`.toLowerCase(),
      ),
    );
    if (match) return match;
  }
  return tools[0];
}

function argsFor(tool: McpToolPassport | undefined, request: string) {
  if (!tool) return '{}';
  const schema = tool.inputSchema as {
    properties?: Record<string, unknown>;
    required?: unknown;
  };
  const properties = schema.properties ?? {};
  const required = Array.isArray(schema.required)
    ? schema.required.filter((key): key is string => typeof key === 'string')
    : [];
  const args: Record<string, unknown> = {};
  const directionKey = requestField(properties);
  if (directionKey && request.trim()) args[directionKey] = request.trim();
  for (const key of required)
    if (!(key in args)) args[key] = fallbackValue(properties[key]);
  return JSON.stringify(args, null, 2);
}

function prettyResult(value: unknown) {
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

export function McpBotRunner({
  server,
  request,
  onRunningChange,
  onStatusChange,
  onDisconnected,
}: {
  server: McpConnection;
  request: string;
  onRunningChange?: (running: boolean) => void;
  onStatusChange?: (status: ParentRunState) => void;
  onDisconnected?: () => void;
}) {
  const tools = useMemo(
    () => server.passport?.tools ?? [],
    [server.passport],
  );
  const initialTool = toolForRequest(tools, request);
  const [toolName, setToolName] = useState(initialTool?.name ?? '');
  const selectedTool = useMemo(
    () => tools.find((tool) => tool.name === toolName),
    [toolName, tools],
  );
  const [direction, setDirection] = useState(request);
  const [argsText, setArgsText] = useState(() => argsFor(initialTool, request));
  const [approval, setApproval] = useState<McpApproval | null>(null);
  const [state, setState] = useState<RunState>('ready');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [disconnecting, setDisconnecting] = useState(false);

  function changeTool(value: string) {
    const next = tools.find((tool) => tool.name === value);
    setToolName(value);
    setArgsText(argsFor(next, direction));
    setApproval(null);
    setResult('');
    setError('');
    setState('ready');
  }

  function applyDirection() {
    setArgsText(argsFor(selectedTool, direction));
    setApproval(null);
    setResult('');
    setError('');
    setState('ready');
  }

  function parseArgs() {
    let value: unknown;
    try {
      value = JSON.parse(argsText);
    } catch {
      throw new Error('入力JSONを確認してください。');
    }
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('MCPの引数はJSONオブジェクトで入力してください。');
    return value as Record<string, unknown>;
  }

  async function prepare() {
    if (!selectedTool) return;
    setError('');
    setResult('');
    try {
      const next = await prepareMcpTool(
        server.id,
        selectedTool.name,
        parseArgs(),
      );
      setApproval(next);
      setState('approval');
      onStatusChange?.('ready');
    } catch (reason) {
      setApproval(null);
      setState('failed');
      onStatusChange?.('failed');
      setError(
        reason instanceof Error ? reason.message : '実行内容を確認できませんでした。',
      );
    }
  }

  async function execute() {
    if (!selectedTool || !approval || state === 'running') return;
    setError('');
    setState('running');
    onStatusChange?.('running');
    onRunningChange?.(true);
    try {
      const value = await executeApprovedMcpTool(
        server.id,
        selectedTool.name,
        parseArgs(),
        approval.approvalToken,
      );
      setResult(prettyResult(value));
      setApproval(null);
      setState('completed');
      onStatusChange?.('completed');
    } catch (reason) {
      setApproval(null);
      setState('failed');
      onStatusChange?.('failed');
      setError(
        reason instanceof Error ? reason.message : 'MCPを実行できませんでした。',
      );
    } finally {
      onRunningChange?.(false);
    }
  }

  async function stopBot() {
    setDisconnecting(true);
    setError('');
    try {
      await disconnectMcp(server.id);
      onDisconnected?.();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'MCPを停止できませんでした。',
      );
    } finally {
      setDisconnecting(false);
    }
  }

  if (!server.passport || server.state !== 'connected')
    return <p>このMCPは接続されていません。Skyで接続を確認してください。</p>;

  return (
    <section className="mcp-bot-runner" aria-label={`${server.name}の管理`}>
      <header>
        <div>
          <strong>{server.name}</strong>
          <small>
            {server.transport === 'stdio' ? 'このPC' : '提供者MCP'} ·{' '}
            {tools.length}機能 · {server.passport.server.version}
          </small>
        </div>
        <span className="mcp-bot-live">
          <i /> 接続中
        </span>
      </header>

      <label className="mcp-bot-field">
        <span>このbotに任せる機能</span>
        <select value={toolName} onChange={(event) => changeTool(event.target.value)}>
          {tools.map((tool) => (
            <option key={tool.name} value={tool.name}>
              {tool.title || tool.name}
            </option>
          ))}
        </select>
        {selectedTool?.description && <small>{selectedTool.description}</small>}
      </label>

      <div className="mcp-bot-direction">
        <label>
          <span>方向・修正指示</span>
          <textarea
            rows={3}
            maxLength={4000}
            value={direction}
            onChange={(event) => setDirection(event.target.value)}
            placeholder="次の実行で変えたい方向を伝える"
          />
        </label>
        <button type="button" onClick={applyDirection}>
          <RotateCcw size={15} /> 指示を今回の入力へ反映
        </button>
        <small>
          MCPがprompt・query・text等を受け取る場合は自動で反映します。実行中の処理への割り込みではありません。
        </small>
      </div>

      <details className="mcp-bot-args">
        <summary>
          <Wrench size={15} /> 引数を確認・編集
        </summary>
        <textarea
          aria-label="MCP toolのJSON引数"
          rows={8}
          maxLength={100000}
          spellCheck={false}
          value={argsText}
          onChange={(event) => {
            setArgsText(event.target.value);
            setApproval(null);
            setState('ready');
          }}
        />
      </details>

      {approval && (
        <output className="mcp-bot-approval">
          <ShieldCheck size={18} />
          <div>
            <strong>1回だけ実行します</strong>
            <p>{approval.summary}</p>
            <small>確認後の引数変更や再利用は拒否されます。</small>
          </div>
        </output>
      )}

      <div className="mcp-bot-actions">
        {approval ? (
          <button type="button" className="black-button" onClick={() => void execute()}>
            {state === 'running' ? (
              <LoaderCircle className="sky-chat-spin" size={16} />
            ) : (
              <Play size={16} />
            )}
            {state === 'running' ? '実行中…' : '内容を承認して実行'}
          </button>
        ) : (
          <button type="button" className="black-button" onClick={() => void prepare()}>
            <ShieldCheck size={16} /> 実行内容を確認
          </button>
        )}
        <button
          type="button"
          className="secondary-button"
          disabled={state === 'running' || disconnecting}
          onClick={() => void stopBot()}
        >
          <Pause size={15} /> {disconnecting ? '停止中…' : 'botを停止'}
        </button>
      </div>

      {error && (
        <p className="mcp-bot-error" role="alert">
          <CircleAlert size={16} /> {error}
        </p>
      )}
      {result && (
        <div className="mcp-bot-result" aria-live="polite">
          <strong>
            <CheckCircle2 size={17} /> 結果
          </strong>
          <pre>{result}</pre>
        </div>
      )}
    </section>
  );
}
