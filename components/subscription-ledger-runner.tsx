'use client';

import { type ComponentProps, useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  CornerDownLeft,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import {
  answerSubscriptionQuestion,
  formatSubscriptionMoney,
  type AdvisorSubscription,
  type AdvisorSummary,
} from '@/lib/subscription-advisor';

const LEDGER_ORIGIN = 'http://127.0.0.1:8765';

type LedgerState = {
  summary: AdvisorSummary;
  subscriptions: AdvisorSubscription[];
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

const suggestedQuestions = [
  '全網羅されてる？',
  '今月いくら？',
  '要対応は？',
  '次の更新は？',
];

const statusLabel: Record<string, string> = {
  active: '有効',
  action_required: '要対応',
  trial: '試用中',
  usage_based: '従量課金',
  free: '無料',
  expired: '終了',
  cancelled: '解約済み',
  paused: '停止中',
};

function isLedgerState(value: unknown): value is LedgerState {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<LedgerState>;
  return (
    !!item.summary &&
    typeof item.summary === 'object' &&
    !!item.summary.counts &&
    typeof item.summary.monthly_totals === 'object' &&
    Array.isArray(item.summary.alerts) &&
    !!item.summary.coverage &&
    typeof item.summary.coverage === 'object' &&
    Array.isArray(item.subscriptions)
  );
}

export function SubscriptionLedgerRunner({
  onRunningChange,
  onOutcome,
  executionDisabled = false,
}: {
  onRunningChange?: (running: boolean) => void;
  onOutcome?: (outcome: { ok: boolean; text: string }) => void;
  executionDisabled?: boolean;
}) {
  const callbacksRef = useRef({ onRunningChange, onOutcome });
  useEffect(() => {
    callbacksRef.current = { onRunningChange, onOutcome };
  }, [onRunningChange, onOutcome]);
  const [state, setState] = useState<LedgerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'advisor-welcome',
      role: 'assistant',
      content:
        'こんにちは。Skyの**サブスク顧問**です。PC内の台帳だけを見て答えます。まずは下の質問から試してください。',
    },
  ]);

  const connect = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError('');
      callbacksRef.current.onRunningChange?.(true);
      try {
        const requestSignal = signal
          ? AbortSignal.any([signal, AbortSignal.timeout(5000)])
          : AbortSignal.timeout(5000);
        const [summaryResponse, subscriptionsResponse] = await Promise.all([
          fetch(`${LEDGER_ORIGIN}/api/summary`, {
            cache: 'no-store',
            signal: requestSignal,
          }),
          fetch(`${LEDGER_ORIGIN}/api/subscriptions`, {
            cache: 'no-store',
            signal: requestSignal,
          }),
        ]);
        if (!summaryResponse.ok || !subscriptionsResponse.ok)
          throw new Error('ローカル台帳が応答しませんでした。');
        const next = {
          summary: await summaryResponse.json(),
          subscriptions: await subscriptionsResponse.json(),
        };
        if (!isLedgerState(next))
          throw new Error('ローカル台帳の応答形式を確認してください。');
        setState(next);
        callbacksRef.current.onOutcome?.({
          ok: true,
          text: `PC内台帳に接続しました。契約・候補${next.summary.counts.total}件、要対応${next.summary.counts.action_required}件です。詳細はこのカードで確認できます。`,
        });
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError')
          return;
        setState(null);
        const message = cause instanceof Error
          ? cause.message
          : 'ローカル台帳へ接続できませんでした。';
        setError(message);
        callbacksRef.current.onOutcome?.({ ok: false, text: message });
      } finally {
        setLoading(false);
        callbacksRef.current.onRunningChange?.(false);
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => connect(controller.signal));
    return () => controller.abort();
  }, [connect]);

  if (executionDisabled)
    return <p className="ledger-sky-notice">現在は実行が停止されています。</p>;

  if (loading)
    return (
      <output className="ledger-sky-loading">
        <RefreshCw size={18} className="ledger-sky-spin" />
        PC内の台帳へ接続しています…
      </output>
    );

  if (!state)
    return (
      <section className="ledger-sky-connect" aria-live="polite">
        <AlertTriangle size={25} />
        <div>
          <h3>RockstarOS Ledgerを起動してください</h3>
          <p>{error || 'PC内のローカル台帳へ接続できません。'}</p>
          <code>python3 scripts/run_local.py</code>
          <button onClick={() => void connect()}>
            <RefreshCw size={15} /> 再接続
          </button>
        </div>
      </section>
    );

  const totals = Object.entries(state.summary.monthly_totals)
    .map(([currency, amount]) => formatSubscriptionMoney(amount, currency))
    .join(' ＋ ');
  const visible = state.subscriptions
    .toSorted((left, right) => {
      const weight = (status: string) =>
        status === 'action_required' ? 0 : status === 'active' ? 1 : 2;
      return weight(left.status) - weight(right.status);
    })
    .slice(0, 8);

  const askAdvisor = (question: string) => {
    const clean = question.trim();
    if (!clean) return;
    const stamp = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      { id: `user-${stamp}`, role: 'user', content: clean },
      {
        id: `assistant-${stamp}`,
        role: 'assistant',
        content: answerSubscriptionQuestion(
          clean,
          state.summary,
          state.subscriptions,
        ),
      },
    ]);
  };
  const submitQuestion: NonNullable<ComponentProps<'form'>['onSubmit']> = (
    event,
  ) => {
    event.preventDefault();
    if (!question.trim()) return;
    askAdvisor(question);
    setQuestion('');
  };

  return (
    <section className="ledger-sky-panel">
      <div className="ledger-sky-connected">
        <span>
          <CheckCircle2 size={15} /> ローカル台帳に接続済み
        </span>
        <span>
          <ShieldCheck size={15} /> 外部送信なし
        </span>
      </div>
      <div className="ledger-sky-metrics">
        <article>
          <span>月額換算</span>
          <strong>{totals || '¥0'}</strong>
        </article>
        <article>
          <span>契約・候補</span>
          <strong>{state.summary.counts.total}</strong>
        </article>
        <article className="ledger-sky-danger">
          <span>網羅確認</span>
          <strong>
            {state.summary.coverage.source_counts.resolved} /{' '}
            {state.summary.coverage.source_counts.total}
          </strong>
        </article>
      </div>
      <section className="ledger-sky-chat" aria-label="サブスク顧問との会話">
        <header>
          <span className="ledger-sky-chat-avatar">
            <Bot size={17} />
          </span>
          <div>
            <strong>サブスク顧問</strong>
            <span>台帳参照・確認担当</span>
          </div>
          <small>LOCAL</small>
        </header>
        <Conversation className="ledger-sky-chat-thread">
          <ConversationContent className="ledger-sky-chat-content">
            {messages.map((message) => (
              <Message from={message.role} key={message.id}>
                <MessageContent>
                  <span className="ledger-sky-message-role" aria-hidden="true">
                    {message.role === 'assistant' ? (
                      <Bot size={14} />
                    ) : (
                      <UserRound size={14} />
                    )}
                  </span>
                  <MessageResponse>{message.content}</MessageResponse>
                </MessageContent>
              </Message>
            ))}
          </ConversationContent>
          <ConversationScrollButton aria-label="最新の会話へ移動" />
        </Conversation>
        <div className="ledger-sky-suggestions" aria-label="質問例">
          {suggestedQuestions.map((question) => (
            <button key={question} onClick={() => askAdvisor(question)}>
              {question}
            </button>
          ))}
        </div>
        <form className="ledger-sky-prompt" onSubmit={submitQuestion}>
          <textarea
            aria-label="サブスク顧問へ質問"
            onChange={(event) => setQuestion(event.currentTarget.value)}
            placeholder="例：要対応は？ 次の更新は？"
            rows={2}
            value={question}
          />
          <footer>
            <span>外部AIへ送信しません</span>
            <button
              aria-label="質問を送信"
              disabled={!question.trim()}
              type="submit"
            >
              <CornerDownLeft size={15} />
            </button>
          </footer>
        </form>
      </section>
      {state.summary.alerts.length > 0 ? (
        <div className="ledger-sky-alerts">
          {state.summary.alerts.map((alert) => (
            <article key={`${alert.subscription}-${alert.message}`}>
              <strong>{alert.subscription}</strong>
              <span>{alert.message}</span>
            </article>
          ))}
        </div>
      ) : (
        <p className="ledger-sky-notice">
          現在、支払い・更新の要対応はありません。
        </p>
      )}
      <div className="ledger-sky-list">
        {visible.map((subscription) => (
          <article key={subscription.id}>
            <div>
              <strong>{subscription.name}</strong>
              <span>
                {statusLabel[subscription.status] || subscription.status}
              </span>
            </div>
            <div>
              <strong>
                {formatSubscriptionMoney(
                  subscription.amount,
                  subscription.currency,
                )}
              </strong>
              <span>
                {subscription.renewal_date || subscription.billing_cycle}
              </span>
            </div>
          </article>
        ))}
      </div>
      <div className="ledger-sky-actions">
        <button onClick={() => void connect()}>
          <RefreshCw size={15} /> 更新
        </button>
        <a href={LEDGER_ORIGIN} target="_blank" rel="noreferrer">
          台帳を開く <ArrowUpRight size={15} />
        </a>
      </div>
    </section>
  );
}
