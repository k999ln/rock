'use client';

import { useState, type SyntheticEvent } from 'react';
import { Check, ShieldAlert, ShieldCheck, Sparkles } from 'lucide-react';
import type { JevEvaluationReceipt } from '@/lib/jev-evaluation';

export function JevEvaluationRunner({
  onRunningChange,
  onOutcome,
  executionDisabled = false,
}: {
  onRunningChange?: (running: boolean) => void;
  onOutcome?: (outcome: { ok: boolean; text: string }) => void;
  executionDisabled?: boolean;
}) {
  const [state, setState] = useState('');
  const [consent, setConsent] = useState(false);
  const [receipt, setReceipt] = useState<JevEvaluationReceipt | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!consent) {
      setError('送信先と料金・保持条件を確認して同意してください。');
      return;
    }
    setRunning(true);
    onRunningChange?.(true);
    setError('');
    setReceipt(null);
    try {
      const response = await fetch('/api/jev-evaluation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rubricId: 'sky-output-quality-v1',
          state,
          consent: {
            provider: 'typesafe-ai-via-vercel-ai-gateway',
            approved: true,
            approvedAt: new Date().toISOString(),
          },
        }),
      });
      const payload = (await response.json()) as JevEvaluationReceipt & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error || 'Jev評価を利用できません。');
      setReceipt(payload);
      onOutcome?.({ ok: true, text: 'Jevの評価Receiptを受け取りました。これは助言であり、Toolの成功判定ではありません。詳細はこのカードで確認してください。' });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Jev評価を利用できません。';
      setError(message);
      onOutcome?.({ ok: false, text: message });
    } finally {
      setRunning(false);
      onRunningChange?.(false);
    }
  }

  return (
    <section className="legal-runner patent-runner">
      <section className="legal-agent-chat" aria-label="Jev品質評価">
        <header>
          <span className="legal-agent-avatar" aria-hidden="true">
            <Sparkles size={19} />
          </span>
          <div>
            <strong>Jev品質評価</strong>
            <span>出力の根拠・安全性・次の一手を確認</span>
          </div>
          <small>ADVISORY</small>
        </header>
        <div className="legal-agent-boundaries">
          <span>
            <ShieldCheck size={15} /> 結果は助言だけ
          </span>
          <span>
            <ShieldAlert size={15} /> 権限・承認・成功判定には使わない
          </span>
        </div>
        <div className="patent-agent-summary">
          <p>評価したい出力だけを貼り付ける、Skyの任意リモート評価Toolです。</p>
          <p>
            個人情報、法務相談、未公開発明、秘密情報、原文の全文は送らないでください。
          </p>
        </div>
      </section>

      <form className="legal-runner-form" onSubmit={submit}>
        <fieldset
          disabled={executionDisabled || running}
          className="patent-fields"
        >
          <label className="legal-runner-text">
            評価対象（最大4,000文字）
            <textarea
              required
              minLength={1}
              maxLength={4_000}
              rows={9}
              value={state}
              onChange={(event) => {
                setState(event.target.value);
                setReceipt(null);
                setError('');
              }}
              placeholder="例：生成された回答や処理結果のうち、評価してよい最小部分"
            />
            <small>{state.length} / 4,000</small>
          </label>
          <label className="legal-runner-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>
              TypeSafe AI via Vercel AI
              Gatewayへ送信すること、provider条件・料金・保持条件を確認したことに同意します。
            </span>
          </label>
        </fieldset>
        <button
          className="black-button legal-runner-submit"
          type="submit"
          disabled={running}
        >
          <Sparkles size={17} /> {running ? '評価中…' : 'Jevで評価する'}
        </button>
      </form>

      {error && (
        <p className="patent-error" role="alert">
          {error}
        </p>
      )}
      {receipt && (
        <section className="legal-runner-result" aria-live="polite">
          <div className="legal-runner-result-heading">
            <div>
              <span>EVALUATION RECEIPT</span>
              <h3>品質評価を受け取りました</h3>
            </div>
            <Check size={20} aria-label="評価済み" />
          </div>
          <div className="patent-agent-summary">
            {Object.entries(receipt.answers).map(([key, answer]) => (
              <p key={key}>
                <strong>{key}</strong> — {JSON.stringify(answer)}
              </p>
            ))}
            <p>
              この結果はreview
              signalであり、法的判断・権限・承認・Tool成功を置き換えません。
            </p>
          </div>
        </section>
      )}
    </section>
  );
}
