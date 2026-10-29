'use client';

import { parseWorkToolApprovalContext, parseWorkToolExecutionReview, workToolCreationRelation, type WorkAgentBinding, type WorkToolApprovalContext } from '@/lib/workflow';
import { useMemo, useRef, useState } from 'react';
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
  type McpJobGate,
  type McpJobClaim,
} from '@/lib/mcp-hub';
import { describeMcpToolResult } from '@/lib/mcp-tool-result';

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

function requireLiveExecutionReview(review: ReturnType<typeof parseWorkToolExecutionReview> | undefined) {
  if (review && review.approvalContext.expiresAt <= Date.now()) throw new Error('実行確認が失効しました。');
}

export function McpBotRunner({
  server,
  request,
  onRunningChange,
  onStatusChange,
  onOutcome,
  onDisconnected,
  beforeExecute,
  onJobClaim,
  fixedToolName,
  executionDisabled = false,
  onCreationReview,
  executionDisclosure,
}: {
  server: McpConnection;
  request: string;
  onRunningChange?: (running: boolean) => void;
  onStatusChange?: (status: ParentRunState) => void;
  onOutcome?: (outcome: { ok: boolean; text: string }) => void;
  onDisconnected?: () => void;
  beforeExecute?: (input: { serverId: string; toolName: string; args: Record<string, unknown>; executionReview?: ReturnType<typeof parseWorkToolExecutionReview> }) => Promise<McpJobGate | void>;
  onJobClaim?: (claim: McpJobClaim) => void;
  fixedToolName?: string;
  executionDisabled?: boolean;
  executionDisclosure?: { ownerScope: string; jobId: string; jobRevision: number; agentId: string; agentRevision: number;
    packageKey: string; manifestSha256: string; packagePricingNote: string; binding?: WorkAgentBinding };
  /** Disclosure only: never call tools/execute in this mode or reuse its approval. */
  onCreationReview?: (input: { args: Record<string, unknown>; pricingNote: string } | null) => Promise<void> | void;
}) {
  const tools = useMemo(
    () => (server.passport?.tools ?? []).filter((tool) => !fixedToolName || tool.name === fixedToolName),
    [server.passport, fixedToolName],
  );
  const initialTool = fixedToolName ? tools[0] : toolForRequest(tools, request);
  const [toolName, setToolName] = useState(initialTool?.name ?? '');
  const selectedTool = useMemo(
    () => tools.find((tool) => tool.name === toolName),
    [toolName, tools],
  );
  const [direction, setDirection] = useState(request);
  const [argsText, setArgsText] = useState(() => argsFor(initialTool, request));
  const [approval, setApproval] = useState<(McpApproval & { executionReview?: ReturnType<typeof parseWorkToolExecutionReview> }) | null>(null);
  const [state, setState] = useState<RunState>('ready');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [disconnecting, setDisconnecting] = useState(false);
  const executionInFlight = useRef(false);
  const inputGeneration = useRef(0);
  function reviewFor(context: WorkToolApprovalContext) {
    if (!executionDisclosure || context.connectorId !== server.id || context.toolName !== selectedTool?.name ||
        context.toolDigest !== server.passport?.toolDigest || context.transport !== server.transport ||
        context.pricing.note !== selectedTool.pricing.note) throw new Error('実行条件が変わりました。再確認してください。');
    const { binding: _binding, packagePricingNote, ...target } = executionDisclosure;
    return parseWorkToolExecutionReview({ schema: 'rockstaros.work-tool-execution-review/1', ...target,
      packagePricing: { model: 'free', note: packagePricingNote, declaration: 'provider_unverified' }, approvalContext: context });
  }
  const preparedReview = (() => {
    if (!approval?.executionContext || !approval.executionReview || !executionDisclosure) return null;
    try {
      const pinned = parseWorkToolExecutionReview(approval.executionReview);
      const current = reviewFor(parseWorkToolApprovalContext(approval.executionContext));
      return JSON.stringify(pinned) === JSON.stringify(current) ? pinned : null;
    } catch { return null; }
  })();
  const originRelation = preparedReview ? workToolCreationRelation(executionDisclosure?.binding, preparedReview) : null;
  const directExecutionAllowed = selectedTool?.pricing.model === 'free';

  function changeTool(value: string) {
    inputGeneration.current++;
    const next = tools.find((tool) => tool.name === value);
    void onCreationReview?.(null);
    setToolName(value);
    setArgsText(argsFor(next, direction));
    setApproval(null);
    setResult('');
    setError('');
    setState('ready');
  }

  function applyDirection() {
    inputGeneration.current++;
    void onCreationReview?.(null);
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
    const generation = inputGeneration.current;
    try {
      const args = parseArgs();
      const next = await prepareMcpTool(
        server.id,
        selectedTool.name,
        args,
      );
      let executionReview: ReturnType<typeof parseWorkToolExecutionReview> | undefined;
      if (executionDisclosure) {
        const context = parseWorkToolApprovalContext(next.executionContext);
        executionReview = reviewFor(context);
        const inputHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(args))))]
          .map(byte => byte.toString(16).padStart(2, '0')).join('');
        if (context.inputSha256 !== inputHash || context.expiresAt <= Date.now() ||
            Date.parse(next.expiresAt) !== context.expiresAt) throw new Error('実行確認の入力・期限を照合できません。');
        next.executionContext = context;
      }
      if (inputGeneration.current !== generation) throw new Error('確認中に入力が変わりました。');
      setApproval({ ...next, ...(executionReview ? { executionReview } : {}) });
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

  async function confirmCreation() {
    if (!onCreationReview || !approval || !selectedTool || executionDisabled) return;
    setError('');
    try {
      if (!Number.isFinite(Date.parse(approval.expiresAt)) || Date.parse(approval.expiresAt) <= Date.now() || approval.toolId !== selectedTool.name ||
          approval.pricing.model !== 'free' || approval.pricing.declaration !== 'provider_unverified' ||
          approval.pricing.note !== selectedTool.pricing.note) throw new Error('料金申告と入力を読み直してください。');
      await onCreationReview({ args: parseArgs(), pricingNote: approval.pricing.note });
      // A creation disclosure is not the one-use execution consent.
      setApproval(null); setState('ready');
    } catch (reason) {
      setApproval(null); void onCreationReview(null);
      setError(reason instanceof Error ? reason.message : '作成前確認をやり直してください。');
    }
  }

  async function execute() {
    if (onCreationReview) return;
    if (!selectedTool || !approval || state === 'running' || executionInFlight.current) return;
    if (executionDisclosure && !preparedReview) { setError('実行確認を照合できません。Connectorを読み直してください。'); return; }
    const generation = inputGeneration.current;
    const executionReview = preparedReview ?? undefined;
    executionInFlight.current = true;
    setError('');
    setState('running');
    onStatusChange?.('running');
    onRunningChange?.(true);
    try {
      // Pin the exact input before the durable job-admission hook. Editing while
      // that hook waits must not change the input covered by the approval.
      const args = parseArgs();
      requireLiveExecutionReview(executionReview);
      const jobGate = await beforeExecute?.({ serverId: server.id, toolName: selectedTool.name, args, executionReview });
      requireLiveExecutionReview(executionReview);
      if (generation !== inputGeneration.current)
        throw new Error('確認後に入力または期限が変わりました。再送せず照合してください。');
      if (beforeExecute && !jobGate) throw new Error('仕事の実行許可を確認できません。');
      const value = await executeApprovedMcpTool(
        server.id,
        selectedTool.name,
        args,
        approval.approvalToken,
        jobGate || undefined,
        onJobClaim,
      );
      const outcome = describeMcpToolResult(value);
      setApproval(null);
      onOutcome?.(outcome);
      if (outcome.ok) {
        setResult(outcome.text);
        setState('completed');
        onStatusChange?.('completed');
      } else {
        setError(outcome.text);
        setState('failed');
        onStatusChange?.('failed');
      }
    } catch (reason) {
      setApproval(null);
      setState('failed');
      onStatusChange?.('failed');
      const message = reason instanceof Error ? reason.message : 'MCPを実行できませんでした。';
      setError(message);
      onOutcome?.({ ok: false, text: message });
    } finally {
      executionInFlight.current = false;
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
        <select value={toolName} disabled={Boolean(fixedToolName) || state === 'running'} onChange={(event) => changeTool(event.target.value)}>
          {tools.map((tool) => (
            <option key={tool.name} value={tool.name}>
              {tool.title || tool.name}
            </option>
          ))}
        </select>
        {selectedTool?.description && <small>{selectedTool.description}</small>}
        {selectedTool && <small>
          {selectedTool.pricing.model === 'free'
            ? `料金条件: 提供元申告「実行ごとの追加料金なし」（Rockstarによる独立検証なし）。${selectedTool.pricing.note}`
            : selectedTool.pricing.model === 'unknown'
              ? '料金条件: 未確認。実行を停止します。'
              : `料金条件: ${selectedTool.pricing.model}。署名見積・予算予約・利用量照合が未接続のため、直接実行できません。${selectedTool.pricing.note}`}
        </small>}
      </label>

      <div className="mcp-bot-direction">
        <label>
          <span>方向・修正指示</span>
          <textarea
            rows={3}
            disabled={state === 'running'}
            maxLength={4000}
            value={direction}
            onChange={(event) => { inputGeneration.current++; if (onCreationReview) { void onCreationReview(null); setApproval(null); } setDirection(event.target.value); }}
            placeholder="次の実行で変えたい方向を伝える"
          />
        </label>
        <button type="button" disabled={state === 'running'} onClick={applyDirection}>
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
          disabled={state === 'running'}
          rows={8}
          maxLength={100000}
          spellCheck={false}
          value={argsText}
          onChange={(event) => {
            inputGeneration.current++; void onCreationReview?.(null);
            setArgsText(event.target.value);
            setApproval(null);
            setState('ready');
          }}
        />
      </details>

      {approval && executionDisclosure && !preparedReview && <p role="alert">実行条件の記録を照合できません。Connectorを読み直してください。</p>}
      {approval && (
        <output className="mcp-bot-approval">
          <ShieldCheck size={18} />
          <div>
            <strong>{onCreationReview ? '作成前の条件確認（まだ実行しません）' : '1回だけ実行します'}</strong>
            <p>{onCreationReview ? `実行先: ${server.name} · Tool: ${approval.tool}` : approval.summary}</p>
            {onCreationReview && <><p>この具体的な入力で仕事を作成します。実行時の承認は別途必要です。</p>
              <pre aria-label="作成前に確認する具体的な入力">{argsText}</pre>
              <p>提供元の料金申告: {approval.pricing.note}</p></>}
            {preparedReview && <section aria-label="この実行で確認する条件">
              <p>作成時との比較: {originRelation?.state === 'changed' ? `変更あり（${originRelation.changedFields.join('・')}）` :
                originRelation?.state === 'unchanged' ? '同じ条件' : '作成時の確認記録なし'}</p>
              <p>対象: {executionDisclosure?.jobId} · Package: {preparedReview.packageKey}</p>
              <p>接続先: {server.name} · Tool: {preparedReview.approvalContext.toolName}</p>
              <pre aria-label="実行直前に確認する具体的な入力">{argsText}</pre>
              <p>Package料金申告: {preparedReview.packagePricing.note}</p>
              <p>Tool料金申告: {preparedReview.approvalContext.pricing.note}</p>
              <details><summary>条件の参照情報</summary><p>manifest: {preparedReview.manifestSha256}</p>
                <p>Tool版: {preparedReview.approvalContext.toolDigest}</p><p>入力: {preparedReview.approvalContext.inputSha256}</p></details>
              <p>今回はこの入力と条件を1回確認します。提供元申告は独立検証した料金や実行権限ではありません。</p>
            </section>}
            <small>料金条件: 提供元申告「実行ごとの追加料金なし」。この申告はRockstarが独立検証した料金見積ではありません。</small>
            <small>確認後の引数変更や再利用は拒否されます。</small>
          </div>
        </output>
      )}

      <div className="mcp-bot-actions">
        {approval ? (
          <button type="button" className="black-button" disabled={executionDisabled || state === 'running' || Boolean(executionDisclosure && !preparedReview)} onClick={() => void (onCreationReview ? confirmCreation() : execute())}>
            {state === 'running' ? (
              <LoaderCircle className="sky-chat-spin" size={16} />
            ) : (
              <Play size={16} />
            )}
            {state === 'running' ? '実行中…' : onCreationReview ? 'この条件を確認して仕事の作成へ進む' : '内容を承認して実行'}
          </button>
        ) : (
          <button type="button" className="black-button" onClick={() => void prepare()} disabled={!directExecutionAllowed || executionDisabled}>
            <ShieldCheck size={16} /> {onCreationReview ? '仕事の作成前に条件を確認' : '実行内容を確認'}
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
