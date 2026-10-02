'use client';

import { useState } from 'react';
import { Check, Copy, Download, Play, RotateCcw } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import {
  ExecutionSignin,
  useExecutionAccess,
} from '@/components/execution-access';
import {
  executeTracked,
  processedBytes,
  OperationRequestError,
} from '@/lib/operations-client';
import type { JobTool } from '@/lib/operations';
import type { RunRecorder } from '@/lib/device';
import { skyToolLabelFor } from '@/lib/sky-tool-labels';
import { parseProductHuntUrl } from '@/lib/producthunt';
import { candidateOutputKind, outputFor } from '@/lib/sky-candidate-output';

const samples: Record<string, string> = {
  'coconala-proposal-draft':
    '案件: 商品紹介記事の作成。納期3日。必要な経験と確認事項を含めて提案文を作る。',
  'gig-workflow':
    '案件を受ける前に、応募・交渉・制作・納品・売上確認の順番を整理する。',
  'coconala-inbox':
    '依頼文、添付ファイル、納期、報酬、確認が必要な点を整理したい。',
  'youtube-script-writer':
    'テーマ: Skyに仕事を登録して使えるようにする。5分動画の台本を作る。',
  'seo-blueprint':
    'テーマ: ローカルAIツールを安全に仕事で使う方法。検索意図と記事構成を作る。',
  'landing-page-sprint':
    '商品: 小規模事業者向けのCSV整形サービス。販売ページの構成を作る。',
  'sales-objection-reply-builder':
    '「料金が高い」と言われたときの、条件を確認する返信と見積り項目を作る。',
  'user-interview-synthesizer':
    '顧客: 毎週同じCSV作業に時間がかかる。安心して任せたい。',
  'calendar-coordination':
    '来週の打合せ候補を整理。平日午後、60分、オンライン。',
  'telegram-notifications':
    '仕事が完了したら、本人確認後にTelegramへ通知する内容を作る。',
  'producthunt-discovery':
    '候補: ローカルAI、業務自動化、クリエイター向けツール。調査条件を作る。',
  'faster-whisper':
    '音声ファイルをローカル文字起こしする実行器の接続条件を確認する。',
  'transformers-js':
    'ブラウザ内要約モデルを接続するためのモデル・ライセンス・負荷を確認する。',
  playwright:
    '自分のテストサイトでログイン後の読み取り操作を検証する。送信はしない。',
  'jev-ultrafast':
    '許可済みのテストページを閲覧し、次の操作候補を一手だけ確認する。',
  'jev-trader':
    'PAPER市場の固定リプレイで、価格・仮想注文・手数料の確認条件を整理する。',
  'typesafe-computer-use':
    '隔離アカウントの許可アプリで、画面観測だけを確認する。',
  'jev-review': 'Skyの実行器接続変更をreviewし、リスクと確認項目を整理する。',
  'jev-router':
    '短い質問と複雑な実装依頼を、どのモデルへ振り分けるかの条件を作る。',
  'jev-browser':
    '所有サイトの読み取りだけを行うブラウザ実行器の接続条件を確認する。',
  'mobile-jev': '隔離Android試験端末で、観測だけの操作ジョブ条件を作る。',
};

export function SkyCandidateRunner({
  tool,
  name,
  initialInput,
  onRecord,
  onRunningChange,
  onOutcome,
  onFailure,
  executionDisabled = false,
}: {
  tool: JobTool;
  name: string;
  initialInput?: string;
  onRecord?: RunRecorder;
  onRunningChange?: (running: boolean) => void;
  onOutcome?: (outcome: { ok: boolean; text: string }) => void;
  onFailure?: () => void;
  executionDisabled?: boolean;
}) {
  const guide = skyToolLabelFor(tool);
  const isLocalDraft = candidateOutputKind(tool) === 'template';
  const [text, setText] = useState(
    initialInput?.trim() || samples[tool] || '実行器の接続条件を確認する。',
  );
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [running, setRunning] = useState(false);
  const [sampleInput, setSampleInput] = useState(!initialInput?.trim());
  const [productHuntUrl, setProductHuntUrl] = useState('');
  const [productHuntError, setProductHuntError] = useState('');
  const { executionBlocked, accessState, setNeedsSignin } =
    useExecutionAccess();

  function openProductHuntImport() {
    const normalized = parseProductHuntUrl(productHuntUrl);
    if (!normalized) {
      setProductHuntError(
        'Product Huntの公開ページURLを入力してください（例: https://www.producthunt.com/posts/example）。',
      );
      return;
    }
    window.location.assign(
      `/sky/publish?source=producthunt&productUrl=${encodeURIComponent(normalized)}`,
    );
  }

  async function run() {
    if (running || executionDisabled || executionBlocked) return;
    setRunning(true);
    onRunningChange?.(true);
    setError('');
    setOutput('');
    setCopied(false);
    const started = performance.now();
    let executed = false;
    let completed = false;
    try {
      const tracked = await executeTracked<{ output: string }>({
        tool,
        transport: 'browser',
        sample: sampleInput,
        inputBytes: processedBytes(text),
        task: () => {
          executed = true;
          return { output: outputFor(tool, text) };
        },
      });
      completed = true;
      setOutput(tracked.result.output);
      setError(tracked.warning);
      await onRecord?.(
        tool,
        'browser',
        'completed',
        started,
        sampleInput,
        'passed',
      );
      onOutcome?.({
        ok: true,
        text: `${isLocalDraft ? 'ローカル下書き' : '実行器の接続計画'}です。外部サービスは実行していません。\n\n${tracked.result.output}`,
      });
    } catch (reason) {
      if (executed && !completed)
        await onRecord?.(
          tool,
          'browser',
          'failed',
          started,
          sampleInput,
          'failed',
        ).catch(() => undefined);
      if (reason instanceof OperationRequestError && reason.status === 401)
        setNeedsSignin(true);
      const message =
        reason instanceof Error ? reason.message : '入力を確認してください。';
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
      setError('コピーできませんでした。結果欄から選択してください。');
    }
  }

  function download() {
    const url = URL.createObjectURL(
      new Blob([output], { type: 'text/markdown;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `sky-${tool}.md`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="mr-workbench">
      {executionBlocked && <ExecutionSignin state={accessState} />}
      <fieldset disabled={running || executionDisabled || executionBlocked}>
        <div className="bench-heading">
          <h3>{name}</h3>
          <span className="outline-tag">
            {isLocalDraft ? 'ローカル下書き' : '接続条件の確認'} · 外部接続なし
          </span>
        </div>
        <p className="bench-helper">
          {isLocalDraft
            ? '定型の記入用テンプレートです。AIによる分析ではありません。'
            : '接続計画のひな形です。ツール本体は実行しません。'}{' '}
          本文と結果はサーバーに保存せず、処理状態と入出力サイズを記録します。
        </p>
        <div className="bench-helper">
          <span>
            {guide?.helper ??
              '本文はこの端末で処理し、状態・所要時間・入出力サイズだけをSkyの実行履歴へ記録します。本文と結果はサーバーに保存しません。'}
          </span>
          <button
            className="text-link"
            onClick={() => {
              setText(samples[tool] ?? '実行器の接続条件を確認する。');
              setSampleInput(true);
              setOutput('');
              setError('');
            }}
          >
            <RotateCcw size={14} /> サンプルを入れる
          </button>
        </div>
        <label className="bench-field" htmlFor={`sky-candidate-input-${tool}`}>
          <span>{guide?.role ?? '依頼・入力'}</span>
          <Textarea
            id={`sky-candidate-input-${tool}`}
            rows={7}
            maxLength={100000}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setSampleInput(false);
              setOutput('');
              setError('');
            }}
            placeholder={guide?.placeholder ?? 'このツールに頼みたい内容を入力'}
          />
        </label>
        <button
          className="black-button bench-run"
          disabled={running}
          onClick={() => void run()}
        >
          <Play size={16} />{' '}
          {running
            ? '処理中…'
            : isLocalDraft
              ? '下書きを作る'
              : '接続条件を整理する'}
        </button>
        {error && (
          <p className="bench-error" role="alert">
            {error}
          </p>
        )}
      </fieldset>
      {tool === 'producthunt-discovery' && (
        <section
          className="sky-producthunt-import"
          aria-labelledby="sky-producthunt-import-title"
        >
          <div>
            <p className="sky-tool-eyebrow">PRODUCT HUNT → SKY</p>
            <h3 id="sky-producthunt-import-title">見つけたツールをSkyへ登録</h3>
            <p>
              Product
              Huntの公開ページURLを引き継ぎ、提供者・接続先・権限を確認する掲載申請を作ります。自動公開や勝手な接続はしません。
            </p>
          </div>
          <label className="bench-field" htmlFor="sky-producthunt-url">
            Product Hunt URL
            <input
              id="sky-producthunt-url"
              type="url"
              value={productHuntUrl}
              onChange={(event) => {
                setProductHuntUrl(event.target.value);
                setProductHuntError('');
              }}
              placeholder="https://www.producthunt.com/posts/..."
            />
          </label>
          {productHuntError && (
            <p className="sky-form-error">{productHuntError}</p>
          )}
          <button
            type="button"
            className="black-button"
            onClick={openProductHuntImport}
          >
            掲載申請を作る
          </button>
        </section>
      )}
      {output && (
        <div className="bench-output" aria-live="polite">
          <div className="bench-heading">
            <h3>{isLocalDraft ? 'ローカル下書き' : '接続条件の確認結果'}</h3>
            <div className="output-actions">
              <button onClick={() => void copy()} aria-label="下書きをコピー">
                {copied ? <Check size={17} /> : <Copy size={17} />}
              </button>
              <button onClick={download} aria-label="下書きをMarkdownで保存">
                <Download size={17} />
              </button>
            </div>
          </div>
          <pre className="bench-result">{output}</pre>
        </div>
      )}
    </section>
  );
}
