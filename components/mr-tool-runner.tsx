'use client';
import { useEffect, useState } from 'react';
import {
  ExecutionSignin,
  useExecutionAccess,
} from '@/components/execution-access';
import {
  Play,
  Download,
  Copy,
  Check,
  CircleHelp,
  RotateCcw,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  checkCoconala,
  formatCitations,
  makeFreeArticle,
  MAX_TEXT,
  type CoconalaResult,
} from '@/lib/mr-tools';
import { DeliveryRunner } from '@/components/delivery-runner';
import { SubscriptionLedgerRunner } from '@/components/subscription-ledger-runner';
import { LegalIntakeRunner } from '@/components/legal-intake-runner';
import { PatentAssistantRunner } from '@/components/patent-assistant-runner';
import { JevEvaluationRunner } from '@/components/jev-evaluation-runner';
import {
  executeTracked,
  processedBytes,
  OperationRequestError,
} from '@/lib/operations-client';
import { deviceToken, runDevice, type RunRecorder } from '@/lib/device';
export type MrRunner =
  | 'coconala'
  | 'citations'
  | 'free-article'
  | 'delivery-local'
  | 'subscription-ledger'
  | 'legal-intake'
  | 'patent-assistant'
  | 'jev-evaluation';
const demoArticle =
  '# 仕事を小さく自動化する\n\n繰り返している作業を書き出します。毎回同じ手順をひとつ選びます。まずは短い入力で試して、結果を自分で確かめましょう。\n\n## 実践手順\n\nここからは完全版の具体的な手順です。作業を分解して、入力と完成条件を決めます。記録を残すと、次に改善する場所が見つかります。\n\n## 出典\n\n- [Python公式](https://docs.python.org/3/)';
export function MrToolRunner({
  tool,
  onRecord,
  onRunningChange,
  onOutcome,
  onFailure,
  executionDisabled = false,
}: {
  tool: MrRunner;
  onRecord?: RunRecorder;
  onRunningChange?: (running: boolean) => void;
  onOutcome?: (outcome: { ok: boolean; text: string }) => void;
  onFailure?: () => void;
  executionDisabled?: boolean;
}) {
  const [text, setText] = useState(''),
    [proposal, setProposal] = useState(''),
    [bucket, setBucket] = useState('single'),
    [rate, setRate] = useState('');
  const [after, setAfter] = useState('40'),
    [price, setPrice] = useState('500'),
    [summary, setSummary] = useState(''),
    [contents, setContents] = useState(''),
    [url, setUrl] = useState('');
  const [output, setOutput] = useState(''),
    [result, setResult] = useState<CoconalaResult | null>(null),
    [error, setError] = useState(''),
    [copied, setCopied] = useState(false),
    [editing, setEditing] = useState(false);
  const { needsSignin, setNeedsSignin } = useExecutionAccess();
  const [connected, setConnected] = useState(false),
    [running, setRunning] = useState(false),
    [sampleInput, setSampleInput] = useState(false);
  useEffect(() => {
    const update = () => setConnected(!!deviceToken());
    update();
    window.addEventListener('loop-device', update);
    return () => window.removeEventListener('loop-device', update);
  }, []);
  const update = (action: () => void) => {
    action();
    setSampleInput(false);
    setEditing(true);
    setOutput('');
    setResult(null);
    setError('');
    setCopied(false);
  };
  function sample() {
    setSampleInput(true);
    setError('');
    setOutput('');
    setResult(null);
    setEditing(true);
    if (tool === 'citations')
      setText(
        '自動化は小さく試します。（出典: [Python公式](https://docs.python.org/3/)）\n\n結果は自分で確認します。（出典: [Python公式](https://docs.python.org/3/)）',
      );
    else if (tool === 'coconala') {
      setText(
        '単発の原稿作成をお願いします。やり取りはチャットで完結し、Zoom面談は不要です。',
      );
      setProposal(
        'ご指定のテーマに沿って原稿を作成し、確認用の文書を納品します。',
      );
      setBucket('single');
      setRate('50');
    } else {
      setText(demoArticle);
      setAfter('40');
      setPrice('500');
      setSummary(
        '- 繰り返しの作業を選ぶ\n- 短い入力で試す\n- 結果を自分で確認する',
      );
      setContents('手順の分解と記録方法');
      setUrl('https://note.com/your_account/n/your_article');
    }
  }
  async function run() {
    if (running || executionDisabled) return;
    setRunning(true);
    onRunningChange?.(true);
    setError('');
    setCopied(false);
    setEditing(false);
    setOutput('');
    setResult(null);
    const started = performance.now(),
      local = !!deviceToken();
    const toolId =
      tool === 'coconala'
        ? 'coconala'
        : tool === 'citations'
          ? 'mr-citations'
          : 'mr-free-article';
    const transport = local ? 'local-mcp' : 'browser';
    const args =
      tool === 'coconala'
        ? {
            brief: text,
            proposal,
            bucket,
            orderRate: rate.trim() === '' ? null : Number(rate),
          }
        : tool === 'citations'
          ? { text }
          : {
              markdown: text,
              afterChars: Number(after),
              summary,
              price: Number(price),
              paidContents: contents,
              noteUrl: url,
            };
    let executed = false,
      completed = false;
    try {
      const tracked = await executeTracked<{
        output: string;
        check: CoconalaResult | null;
        outcome: 'passed' | 'needs_review';
      }>({
        tool: toolId,
        transport,
        sample: sampleInput,
        inputBytes: processedBytes(args),
        task: async () => {
          executed = true;
          if (local) {
            const name =
              tool === 'coconala'
                ? 'coconala_check'
                : tool === 'citations'
                  ? 'format_citations'
                  : 'make_free_article';
            const response = await runDevice(name, args);
            return {
              output: response.output,
              check: null,
              outcome:
                tool === 'coconala' && response.status !== 'PASS'
                  ? 'needs_review'
                  : 'passed',
            };
          }
          if (tool === 'coconala') {
            const check = checkCoconala({
              brief: text,
              proposal,
              bucket: bucket as 'single' | 'retainer',
              orderRate: rate.trim() === '' ? null : Number(rate),
            });
            return {
              check,
              outcome: check.allowed ? 'passed' : 'needs_review',
              output: [
                '# ココナラ案件チェック',
                '',
                check.summary,
                ...check.reasons.map((s) => '- ' + s),
                ...check.signals.map((s) => '- 検出: ' + s),
                ...check.rankingNotes.map((s) => '- ' + s),
                '',
                '受注・規約適合・収益を保証せず、応募や送信は行いません。',
              ].join('\n'),
            };
          }
          return {
            check: null,
            outcome: 'passed',
            output:
              tool === 'citations'
                ? formatCitations(text)
                : makeFreeArticle({
                    markdown: text,
                    afterChars: Number(after),
                    summary,
                    price: Number(price),
                    paidContents: contents,
                    noteUrl: url,
                  }),
          };
        },
      });
      completed = true;
      setResult(tracked.result.check);
      setOutput(tracked.result.output);
      setError(tracked.warning);
      if (onRecord)
        await onRecord(
          toolId,
          transport,
          'completed',
          started,
          sampleInput,
          tracked.result.outcome,
        );
      onOutcome?.({ ok: true, text: tracked.result.output });
    } catch (e) {
      if (executed && !completed && onRecord) {
        try {
          await onRecord(
            toolId,
            transport,
            'failed',
            started,
            sampleInput,
            'failed',
          );
        } catch {
          /* Workbench retains the pending receipt. */
        }
      }
      if (e instanceof OperationRequestError && e.status === 401)
        setNeedsSignin(true);
      const message = e instanceof Error ? e.message : '入力を確認してください。';
      setError(message);
      onFailure?.();
      onOutcome?.({ ok: false, text: message });
    } finally {
      setRunning(false);
      onRunningChange?.(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
    } catch {
      setError(
        'コピーできませんでした。結果欄から選択するか、ファイルで保存してください。',
      );
    }
  }
  function download() {
    const objectUrl = URL.createObjectURL(
      new Blob([output], { type: 'text/markdown;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `rock-star-${tool}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
  if (tool === 'delivery-local')
    return (
      <DeliveryRunner
        onRecord={onRecord}
        onRunningChange={onRunningChange}
        onOutcome={onOutcome}
        executionDisabled={executionDisabled}
      />
    );
  if (tool === 'subscription-ledger')
    return (
      <SubscriptionLedgerRunner
        onRunningChange={onRunningChange}
        onOutcome={onOutcome}
        executionDisabled={executionDisabled}
      />
    );
  if (tool === 'legal-intake')
    return (
      <LegalIntakeRunner
        onRunningChange={onRunningChange}
        onOutcome={onOutcome}
        executionDisabled={executionDisabled}
      />
    );
  if (tool === 'patent-assistant')
    return (
      <PatentAssistantRunner
        onRunningChange={onRunningChange}
        onOutcome={onOutcome}
        executionDisabled={executionDisabled}
      />
    );
  if (tool === 'jev-evaluation')
    return (
      <JevEvaluationRunner
        onRunningChange={onRunningChange}
        onOutcome={onOutcome}
        executionDisabled={executionDisabled}
      />
    );
  return (
    <section className="mr-workbench">
      {needsSignin && <ExecutionSignin />}
      <fieldset disabled={running || executionDisabled || needsSignin}>
        <div className="bench-heading">
          <h3>
            {tool === 'coconala'
              ? '応募前に、条件を確認'
              : tool === 'citations'
                ? '出典をまとめる'
                : '記事の無料版を作る'}
          </h3>
          <span className="outline-tag">
            {connected ? 'PCで実行' : 'ブラウザ内で実行'} · 無料
          </span>
        </div>
        <div className="bench-helper">
          <span>
            原稿はこの端末内で処理。サイトには実行履歴・処理量などのメタデータだけを保存します。
          </span>
          <button className="text-link" onClick={sample}>
            <RotateCcw size={14} />
            サンプルを入れる
          </button>
        </div>
        <label className="bench-field">
          <span>
            {tool === 'coconala'
              ? '案件の依頼文'
              : tool === 'citations'
                ? '整える本文（Markdown）'
                : '完全版の原稿（Markdown）'}
          </span>
          <Textarea
            rows={7}
            maxLength={MAX_TEXT}
            value={text}
            onChange={(e) => update(() => setText(e.target.value))}
            placeholder={
              tool === 'coconala'
                ? '依頼文をここに貼り付ける'
                : tool === 'citations'
                  ? '本文（出典: [ラベル](https://...)）'
                  : '# 記事タイトル\n\n本文をここに貼り付ける'
            }
          />
        </label>
        {tool === 'coconala' && (
          <>
            <label htmlFor="mr-proposal" className="bench-field">
              <span>送信前の提案文</span>
              <Textarea
                id="mr-proposal"
                rows={3}
                maxLength={MAX_TEXT}
                value={proposal}
                onChange={(e) => update(() => setProposal(e.target.value))}
              />
            </label>
            <div className="bench-columns">
              <div className="bench-field">
                <span id="contract-label">契約形態</span>
                <Select
                  value={bucket}
                  onValueChange={(v) => update(() => setBucket(v || 'single'))}
                >
                  <SelectTrigger aria-labelledby="contract-label">
                    <SelectValue>
                      {bucket === 'single' ? '単発' : '継続'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">単発</SelectItem>
                    <SelectItem value="retainer">継続</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="bench-field">
                <span>依頼者の発注率（%）</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  value={rate}
                  onChange={(e) => update(() => setRate(e.target.value))}
                  placeholder="不明なら空欄"
                />
              </label>
            </div>
          </>
        )}
        {tool === 'free-article' && (
          <>
            <div className="bench-columns">
              <label className="bench-field">
                <span>無料にする範囲（文字目安）</span>
                <input
                  type="number"
                  min="1"
                  max={MAX_TEXT}
                  value={after}
                  onChange={(e) => update(() => setAfter(e.target.value))}
                />
              </label>
              <label className="bench-field">
                <span>完全版の価格（円）</span>
                <input
                  type="number"
                  min="1"
                  max="1000000"
                  value={price}
                  onChange={(e) => update(() => setPrice(e.target.value))}
                />
              </label>
            </div>
            <label htmlFor="mr-summary" className="bench-field">
              <span>まとめ（「- 」から始める3〜5項目）</span>
              <Textarea
                id="mr-summary"
                rows={3}
                maxLength={3000}
                value={summary}
                onChange={(e) => update(() => setSummary(e.target.value))}
              />
            </label>
            <label className="bench-field">
              <span>完全版に残す内容</span>
              <input
                maxLength={300}
                value={contents}
                onChange={(e) => update(() => setContents(e.target.value))}
                placeholder="詳しい手順、テンプレートなど"
              />
            </label>
            <label className="bench-field">
              <span>完全版のnote記事URL</span>
              <input
                type="url"
                maxLength={2000}
                value={url}
                onChange={(e) => update(() => setUrl(e.target.value))}
                placeholder="https://note.com/…/n/…"
              />
              <small className="subnote">
                サンプルのURLは説明用です。公開前に自分の記事URLへ置き換えてください。
              </small>
            </label>
            <p className="subnote">
              要約は自動生成しません。入力したまとめを使い、文やコードの途中を避けて区切ります。出典欄は全文を残します。
            </p>
          </>
        )}
        {tool === 'citations' && (
          <p className="subnote">
            全角の「（出典:
            [ラベル](URL)）」を出典欄に集約します。コードとリンクのない出典は残します。出典の正しさを確かめる機能ではありません。
          </p>
        )}
        <button
          className="black-button bench-run"
          disabled={running}
          onClick={() => void run()}
        >
          <Play size={16} />
          {running
            ? '実行中…'
            : connected
              ? 'PCで実行する'
              : tool === 'coconala'
                ? '条件をチェック'
                : '作成する'}
        </button>
        {error && (
          <p className="bench-error" role="alert">
            {error}
          </p>
        )}
      </fieldset>
      {output && !editing && (
        <div className="bench-output" aria-live="polite">
          <div className="bench-heading">
            <h3>{result ? result.summary : '結果ができました'}</h3>
            <div className="output-actions">
              <button onClick={copy} aria-label="結果をコピー">
                {copied ? <Check size={17} /> : <Copy size={17} />}
              </button>
              <button onClick={download} aria-label="結果をMarkdownで保存">
                <Download size={17} />
              </button>
            </div>
          </div>
          {result && (
            <div className="review-result">
              {[
                ...result.reasons,
                ...result.signals.map((s) => '検出: ' + s),
                ...result.rankingNotes,
              ].map((s) => (
                <p key={s}>{s}</p>
              ))}
              <div className="quiet-note">
                <CircleHelp size={16} />
                <p>
                  Mr.の対応条件を使ったルール照合です。受注・規約適合・収益の保証ではなく、応募や送信も行いません。
                </p>
              </div>
            </div>
          )}
          <Textarea aria-label="生成結果" readOnly rows={8} value={output} />
          <span className="subnote">
            この結果はページを閉じると消えます。必要なら保存してください。
          </span>
        </div>
      )}
    </section>
  );
}
