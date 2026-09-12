'use client';

import { useMemo, useState, type SyntheticEvent } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  PhoneCall,
  Scale,
  ShieldAlert,
} from 'lucide-react';
import {
  LEGAL_DIRECTORY_AS_OF,
  assessLegalIntake,
  buildHandoffSummary,
  getSelfHelpResources,
  legalIssueCategories,
  officialLegalResources,
  recommendLawyers,
  type LegalAssessment,
  type LegalContactPreference,
  type LegalIntakeInput,
  type LegalIssueId,
  type LegalLocation,
  type LegalMatterStage,
  type LawyerDirectoryEntry,
} from '@/lib/legal-intake';
import type { LegalAiResult } from '@/lib/legal-ai';

const locationLabels: Record<LegalLocation, string> = {
  nyc: 'ニューヨーク市',
  ny_state: 'ニューヨーク州（NYC以外）',
  new_jersey: 'ニュージャージー州',
  pennsylvania: 'ペンシルベニア州',
  other: 'その他・不明',
};

const stageLabels: Record<LegalMatterStage, string> = {
  general_information: '一般情報を知りたい',
  active_problem: '現在進行中の問題がある',
  document_review: '契約書・通知などを確認したい',
  court_or_agency: '裁判所・警察・行政機関が関係している',
};

const urgencyLabels: Record<LegalAssessment['urgency'], string> = {
  emergency: '緊急',
  urgent: '至急',
  lawyer_recommended: '弁護士相談を推奨',
  guided_information: '情報整理',
};

const emptyInput: LegalIntakeInput = {
  issueType: 'criminal',
  location: 'nyc',
  matterStage: 'general_information',
  situationSummary: '',
  desiredOutcome: '',
  deadlineDate: undefined,
  immediateDanger: false,
  detainedOrArrested: false,
  domesticViolence: false,
  receivedOfficialDocument: false,
  contactPreference: 'email',
};

function contactHref(
  lawyer: LawyerDirectoryEntry,
  preference: LegalContactPreference,
  summary: string,
) {
  if (preference === 'email' && lawyer.email)
    return `mailto:${lawyer.email}?subject=${encodeURIComponent('日本語での法律相談希望')}&body=${encodeURIComponent(summary)}`;
  if (preference === 'phone' && lawyer.phone) return `tel:${lawyer.phone}`;
  if (lawyer.website) return lawyer.website;
  if (lawyer.email)
    return `mailto:${lawyer.email}?subject=${encodeURIComponent('日本語での法律相談希望')}&body=${encodeURIComponent(summary)}`;
  return lawyer.phone ? `tel:${lawyer.phone}` : null;
}

function contactLabel(
  lawyer: LawyerDirectoryEntry,
  preference: LegalContactPreference,
) {
  if (preference === 'email' && lawyer.email) return 'メールを作成';
  if (preference === 'phone' && lawyer.phone) return '電話する';
  return lawyer.website
    ? '公式サイト'
    : lawyer.email
      ? 'メールを作成'
      : '電話する';
}

export function LegalIntakeRunner({
  onRunningChange,
  executionDisabled = false,
}: {
  onRunningChange?: (running: boolean) => void;
  executionDisabled?: boolean;
}) {
  const [input, setInput] = useState<LegalIntakeInput>(emptyInput);
  const [understood, setUnderstood] = useState(false);
  const [assessment, setAssessment] = useState<LegalAssessment | null>(null);
  const [notice, setNotice] = useState('まず安全と期限を確認します。');
  const [copied, setCopied] = useState(false);
  const [aiResult, setAiResult] = useState<LegalAiResult | null>(null);
  const [aiError, setAiError] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const handoffSummary = useMemo(
    () => (assessment ? buildHandoffSummary(input, assessment) : ''),
    [assessment, input],
  );
  const lawyers = useMemo(
    () =>
      assessment?.lawyerRequired
        ? recommendLawyers(input.issueType, input.location)
        : [],
    [assessment, input.issueType, input.location],
  );
  const selfHelp = useMemo(
    () => getSelfHelpResources(input.issueType, input.location),
    [input.issueType, input.location],
  );

  function update<K extends keyof LegalIntakeInput>(
    key: K,
    value: LegalIntakeInput[K],
  ) {
    setInput((current) => ({ ...current, [key]: value }));
    setAssessment(null);
    setCopied(false);
    setAiResult(null);
    setAiError('');
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!understood) {
      setNotice(
        '法的助言ではなく、入力内容を保存しないことを確認してください。',
      );
      return;
    }
    onRunningChange?.(true);
    const next = assessLegalIntake(input);
    setAssessment(next);
    setAiResult(null);
    setAiError('');
    setNotice(
      next.primaryCounselId
        ? '刑事弁護の第一連絡候補として藤原茜弁護士を表示しました。連絡前に内容を確認してください。'
        : next.lawyerRequired
          ? '弁護士へ渡す要約と候補を準備しました。連絡前に内容を確認してください。'
          : '一般情報を確認するための次の手順を整理しました。',
    );
    if (next.urgency === 'emergency') {
      onRunningChange?.(false);
      return;
    }
    setAiLoading(true);
    try {
      const response = await fetch('/api/legal-guidance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const payload = (await response.json()) as LegalAiResult & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error || '法令AIを利用できません。');
      setAiResult(payload);
      setNotice(
        next.lawyerRequired
          ? '公式情報の一次回答と弁護士への引継ぎを用意しました。'
          : '公式情報の一次回答と無料・公的な次の行動を用意しました。',
      );
    } catch (error) {
      setAiError(
        error instanceof Error
          ? error.message
          : '法令AIを利用できません。公的案内から確認してください。',
      );
    } finally {
      setAiLoading(false);
      onRunningChange?.(false);
    }
  }

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(handoffSummary);
      setCopied(true);
      setNotice('引継ぎ要約をコピーしました。送信前に内容を確認してください。');
    } catch {
      setNotice('コピーできませんでした。要約欄を選択してコピーしてください。');
    }
  }

  return (
    <section className="legal-runner">
      <div className="legal-runner-intro">
        <span className="legal-runner-mark" aria-hidden="true">
          <Scale size={22} />
        </span>
        <div>
          <h3>公式情報で解決を試し、必要な案件だけ弁護士へ</h3>
          <p>
            法令AIが政府・裁判所の公式情報だけを検索して一般案内を作ります。
            刑事弁護が必要な案件は、藤原茜弁護士を第一連絡候補として引き継ぎます。
          </p>
        </div>
      </div>

      <div className="legal-runner-privacy">
        <ShieldAlert size={18} />
        <p>
          Skyは相談内容を保存しません。法令AIを使うと入力は回答作成のためOpenAIへ送られ、APIの応答保存機能はオフにします。OpenAI側のデータ保持は契約設定に従います。
          社会保障番号、口座・カード番号、パスワード、移民の受領番号、診療記録の全文は入力しないでください。
        </p>
      </div>

      {input.immediateDanger && (
        <div className="legal-runner-emergency" role="alert">
          <AlertTriangle size={20} />
          <div>
            <strong>今すぐ危険がある場合は、米国内では911へ。</strong>
            <p>
              {input.domesticViolence
                ? 'NYCの24時間HOPE Hotlineは 1-800-621-4673 です。安全な端末から連絡してください。'
                : '入力を続けるより、安全な場所へ移動して緊急窓口へ連絡してください。'}
            </p>
          </div>
        </div>
      )}

      <form className="legal-runner-form" onSubmit={submit}>
        <fieldset disabled={executionDisabled}>
          <legend>最初に安全確認</legend>
          <div className="legal-runner-checks">
            <label>
              <input
                type="checkbox"
                checked={input.immediateDanger}
                onChange={(event) =>
                  update('immediateDanger', event.target.checked)
                }
              />
              <span>
                <strong>今すぐ危険がある</strong>暴力、脅迫、追跡、身の危険など
              </span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={input.detainedOrArrested}
                onChange={(event) =>
                  update('detainedOrArrested', event.target.checked)
                }
              />
              <span>
                <strong>逮捕・拘束・出頭要請がある</strong>
                本人または近しい人が対象
              </span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={input.domesticViolence}
                onChange={(event) =>
                  update('domesticViolence', event.target.checked)
                }
              />
              <span>
                <strong>家庭内暴力・対人安全の懸念がある</strong>
                安全な端末で入力してください
              </span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={input.receivedOfficialDocument}
                onChange={(event) =>
                  update('receivedOfficialDocument', event.target.checked)
                }
              />
              <span>
                <strong>裁判所・警察・行政機関から書類が届いた</strong>
                書類にある期日を確認してください
              </span>
            </label>
          </div>
        </fieldset>

        <div className="legal-runner-grid">
          <label>
            相談分野
            <select
              value={input.issueType}
              onChange={(event) =>
                update('issueType', event.target.value as LegalIssueId)
              }
            >
              {legalIssueCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            問題が起きている地域
            <select
              value={input.location}
              onChange={(event) =>
                update('location', event.target.value as LegalLocation)
              }
            >
              {Object.entries(locationLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            現在の段階
            <select
              value={input.matterStage}
              onChange={(event) =>
                update('matterStage', event.target.value as LegalMatterStage)
              }
            >
              {Object.entries(stageLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            書類にある期限・期日（任意）
            <input
              type="date"
              value={input.deadlineDate ?? ''}
              onChange={(event) =>
                update('deadlineDate', event.target.value || undefined)
              }
            />
          </label>
        </div>

        <label className="legal-runner-text">
          状況を時系列で教えてください
          <textarea
            required
            minLength={20}
            maxLength={2000}
            value={input.situationSummary}
            onChange={(event) => update('situationSummary', event.target.value)}
            placeholder="例：9月10日に勤務先から通知を受け取り、9月18日までに返答するよう書かれています。"
          />
          <small>{input.situationSummary.length} / 2,000</small>
        </label>
        <label className="legal-runner-text">
          どうなればよいですか？（任意）
          <textarea
            maxLength={500}
            value={input.desiredOutcome}
            onChange={(event) => update('desiredOutcome', event.target.value)}
            placeholder="例：期限内に必要な対応を確認したい"
          />
          <small>{input.desiredOutcome.length} / 500</small>
        </label>
        <label className="legal-runner-contact">
          希望する連絡方法
          <select
            value={input.contactPreference}
            onChange={(event) =>
              update(
                'contactPreference',
                event.target.value as LegalContactPreference,
              )
            }
          >
            <option value="email">メール</option>
            <option value="phone">電話</option>
            <option value="website">公式サイト</option>
          </select>
        </label>
        <label className="legal-runner-consent">
          <input
            type="checkbox"
            checked={understood}
            onChange={(event) => setUnderstood(event.target.checked)}
          />
          <span>
            この受付は法的助言ではなく、弁護士・依頼者関係や秘匿特権は成立しないこと、入力が一次回答のためOpenAIへ送られることを理解しました。
          </span>
        </label>
        <button
          className="black-button legal-runner-submit"
          type="submit"
          disabled={
            executionDisabled ||
            !understood ||
            input.situationSummary.trim().length < 20
          }
        >
          公式情報で回答して、必要なら引き継ぐ
        </button>
      </form>

      <output className="legal-runner-status" aria-live="polite">
        {notice}
      </output>

      {assessment && (
        <section className="legal-runner-result" aria-live="polite">
          <div className={`legal-runner-triage ${assessment.urgency}`}>
            <span>{urgencyLabels[assessment.urgency]}</span>
            <h3>{assessment.headline}</h3>
            <p>{assessment.explanation}</p>
          </div>
          {assessment.urgency !== 'emergency' && (
            <div className="legal-runner-ai">
              <div className="legal-runner-ai-heading">
                <div>
                  <span>公式ドメイン限定</span>
                  <h3>法令AIの一次回答</h3>
                </div>
                {aiResult && (
                  <small>
                    {new Date(aiResult.searchedAt).toLocaleString('ja-JP')} 確認
                  </small>
                )}
              </div>
              {aiLoading ? (
                <p className="legal-runner-ai-state">
                  政府・裁判所の公式情報を検索しています…
                </p>
              ) : aiResult ? (
                <>
                  <div className="legal-runner-ai-answer">
                    {aiResult.answer}
                  </div>
                  <div className="legal-runner-ai-sources">
                    <strong>根拠にした公式情報</strong>
                    {aiResult.citations.map((citation) => (
                      <a
                        key={citation.url}
                        href={citation.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {citation.title}
                        <ExternalLink size={14} />
                      </a>
                    ))}
                  </div>
                </>
              ) : (
                <p className="legal-runner-ai-state">
                  {aiError ||
                    '入力後に、根拠リンク付きの一般案内を表示します。'}
                </p>
              )}
              <small>
                一般情報です。個別の権利・期限・取調べ対応・勝敗は弁護士に確認してください。
              </small>
            </div>
          )}
          <div className="legal-runner-actions">
            <article>
              <h4>次にすること</h4>
              <ol>
                {assessment.nextActions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ol>
            </article>
            <article>
              <h4>手元に用意するもの</h4>
              <ul>
                {assessment.documentChecklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          </div>

          {assessment.lawyerRequired ? (
            <div className="legal-runner-handoff">
              <div className="legal-runner-summary">
                <h3>弁護士へ渡す要約</h3>
                <textarea
                  aria-label="弁護士への引継ぎ要約"
                  readOnly
                  value={handoffSummary}
                />
                <button type="button" onClick={() => void copySummary()}>
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? 'コピーしました' : '要約をコピー'}
                </button>
                <small>
                  連絡ボタンはメール・電話・公式サイトを開くだけです。内容を確認し、ご本人が送信してください。
                </small>
              </div>
              <div className="legal-runner-lawyers">
                <div>
                  <p>分野＋地域で絞り込み</p>
                  <h3>
                    {assessment.primaryCounselId
                      ? '刑事弁護：藤原茜弁護士へ引継ぎ'
                      : '日本語対応の候補'}
                  </h3>
                  <small>
                    {assessment.primaryCounselId
                      ? '藤原茜弁護士を第一連絡候補として表示します。自動送信・受任確定は行いません。'
                      : `在ニューヨーク日本国総領事館の公開リスト（${LEGAL_DIRECTORY_AS_OF}現在）を使用。推薦・斡旋ではありません。`}
                  </small>
                </div>
                {lawyers.map((lawyer) => {
                  const href = contactHref(
                    lawyer,
                    input.contactPreference,
                    handoffSummary,
                  );
                  return (
                    <article
                      key={lawyer.id}
                      className={
                        lawyer.id === assessment.primaryCounselId
                          ? 'legal-runner-primary-lawyer'
                          : undefined
                      }
                    >
                      <span>
                        {lawyer.id === assessment.primaryCounselId
                          ? '第一連絡候補 · 刑事弁護'
                          : (lawyer.contactNote ?? '日本語対応窓口')}
                      </span>
                      <h4>{lawyer.name}</h4>
                      <p>{lawyer.focus}</p>
                      {href && (
                        <a
                          href={href}
                          target={
                            href.startsWith('http') ? '_blank' : undefined
                          }
                          rel={
                            href.startsWith('http') ? 'noreferrer' : undefined
                          }
                        >
                          {input.contactPreference === 'phone' ? (
                            <PhoneCall size={15} />
                          ) : (
                            <ExternalLink size={15} />
                          )}
                          {contactLabel(lawyer, input.contactPreference)}
                        </a>
                      )}
                      <small>
                        受任可否、費用、対応地域、利益相反を直接確認してください。
                      </small>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="legal-runner-guide">
            <h3>まず無料・公的な窓口で解決を試す</h3>
            <p>
              書式の作成や一般情報の確認は、次の公式・非営利サービスから始められます。
            </p>
            <div className="legal-runner-guide-links">
              {selfHelp.map((resource) => (
                <a
                  key={resource.id}
                  href={resource.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>
                    <strong>{resource.label}</strong>
                    {resource.description}
                  </span>
                  <ExternalLink size={15} />
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="legal-runner-resources">
        <a
          href={officialLegalResources.nyCourtsFindLawyer}
          target="_blank"
          rel="noreferrer"
        >
          NY Courts <ExternalLink size={13} />
        </a>
        <a
          href={officialLegalResources.nycDomesticViolence}
          target="_blank"
          rel="noreferrer"
        >
          NYC DV Support <ExternalLink size={13} />
        </a>
        <a
          href={officialLegalResources.consulateInterpreterDirectory}
          target="_blank"
          rel="noreferrer"
        >
          ATA 通訳者検索 <ExternalLink size={13} />
        </a>
      </div>
    </section>
  );
}
