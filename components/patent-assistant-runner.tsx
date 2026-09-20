'use client';

import { useMemo, useState, type SyntheticEvent } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  ExternalLink,
  FileCheck2,
  Lightbulb,
  Search,
  ShieldCheck,
} from 'lucide-react';
import {
  assessPatentReadiness,
  buildPatentPacket,
  buildPatentSearchQueries,
  disclosureLabels,
  type PatentAssessment,
  type PatentIntakeInput,
} from '@/lib/patent-assistant';
import type { PatentAiResult } from '@/lib/patent-ai';

const emptyInput: PatentIntakeInput = {
  inventionTitle: '',
  problem: '',
  mechanism: '',
  architecture: '',
  technicalEffect: '',
  differences: '',
  knownPriorArt: '',
  inventor: '',
  applicant: '',
  disclosureStatus: 'not_disclosed',
  disclosureDate: undefined,
};

const fieldHelp: Array<{
  key: keyof Pick<
    PatentIntakeInput,
    | 'problem'
    | 'mechanism'
    | 'architecture'
    | 'technicalEffect'
    | 'differences'
    | 'knownPriorArt'
  >;
  label: string;
  help: string;
  placeholder: string;
}> = [
  {
    key: 'problem',
    label: '解決したい技術的な課題',
    help: '誰が困るかだけでなく、処理速度・精度・通信・記憶・制御などの課題を書きます。',
    placeholder:
      '例: 複数システムの実行結果が分散し、失敗後の安全な再開位置を特定できない…',
  },
  {
    key: 'mechanism',
    label: '課題を解く具体的な仕組み',
    help: '入力、判定、処理、出力を順番に書きます。単なる目的や効果だけにはしません。',
    placeholder: '例: 各処理に冪等キーを付与し、状態遷移と実行証跡を照合して…',
  },
  {
    key: 'architecture',
    label: '構成要素とデータの流れ',
    help: '端末、サーバー、DB、モデル、センサー等と、それぞれの役割を書きます。',
    placeholder:
      '例: クライアント、ポリシーゲートウェイ、実行器、証跡DBから構成され…',
  },
  {
    key: 'technicalEffect',
    label: '仕組みから生じる技術的効果',
    help: '速くなる、誤作動を抑える、通信量を減らす等を、仕組みとの因果関係で書きます。',
    placeholder:
      '例: 重複実行を防ぎながら、障害後も最後に確認済みの状態から再開できる…',
  },
  {
    key: 'differences',
    label: '既存技術・製品との違い',
    help: '既知の方法にはない構成、順序、条件、組合せを書きます。',
    placeholder:
      '例: 一般的なジョブキューと異なり、外部送信前の人の承認状態も証跡に含め…',
  },
  {
    key: 'knownPriorArt',
    label: '知っている特許・論文・製品（任意）',
    help: '名称やURLがあれば記載します。分からなければ空欄で構いません。',
    placeholder: '製品名、公開番号、論文名、URLなど',
  },
];

export function PatentAssistantRunner({
  onRunningChange,
  onOutcome,
  executionDisabled = false,
}: {
  onRunningChange?: (running: boolean) => void;
  onOutcome?: (outcome: { ok: boolean; text: string }) => void;
  executionDisabled?: boolean;
}) {
  const [input, setInput] = useState<PatentIntakeInput>(emptyInput);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [assessment, setAssessment] = useState<PatentAssessment | null>(null);
  const [research, setResearch] = useState<PatentAiResult | null>(null);
  const [researchConsent, setResearchConsent] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState(
    '発明の公開状況と権利者候補から確認します。',
  );
  const [error, setError] = useState('');

  const queries = useMemo(() => buildPatentSearchQueries(input), [input]);
  const packet = useMemo(
    () => (assessment ? buildPatentPacket(input, assessment, research) : ''),
    [assessment, input, research],
  );

  function update<K extends keyof PatentIntakeInput>(
    key: K,
    value: PatentIntakeInput[K],
  ) {
    setInput((current) => ({ ...current, [key]: value }));
    setAssessment(null);
    setResearch(null);
    setReviewed(false);
    setError('');
  }

  function goToDetails(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (input.inventionTitle.trim().length < 3) {
      setNotice('発明の仮タイトルを3文字以上で入力してください。');
      return;
    }
    setStep(2);
    setNotice('仕組み、構成、効果、既存技術との差を具体化します。');
  }

  async function analyze(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = assessPatentReadiness(input);
    setAssessment(next);
    setStep(3);
    setResearch(null);
    setReviewed(false);
    setError('');
    setNotice(
      researchConsent
        ? '入力内容を保存せず、公式特許情報から候補を調べています。'
        : '端末内で予備評価と書類ドラフトを作成しました。',
    );
    if (!researchConsent) {
      onOutcome?.({ ok: true, text: '端末内で予備評価と書類ドラフトを作成しました。出願・提出はしていません。内容はこのカードで確認してください。' });
      return;
    }

    setRunning(true);
    onRunningChange?.(true);
    try {
      const response = await fetch('/api/patent-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const payload = (await response.json()) as PatentAiResult & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error || '先行技術調査を利用できません。');
      setResearch(payload);
      onOutcome?.({ ok: true, text: '先行技術候補と出典を取得しました。原文とドラフトをこのカードで確認してください。' });
      setNotice(
        '先行技術候補と出典を追加しました。原文を確認してから書類を利用してください。',
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : '先行技術調査を利用できません。',
      );
      setNotice(
        'オンライン調査は利用できないため、端末内の検索式と書類ドラフトへ切り替えました。',
      );
      onOutcome?.({ ok: false, text: 'オンライン調査は利用できませんでした。端末内の検索式とドラフトをこのカードで確認してください。' });
    } finally {
      setRunning(false);
      onRunningChange?.(false);
    }
  }

  function downloadPacket() {
    if (!reviewed || !packet) {
      setNotice(
        '内容を確認し、専門家レビュー前のドラフトであることに同意してください。',
      );
      return;
    }
    const objectUrl = URL.createObjectURL(
      new Blob([packet], { type: 'text/markdown;charset=utf-8' }),
    );
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = 'sky-patent-filing-preparation.md';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    setNotice(
      '提出準備パケットを保存しました。提出前に専門家と本人が最終確認してください。',
    );
  }

  return (
    <section className="legal-runner patent-runner">
      <section className="legal-agent-chat" aria-label="特許出願アシスタント">
        <header>
          <span className="legal-agent-avatar" aria-hidden="true">
            <Lightbulb size={19} />
          </span>
          <div>
            <strong>特許出願アシスタント</strong>
            <span>発明整理・先行技術調査・書類ドラフト</span>
          </div>
          <small>REVIEW GATE</small>
        </header>
        <div className="legal-agent-boundaries">
          <span>
            <ShieldCheck size={15} /> 入力はSkyに保存しません
          </span>
          <span>
            <FileCheck2 size={15} /> 提出前に人の承認が必要です
          </span>
        </div>
        <div className="patent-agent-summary">
          <p>
            特許になり得る技術的な特徴を整理し、公式データベースの検索候補、明細書・請求項・要約のドラフトをまとめます。
          </p>
          <p>
            登録可能性は保証しません。電子署名、料金支払、特許庁への提出は行いません。
          </p>
        </div>
      </section>

      <ol className="legal-runner-progress" aria-label="特許準備の進み具合">
        {['基本情報', '技術内容', '調査・書類'].map((label, index) => {
          const number = (index + 1) as 1 | 2 | 3;
          return (
            <li
              key={label}
              className={
                number === step ? 'current' : number < step ? 'done' : ''
              }
              aria-current={number === step ? 'step' : undefined}
            >
              <span>{number < step ? <Check size={14} /> : number}</span>
              {label}
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <form className="legal-runner-form" onSubmit={goToDetails}>
          <div className="legal-runner-step-heading">
            <span>CONFIDENTIAL INTAKE</span>
            <h3>発明と公開状況を確認</h3>
            <p>
              公開前の内容は必要最小限にし、パスワードや顧客データは入力しないでください。
            </p>
          </div>
          <fieldset disabled={executionDisabled} className="patent-fields">
            <label className="legal-runner-text">
              発明の仮タイトル
              <input
                value={input.inventionTitle}
                maxLength={200}
                onChange={(event) =>
                  update('inventionTitle', event.target.value)
                }
                placeholder="例: 承認状態を含む自動化ジョブ再開システム"
              />
            </label>
            <div className="legal-runner-grid">
              <label>
                発明者候補
                <input
                  value={input.inventor}
                  maxLength={200}
                  onChange={(event) => update('inventor', event.target.value)}
                  placeholder="未確定なら空欄"
                />
              </label>
              <label>
                出願人候補
                <input
                  value={input.applicant}
                  maxLength={200}
                  onChange={(event) => update('applicant', event.target.value)}
                  placeholder="個人または法人。未確定なら空欄"
                />
              </label>
              <label>
                公開状況
                <select
                  value={input.disclosureStatus}
                  onChange={(event) =>
                    update(
                      'disclosureStatus',
                      event.target
                        .value as PatentIntakeInput['disclosureStatus'],
                    )
                  }
                >
                  {Object.entries(disclosureLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                公開日候補
                <input
                  type="date"
                  value={input.disclosureDate ?? ''}
                  onChange={(event) =>
                    update('disclosureDate', event.target.value || undefined)
                  }
                />
              </label>
            </div>
          </fieldset>
          {input.disclosureStatus === 'already_disclosed' && (
            <div className="legal-runner-emergency" role="alert">
              <AlertTriangle size={19} />
              <p>
                公開済みの場合は時間が重要です。公開日・公開内容・公開先を保存し、出願前に弁理士へ至急確認してください。
              </p>
            </div>
          )}
          <button className="black-button legal-runner-next" type="submit">
            技術内容へ <ArrowRight size={17} />
          </button>
        </form>
      )}

      {step === 2 && (
        <form className="legal-runner-form" onSubmit={analyze}>
          <div className="legal-runner-step-heading">
            <span>INVENTION DETAILS</span>
            <h3>特許として調べる特徴を整理</h3>
            <p>
              目的だけでなく、コンピュータや装置がどう動くかを書いてください。
            </p>
          </div>
          <fieldset
            disabled={executionDisabled || running}
            className="patent-fields"
          >
            {fieldHelp.map((field) => (
              <label className="legal-runner-text" key={field.key}>
                {field.label}
                <textarea
                  rows={field.key === 'knownPriorArt' ? 3 : 4}
                  maxLength={2_000}
                  required={field.key !== 'knownPriorArt'}
                  minLength={field.key !== 'knownPriorArt' ? 10 : undefined}
                  value={input[field.key]}
                  onChange={(event) => update(field.key, event.target.value)}
                  placeholder={field.placeholder}
                />
                <small>{field.help}</small>
              </label>
            ))}
            <label className="legal-runner-consent">
              <input
                type="checkbox"
                checked={researchConsent}
                onChange={(event) => setResearchConsent(event.target.checked)}
              />
              <span>
                先行技術候補を調べるため、この入力をOpenAIへ送ることに同意します。API応答保存はオフですが、保持条件は運営契約に従います。
              </span>
            </label>
          </fieldset>
          <div className="legal-runner-form-actions">
            <button
              type="button"
              className="legal-runner-back"
              onClick={() => setStep(1)}
            >
              <ArrowLeft size={16} /> 戻る
            </button>
            <button
              className="black-button legal-runner-submit"
              type="submit"
              disabled={running}
            >
              {researchConsent ? (
                <Search size={17} />
              ) : (
                <FileCheck2 size={17} />
              )}
              {researchConsent
                ? '公式情報を調査して書類作成'
                : '端末内で書類作成'}
            </button>
          </div>
        </form>
      )}

      <output className="legal-runner-status" aria-live="polite">
        {running ? '公式特許情報を確認しています…' : notice}
      </output>
      {error && <p className="patent-error">{error}</p>}

      {step === 3 && assessment && (
        <section className="legal-runner-result" aria-live="polite">
          <div className="legal-runner-result-heading">
            <div>
              <span>PRELIMINARY RESULT</span>
              <h3>{assessment.headline}</h3>
            </div>
            <button type="button" onClick={() => setStep(2)}>
              <ArrowLeft size={15} /> 修正
            </button>
          </div>
          <div className="patent-score">
            <strong>{assessment.score}</strong>
            <span>/ 100 準備度</span>
          </div>
          {(assessment.warnings.length > 0 || assessment.gaps.length > 0) && (
            <div className="legal-runner-triage urgent">
              <span>REVIEW REQUIRED</span>
              {assessment.warnings.map((item) => (
                <p key={item}>重要: {item}</p>
              ))}
              {assessment.gaps.map((item) => (
                <p key={item}>補足: {item}</p>
              ))}
            </div>
          )}
          <section className="legal-runner-ai">
            <h4>
              {research
                ? '公式情報に基づく先行技術候補'
                : '検索式と公式データベース'}
            </h4>
            {research ? (
              <>
                <p className="patent-research-answer">{research.answer}</p>
                <div className="legal-runner-guide-links">
                  {research.citations.map((citation) => (
                    <a
                      key={citation.url}
                      href={citation.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {citation.title} <ExternalLink size={14} />
                    </a>
                  ))}
                </div>
              </>
            ) : (
              <>
                <code className="patent-query">
                  {queries.japanese || '入力内容から生成します'}
                </code>
                <div className="legal-runner-guide-links">
                  {queries.databaseLinks.map((link) => (
                    <a
                      key={link.label}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {link.label} <ExternalLink size={14} />
                    </a>
                  ))}
                </div>
              </>
            )}
          </section>
          <details className="patent-packet-preview" open>
            <summary>明細書・請求項・要約・提出チェックを確認</summary>
            <pre>{packet}</pre>
          </details>
          <label className="legal-runner-consent">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(event) => setReviewed(event.target.checked)}
            />
            <span>
              内容を確認しました。これは専門家レビュー前のドラフトで、Skyが提出を代行しないことを理解しました。
            </span>
          </label>
          <button
            type="button"
            className="black-button legal-runner-submit"
            disabled={!reviewed}
            onClick={downloadPacket}
          >
            <Download size={17} /> 提出準備パケットを保存
          </button>
        </section>
      )}
    </section>
  );
}
