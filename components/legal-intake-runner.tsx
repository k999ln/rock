'use client';

import { useMemo, useState, type SyntheticEvent } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  Copy,
  ExternalLink,
  PhoneCall,
  Scale,
  ShieldAlert,
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
import {
  buildLocalLegalResult,
  type LegalAiResult,
} from '@/lib/legal-ai';

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

function LawyerCard({
  lawyer,
  preference,
  summary,
  primary,
}: {
  lawyer: LawyerDirectoryEntry;
  preference: LegalContactPreference;
  summary: string;
  primary: boolean;
}) {
  const href = contactHref(lawyer, preference, summary);
  return (
    <article className={primary ? 'legal-runner-primary-lawyer' : undefined}>
      <span>
        {primary
          ? '第一連絡候補 · 刑事弁護'
          : (lawyer.contactNote ?? '日本語対応窓口')}
      </span>
      <h4>{lawyer.name}</h4>
      <p>{lawyer.focus}</p>
      {href && (
        <a
          href={href}
          target={href.startsWith('http') ? '_blank' : undefined}
          rel={href.startsWith('http') ? 'noreferrer' : undefined}
        >
          {preference === 'phone' ? (
            <PhoneCall size={15} />
          ) : (
            <ExternalLink size={15} />
          )}
          {contactLabel(lawyer, preference)}
        </a>
      )}
      <small>受任可否、費用、対応地域、利益相反を直接確認してください。</small>
    </article>
  );
}

export function LegalIntakeRunner({
  onRunningChange,
  onOutcome,
  executionDisabled = false,
}: {
  onRunningChange?: (running: boolean) => void;
  onOutcome?: (outcome: { ok: boolean; text: string }) => void;
  executionDisabled?: boolean;
}) {
  const [input, setInput] = useState<LegalIntakeInput>(emptyInput);
  const [understood, setUnderstood] = useState(false);
  const [remoteResearch, setRemoteResearch] = useState(false);
  const [assessment, setAssessment] = useState<LegalAssessment | null>(null);
  const [notice, setNotice] = useState('まず安全と期限を確認します。');
  const [copied, setCopied] = useState(false);
  const [aiResult, setAiResult] = useState<LegalAiResult | null>(null);
  const [aiError, setAiError] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);

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
    setStep(3);
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
      onOutcome?.({ ok: false, text: '緊急性が高い可能性があります。案内と連絡先をこのカードで確認してください。' });
      onRunningChange?.(false);
      return;
    }
    if (!remoteResearch) {
      setAiResult(buildLocalLegalResult(input, next));
      setNotice('端末内のローカルガイドと公的窓口を準備しました。通信は行っていません。');
      onOutcome?.({ ok: true, text: '端末内の法務ガイドと公的窓口を準備しました。内容はこのカードで確認してください。' });
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
      onOutcome?.({ ok: true, text: '公式情報の一次回答を取得しました。出典と引継ぎ内容をこのカードで確認してください。' });
      setNotice(
        next.lawyerRequired
          ? '公式情報の一次回答と弁護士への引継ぎを用意しました。'
          : '公式情報の一次回答と無料・公的な次の行動を用意しました。',
      );
    } catch {
      setAiResult(buildLocalLegalResult(input, next));
      setAiError('');
      setNotice(
        'オンライン検索は利用できないため、端末内のローカルガイドへ切り替えました。',
      );
      onOutcome?.({ ok: false, text: 'オンライン検索は利用できませんでした。端末内ガイドをこのカードで確認してください。' });
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
      <section className="legal-agent-chat" aria-label="法務受付との会話">
        <header>
          <span className="legal-agent-avatar" aria-hidden="true">
            <Scale size={19} />
          </span>
          <div>
            <strong>法務受付</strong>
            <span>公式情報・窓口案内担当</span>
          </div>
          <small>GUIDED</small>
        </header>
        <div className="legal-agent-boundaries">
          <span>
            <ShieldCheck size={15} /> 相談本文は保存しません
          </span>
          <span>
            <ShieldAlert size={15} /> 法的助言ではありません
          </span>
        </div>
        <Conversation className="legal-agent-thread">
          <ConversationContent className="legal-agent-content">
            <Message from="assistant">
              <MessageContent>
                <span className="legal-agent-message-role" aria-hidden="true">
                  <Bot size={15} />
                </span>
                <MessageResponse>
                  こんにちは。Skyの**法務受付**です。まず安全と期限を確認し、政府・裁判所の公式情報で一般案内を作ります。弁護士が必要な場合だけ、日本語対応の候補と引継ぎ要約を表示します。
                </MessageResponse>
              </MessageContent>
            </Message>
            {step >= 2 && (
              <Message from="assistant">
                <MessageContent>
                  <span className="legal-agent-message-role" aria-hidden="true">
                    <Bot size={15} />
                  </span>
                  <MessageResponse>
                    名前や番号は書かず、**いつ・何が起きたか**を教えてください。分からないことは「不明」で大丈夫です。
                  </MessageResponse>
                </MessageContent>
              </Message>
            )}
            {step === 3 && assessment && (
              <>
                <Message from="user">
                  <MessageContent>
                    <span className="legal-agent-message-role" aria-hidden="true">
                      <UserRound size={15} />
                    </span>
                    <p>{input.situationSummary}</p>
                  </MessageContent>
                </Message>
                <Message from="assistant">
                  <MessageContent>
                    <span className="legal-agent-message-role" aria-hidden="true">
                      <Bot size={15} />
                    </span>
                    <MessageResponse>{`**${urgencyLabels[assessment.urgency]} — ${assessment.headline}**\n\n${assessment.explanation}`}</MessageResponse>
                  </MessageContent>
                </Message>
                {assessment.urgency !== 'emergency' && (
                  <Message from="assistant">
                    <MessageContent>
                      <span className="legal-agent-message-role" aria-hidden="true">
                        <Bot size={15} />
                      </span>
                      {aiLoading ? (
                        <p className="legal-agent-thinking">
                          政府・裁判所の公式情報をオンライン確認しています…
                        </p>
                      ) : aiResult ? (
                        <MessageResponse>{aiResult.answer}</MessageResponse>
                      ) : (
                        <p className="legal-agent-thinking">
                          {aiError || '公式情報の案内を準備しています。'}
                        </p>
                      )}
                    </MessageContent>
                  </Message>
                )}
              </>
            )}
          </ConversationContent>
          <ConversationScrollButton aria-label="最新の会話へ移動" />
        </Conversation>
      </section>

      <ol className="legal-runner-progress" aria-label="相談の進み具合">
        {['安全確認', '相談内容', '回答・引継ぎ'].map((label, index) => {
          const number = (index + 1) as 1 | 2 | 3;
          return (
            <li
              key={label}
              className={number === step ? 'current' : number < step ? 'done' : ''}
              aria-current={number === step ? 'step' : undefined}
            >
              <span>{number < step ? <Check size={14} /> : number}</span>
              {label}
            </li>
          );
        })}
      </ol>

      <div className="legal-runner-privacy" hidden={step !== 1}>
        <ShieldAlert size={18} />
        <p>
          標準は端末内処理です。相談本文は通信せず、登録済みの公的窓口と引継ぎ要約を使って整理します。最新の公式情報をオンライン検索する場合だけ、下の任意チェックを有効にしてください。社会保障番号、口座・カード番号、パスワード、移民の受領番号、診療記録の全文は入力しないでください。
        </p>
      </div>

      {step === 1 && input.immediateDanger && (
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
        <div className="legal-runner-step" hidden={step !== 1}>
          <div className="legal-runner-step-heading">
            <span>QUICK CHECK</span>
            <h3>当てはまるものはありますか？</h3>
            <p>何もなければ、そのまま相談入力へ進めます。</p>
          </div>
          <fieldset disabled={executionDisabled}>
            <legend className="sr-only">安全確認</legend>
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
                  <strong>家庭内暴力・安全の懸念がある</strong>
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
                  <strong>公的な書類が届いた</strong>
                  書類にある期日を確認してください
                </span>
              </label>
            </div>
          </fieldset>
          <button
            className="black-button legal-runner-next"
            type="button"
            disabled={executionDisabled}
            onClick={() => setStep(2)}
          >
            相談を入力 <ArrowRight size={17} />
          </button>
        </div>

        <div className="legal-runner-step" hidden={step !== 2}>
          <div className="legal-agent-prompt">
            <label className="legal-runner-text legal-runner-main-question">
              相談内容
              <textarea
                required
                minLength={20}
                maxLength={2000}
                value={input.situationSummary}
                onChange={(event) =>
                  update('situationSummary', event.target.value)
                }
                placeholder="例：9月10日に勤務先から通知を受け取り、9月18日までに返答するよう書かれています。"
              />
              <small>{input.situationSummary.length} / 2,000</small>
            </label>
          </div>

          <details className="legal-runner-details" open>
            <summary>分野・地域・期限を設定</summary>
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
          </details>

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
            弁護士が必要な場合の連絡方法
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
              一般情報であること、端末内のローカルガイドであることを理解しました。
            </span>
          </label>
          <label className="legal-runner-consent">
            <input
              type="checkbox"
              checked={remoteResearch}
              onChange={(event) => setRemoteResearch(event.target.checked)}
            />
            <span>
              通信を許可して、公式情報のオンライン検索を追加する（任意・OpenAIへ送信）
            </span>
          </label>
          <div className="legal-runner-form-actions">
            <button
              className="legal-runner-back"
              type="button"
              onClick={() => setStep(1)}
            >
              <ArrowLeft size={16} /> 安全確認へ戻る
            </button>
            <button
              className="black-button legal-runner-submit"
              type="submit"
              disabled={
                executionDisabled ||
                !understood ||
                input.situationSummary.trim().length < 20
              }
            >
              法務受付へ送る <ArrowRight size={17} />
            </button>
          </div>
        </div>
      </form>

      <output
        className="legal-runner-status"
        aria-live="polite"
        hidden={step !== 3}
      >
        {notice}
      </output>

      {step === 3 && assessment && (
        <section className="legal-runner-result" aria-live="polite">
          <div className="legal-runner-result-heading">
            <div>
              <span>NEXT ACTION</span>
              <h3>次にすること</h3>
            </div>
            <button type="button" onClick={() => setStep(2)}>
              <ArrowLeft size={15} /> 相談内容を修正
            </button>
          </div>

          {assessment.urgency !== 'emergency' && aiResult && (
            <div className="legal-runner-ai-sources legal-runner-source-panel">
              <div>
                <strong>
                  {aiResult.mode === 'local-registry'
                    ? '端末内に登録済みの公式入口'
                    : 'オンライン検索で確認した公式情報'}
                </strong>
                <small>
                  {aiResult.mode === 'local-registry'
                    ? '通信なしで作成'
                    : `${new Date(aiResult.searchedAt).toLocaleString('ja-JP')} 確認`}
                </small>
              </div>
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
                  内容を確認し、ご本人が送信してください。Skyから自動送信はしません。
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
                {lawyers
                  .slice(0, assessment.primaryCounselId ? 1 : 2)
                  .map((lawyer) => (
                    <LawyerCard
                      key={lawyer.id}
                      lawyer={lawyer}
                      preference={input.contactPreference}
                      summary={handoffSummary}
                      primary={lawyer.id === assessment.primaryCounselId}
                    />
                  ))}
                {lawyers.length > (assessment.primaryCounselId ? 1 : 2) && (
                  <details className="legal-runner-more-lawyers">
                    <summary>
                      ほかの候補を
                      {lawyers.length - (assessment.primaryCounselId ? 1 : 2)}件見る
                    </summary>
                    <div>
                      {lawyers
                        .slice(assessment.primaryCounselId ? 1 : 2)
                        .map((lawyer) => (
                          <LawyerCard
                            key={lawyer.id}
                            lawyer={lawyer}
                            preference={input.contactPreference}
                            summary={handoffSummary}
                            primary={false}
                          />
                        ))}
                    </div>
                  </details>
                )}
              </div>
            </div>
          ) : null}

          <div className="legal-runner-guide">
            <h3>無料・公的な窓口</h3>
            <p>書式や一般情報は、次の公式・非営利サービスから確認できます。</p>
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
