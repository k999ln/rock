'use client';

import { useState } from 'react';
import { Check, Copy, Download, Play, RotateCcw } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { ExecutionSignin, useExecutionAccess } from '@/components/execution-access';
import {
  executeTracked,
  processedBytes,
  OperationRequestError,
} from '@/lib/operations-client';
import type { JobTool } from '@/lib/operations';
import type { RunRecorder } from '@/lib/device';
import { skyToolLabelFor } from '@/lib/sky-tool-labels';
import { parseProductHuntUrl } from '@/lib/producthunt';

const samples: Record<string, string> = {
  'coconala-proposal-draft':
    '案件: 商品紹介記事の作成。納期3日。必要な経験と確認事項を含めて提案文を作る。',
  'gig-workflow': '案件を受ける前に、応募・交渉・制作・納品・売上確認の順番を整理する。',
  'coconala-inbox': '依頼文、添付ファイル、納期、報酬、確認が必要な点を整理したい。',
  'youtube-script-writer': 'テーマ: Skyに仕事を登録して使えるようにする。5分動画の台本を作る。',
  'seo-blueprint': 'テーマ: ローカルAIツールを安全に仕事で使う方法。検索意図と記事構成を作る。',
  'landing-page-sprint': '商品: 小規模事業者向けのCSV整形サービス。販売ページの構成を作る。',
  'sales-objection-reply-builder': '「料金が高い」と言われたときの、条件を確認する返信と見積り項目を作る。',
  'user-interview-synthesizer': '顧客: 毎週同じCSV作業に時間がかかる。安心して任せたい。',
  'calendar-coordination': '来週の打合せ候補を整理。平日午後、60分、オンライン。',
  'telegram-notifications': '仕事が完了したら、本人確認後にTelegramへ通知する内容を作る。',
  'producthunt-discovery': '候補: ローカルAI、業務自動化、クリエイター向けツール。調査条件を作る。',
  'faster-whisper': '音声ファイルをローカル文字起こしする実行器の接続条件を確認する。',
  'transformers-js': 'ブラウザ内要約モデルを接続するためのモデル・ライセンス・負荷を確認する。',
  playwright: '自分のテストサイトでログイン後の読み取り操作を検証する。送信はしない。',
  'jev-ultrafast': '許可済みのテストページを閲覧し、次の操作候補を一手だけ確認する。',
  'jev-trader': 'PAPER市場の固定リプレイで、価格・仮想注文・手数料の確認条件を整理する。',
  'typesafe-computer-use': '隔離アカウントの許可アプリで、画面観測だけを確認する。',
  'jev-review': 'Skyの実行器接続変更をreviewし、リスクと確認項目を整理する。',
  'jev-router': '短い質問と複雑な実装依頼を、どのモデルへ振り分けるかの条件を作る。',
  'jev-browser': '所有サイトの読み取りだけを行うブラウザ実行器の接続条件を確認する。',
  'mobile-jev': '隔離Android試験端末で、観測だけの操作ジョブ条件を作る。',
};

function outputFor(tool: string, input: string) {
  const value = input.trim();
  if (!value) throw new Error('入力を1行以上入れてください。');
  const header = (title: string) => `# ${title}\n\n入力:\n${value}\n`;
  switch (tool) {
    case 'coconala-proposal-draft':
      return `${header('ココナラ提案文の下書き')}\n## 提案文\nご依頼内容を確認しました。要件・納期・納品形式を確認したうえで、対応範囲と進め方を整理してご提案します。\n\n## 送信前確認\n- 納期と成果物の形式\n- 修正回数と追加作業の扱い\n- 面談・外部連絡の要否\n- 送信前に本人が元ページの条件を確認\n\n※応募・送信は行っていません。`;
    case 'gig-workflow':
      return `${header('受託案件ワークフロー')}\n1. 応募条件と権限を確認\n2. 不明点を質問として分離\n3. 合意した成果物・納期・報酬を固定\n4. 制作・レビュー・納品を記録\n5. 入金はProvider確認後に台帳へ反映\n\n外部送信・契約・入金操作は本人承認が必要です。`;
    case 'coconala-inbox':
      return `${header('ココナラの依頼・添付整理')}\n## 抽出項目\n- 依頼内容\n- 成果物\n- 納期\n- 報酬と追加費用\n- 添付ファイル\n- 返信が必要な確認事項\n\n元ページと添付の内容を本人が確認してから返信してください。`;
    case 'youtube-script-writer':
      return `${header('YouTube台本')}\n## タイトル案\n- 結論からわかる実践タイトル\n- 失敗と改善を含む比較タイトル\n\n## 冒頭\nこの動画では、${value}を短く実演します。\n\n## 本編\n1. 現状と困りごと\n2. Skyでの入力と接続\n3. 実行結果と確認\n4. できること・できないこと\n\n## 撮影キュー\n画面録画 → 入力 → 実行 → 結果確認 → 注意点。`;
    case 'seo-blueprint':
      return `${header('SEO・記事構成')}\n## 検索意図\n読者が知りたいこと、比較したいこと、実際に試したいことを分離する。\n\n## 構成\n1. 結論\n2. 前提と対象読者\n3. 手順\n4. 料金・安全性・制限\n5. FAQ\n6. 次の行動\n\n公開前に出典と事実を本人が確認してください。`;
    case 'landing-page-sprint':
      return `${header('LP・販売ページ制作')}\n## ファーストビュー\n誰の、どの作業を、どの範囲まで短くするかを一文で示す。\n\n## セクション\n- 悩みと対象者\n- 提供範囲\n- 手順と納期\n- 料金と含まれない作業\n- 実績・検証方法\n- FAQ\n- 本人確認付きCTA\n\n公開・決済・広告出稿は実行していません。`;
    case 'sales-objection-reply-builder':
      return `${header('商談返信・見積り支援')}\n## 返信案\nご懸念の点を確認しました。作業範囲、納期、含まれる確認回数を整理したうえで、条件別に見積りをご提示します。\n\n## 見積り項目\n- 成果物\n- 納期\n- 修正回数\n- 外部費用\n- 追加作業\n\n価格提示・送信は本人確認後に行ってください。`;
    case 'user-interview-synthesizer':
      return `${header('顧客インタビュー分析')}\n## 観察された発言\n${value}\n\n## テーマ\n- 時間短縮\n- 安心して任せる条件\n- 結果確認と修正\n\n## 仮説\n最初は小さな入力と検査可能な成果物から始めると導入障壁が下がる。\n\n## 次の検証\n誰が、いつ、何を使い、どの結果なら継続するかを追加確認する。`;
    case 'calendar-coordination':
      return `${header('予定・カレンダー連携')}\n## 候補条件\n- 時間帯: 平日午後\n- 所要時間: 60分\n- 形式: オンライン\n\n## 接続境界\nカレンダーアカウントは未接続のため、候補整理までです。予定作成・変更は実行していません。`;
    case 'telegram-notifications':
      return `${header('Telegram通知・承認')}\n## 通知下書き\nSkyの仕事が完了しました。結果を確認し、必要なら次の操作を本人が承認してください。\n\n## 接続境界\nBot接続と送信先の確認が済むまで、Telegramへは送信しません。`;
    case 'producthunt-discovery':
      return `${header('外部ツール候補の発見')}\n## 調査条件\n- 分野: ローカルAI・業務自動化・クリエイター向け\n- 確認: 公式URL、ライセンス、更新日、料金、権限、導入条件\n- 判定: Sky接続候補 / 要確認 / 対象外\n\n公式API未接続のため、候補条件の作成までです。`;
    default:
      return `${header('Sky実行器接続確認')}\n## 接続済み経路\n- Sky共通ジョブ受付\n- 実行上限・状態・結果保存\n- 副作用なしのローカルアダプター\n\n## 次に必要な接続\n${value}\n\n外部サイト、端末、決済、送信はこの確認では実行していません。実ランタイムを接続する場合は専用の許可範囲を追加します。`;
  }
}

export function SkyCandidateRunner({
  tool,
  name,
  onRecord,
  onRunningChange,
  onOutcome,
  onFailure,
  executionDisabled = false,
}: {
  tool: JobTool;
  name: string;
  onRecord?: RunRecorder;
  onRunningChange?: (running: boolean) => void;
  onOutcome?: (outcome: { ok: boolean; text: string }) => void;
  onFailure?: () => void;
  executionDisabled?: boolean;
}) {
  const guide = skyToolLabelFor(tool);
  const [text, setText] = useState(samples[tool] ?? '実行器の接続条件を確認する。');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [running, setRunning] = useState(false);
  const [sampleInput, setSampleInput] = useState(true);
  const [productHuntUrl, setProductHuntUrl] = useState('');
  const [productHuntError, setProductHuntError] = useState('');
  const { needsSignin, setNeedsSignin } = useExecutionAccess();

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
    if (running || executionDisabled || needsSignin) return;
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
      await onRecord?.(tool, 'browser', 'completed', started, sampleInput, 'passed');
      onOutcome?.({ ok: true, text: `接続前のローカル下書きです。外部サービスは実行していません。\n\n${tracked.result.output}` });
    } catch (reason) {
      if (executed && !completed)
        await onRecord?.(tool, 'browser', 'failed', started, sampleInput, 'failed').catch(() => undefined);
      if (reason instanceof OperationRequestError && reason.status === 401)
        setNeedsSignin(true);
      const message = reason instanceof Error ? reason.message : '入力を確認してください。';
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
    const url = URL.createObjectURL(new Blob([output], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `sky-${tool}.md`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="mr-workbench">
      {needsSignin && <ExecutionSignin />}
      <fieldset disabled={running || executionDisabled || needsSignin}>
        <div className="bench-heading">
          <h3>{name}</h3>
          <span className="outline-tag">ローカル確認・下書き · 外部接続なし</span>
        </div>
        <div className="bench-helper">
          <span>{guide?.helper ?? '入力をSkyの共通ジョブ受付へ送り、結果と実行履歴を保存します。'}</span>
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
        <button className="black-button bench-run" disabled={running} onClick={() => void run()}>
          <Play size={16} /> {running ? '下書き作成中…' : '接続確認の下書きを作る'}
        </button>
        {error && <p className="bench-error" role="alert">{error}</p>}
      </fieldset>
      {tool === 'producthunt-discovery' && (
        <section className="sky-producthunt-import" aria-labelledby="sky-producthunt-import-title">
          <div>
            <p className="sky-tool-eyebrow">PRODUCT HUNT → SKY</p>
            <h3 id="sky-producthunt-import-title">見つけたツールをSkyへ登録</h3>
            <p>
              Product Huntの公開ページURLを引き継ぎ、提供者・接続先・権限を確認する掲載申請を作ります。自動公開や勝手な接続はしません。
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
          {productHuntError && <p className="sky-form-error">{productHuntError}</p>}
          <button type="button" className="black-button" onClick={openProductHuntImport}>
            掲載申請を作る
          </button>
        </section>
      )}
      {output && (
        <div className="bench-output" aria-live="polite">
          <div className="bench-heading">
            <h3>接続確認の下書き</h3>
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
