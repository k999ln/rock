import type {
  LegalIntakeInput,
  LegalAssessment,
  LegalIssueId,
  LegalLocation,
  LegalMatterStage,
} from './legal-intake';
import { getSelfHelpResources, legalIssueCategories } from './legal-intake.ts';

export const LEGAL_AI_MODEL = 'gpt-5.4-nano';

export const LEGAL_AI_ALLOWED_DOMAINS = [
  'nycourts.gov',
  'nysenate.gov',
  'ny.gov',
  'nyc.gov',
  'njcourts.gov',
  'njleg.state.nj.us',
  'nj.gov',
  'pacourts.us',
  'legis.state.pa.us',
  'pa.gov',
  'uscourts.gov',
  'congress.gov',
  'govinfo.gov',
  'justice.gov',
  'uscis.gov',
  'dol.gov',
  'eeoc.gov',
  'hud.gov',
  'irs.gov',
  'consumerfinance.gov',
  'ftc.gov',
] as const;

export type LegalAiCitation = { title: string; url: string };

export type LegalAiResult = {
  answer: string;
  citations: LegalAiCitation[];
  searchedAt: string;
  mode: 'local-registry' | 'remote-search';
};

const issueIds = new Set<LegalIssueId>([
  'criminal',
  'immigration',
  'housing',
  'employment',
  'injury',
  'family',
  'estate',
  'business',
  'ip',
  'litigation',
  'tax_finance',
]);
const locationIds = new Set<LegalLocation>([
  'nyc',
  'ny_state',
  'new_jersey',
  'pennsylvania',
  'other',
]);
const stageIds = new Set<LegalMatterStage>([
  'general_information',
  'active_problem',
  'document_review',
  'court_or_agency',
]);

type OpenAiAnnotation = {
  type?: string;
  title?: string;
  url?: string;
};

type OpenAiContent = {
  type?: string;
  text?: string;
  annotations?: OpenAiAnnotation[];
};

type OpenAiOutputItem = {
  type?: string;
  content?: OpenAiContent[];
};

type OpenAiResponse = {
  output?: OpenAiOutputItem[];
  error?: { message?: string };
};

export function validateLegalAiInput(value: unknown): LegalIntakeInput {
  if (!value || typeof value !== 'object') throw new Error('INVALID_INPUT');
  const input = value as Partial<LegalIntakeInput>;
  if (
    !issueIds.has(input.issueType as LegalIssueId) ||
    !locationIds.has(input.location as LegalLocation) ||
    !stageIds.has(input.matterStage as LegalMatterStage) ||
    typeof input.situationSummary !== 'string' ||
    input.situationSummary.trim().length < 20 ||
    input.situationSummary.length > 2_000 ||
    typeof input.desiredOutcome !== 'string' ||
    input.desiredOutcome.length > 500
  ) {
    throw new Error('INVALID_INPUT');
  }
  const issueType = input.issueType as LegalIssueId;
  const location = input.location as LegalLocation;
  const matterStage = input.matterStage as LegalMatterStage;
  return {
    issueType,
    location,
    matterStage,
    situationSummary: input.situationSummary.trim(),
    desiredOutcome: input.desiredOutcome.trim(),
    deadlineDate:
      typeof input.deadlineDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(input.deadlineDate)
        ? input.deadlineDate
        : undefined,
    immediateDanger: input.immediateDanger === true,
    detainedOrArrested: input.detainedOrArrested === true,
    domesticViolence: input.domesticViolence === true,
    receivedOfficialDocument: input.receivedOfficialDocument === true,
    contactPreference: 'email',
  };
}

export function buildLegalAiRequest(
  input: LegalIntakeInput,
  currentDate: string,
  model = LEGAL_AI_MODEL,
) {
  const flags = [
    input.detainedOrArrested ? '逮捕・拘束・出頭要請あり' : '',
    input.receivedOfficialDocument ? '裁判所・警察・行政機関の書類あり' : '',
    input.domesticViolence ? 'DV・対人安全の懸念あり' : '',
  ].filter(Boolean);
  return {
    model,
    store: false,
    reasoning: { effort: 'low' },
    max_output_tokens: 1_200,
    max_tool_calls: 4,
    tools: [
      {
        type: 'web_search',
        search_context_size: 'medium',
        filters: { allowed_domains: [...LEGAL_AI_ALLOWED_DOMAINS] },
      },
    ],
    tool_choice: { type: 'web_search' },
    include: ['web_search_call.action.sources'],
    instructions: [
      'あなたは米国の日本語法律情報ナビゲーターです。弁護士ではなく、個別事件の法的助言・勝敗予測・期限計算・代理はしません。',
      '必ずweb_searchを使い、許可された政府・裁判所の一次情報だけを根拠にしてください。根拠を確認できない断定はしません。',
      '回答は日本語で「確認できる一般情報」「無料または公的な次の行動」「弁護士へ切り替える条件」「未確認事項」の順に簡潔に書いてください。',
      'ユーザーが入力した事実と、公式資料から確認した一般情報を明確に区別してください。刑事事件で黙秘・取調べ・捜索・逮捕など個別戦略に触れる場合は、直ちに刑事弁護士へ確認するよう案内してください。',
      '差し迫った危険は911、NYCのDVはHOPE Hotline 1-800-621-4673を優先します。',
      `基準日: ${currentDate}`,
    ].join('\n'),
    input: [
      `相談分野: ${input.issueType}`,
      `地域: ${input.location}`,
      `段階: ${input.matterStage}`,
      `書類記載の期日: ${input.deadlineDate || '未入力'}`,
      `安全・手続フラグ: ${flags.join(' / ') || 'なし'}`,
      `本人の状況説明: ${input.situationSummary}`,
      `希望: ${input.desiredOutcome || '未入力'}`,
    ].join('\n'),
  };
}

function isAllowedCitation(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return LEGAL_AI_ALLOWED_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

export function parseLegalAiResponse(
  value: unknown,
  searchedAt = new Date().toISOString(),
): LegalAiResult {
  const response = value as OpenAiResponse;
  const answerParts: string[] = [];
  const citations = new Map<string, LegalAiCitation>();
  for (const item of response.output ?? []) {
    if (item.type !== 'message') continue;
    for (const content of item.content ?? []) {
      if (content.type !== 'output_text' || !content.text) continue;
      answerParts.push(content.text);
      for (const annotation of content.annotations ?? []) {
        if (
          annotation.type === 'url_citation' &&
          annotation.url &&
          isAllowedCitation(annotation.url)
        ) {
          citations.set(annotation.url, {
            title: annotation.title?.trim() || new URL(annotation.url).hostname,
            url: annotation.url,
          });
        }
      }
    }
  }
  const answer = answerParts.join('\n\n').trim();
  if (!answer || citations.size === 0) throw new Error('UNCITED_RESPONSE');
  return {
    answer,
    citations: [...citations.values()],
    searchedAt,
    mode: 'remote-search',
  };
}

/**
 * Offline-first guidance. This intentionally does not infer law or search the
 * network; it combines the user's validated intake with the reviewed local
 * directory and official-entry registry.
 */
export function buildLocalLegalResult(
  input: LegalIntakeInput,
  assessment: LegalAssessment,
): LegalAiResult {
  const category = legalIssueCategories.find((item) => item.id === input.issueType);
  const resources = getSelfHelpResources(input.issueType, input.location);
  const nextActions = assessment.nextActions.slice(0, 3);
  const answer = [
    'これは端末内のローカルガイドです。通信せず、法的助言・期限計算・勝敗予測は行いません。',
    '',
    `相談分野: ${category?.label ?? input.issueType}`,
    `地域: ${input.location}`,
    `緊急度: ${assessment.headline}`,
    '',
    '次にすること:',
    ...nextActions.map((action) => `- ${action}`),
    '',
    resources.length > 0
      ? '端末内に登録済みの公式入口を下に表示します。最新内容と期限は本人または弁護士が原文で確認してください。'
      : '公式入口の登録がない地域です。地域の裁判所・行政機関・弁護士へ直接確認してください。',
  ].join('\n');
  return {
    answer,
    citations: resources.map((resource) => ({
      title: resource.label,
      url: resource.url,
    })),
    searchedAt: new Date().toISOString(),
    mode: 'local-registry',
  };
}
