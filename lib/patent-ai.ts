import type { PatentIntakeInput } from './patent-assistant';

export const PATENT_AI_MODEL = 'gpt-5.4-nano';

export const PATENT_AI_ALLOWED_DOMAINS = [
  'jpo.go.jp',
  'inpit.go.jp',
  'wipo.int',
  'epo.org',
  'espacenet.com',
] as const;

export type PatentAiCitation = { title: string; url: string };
export type PatentAiResult = {
  answer: string;
  citations: PatentAiCitation[];
  searchedAt: string;
};

type OpenAiResponse = {
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
      annotations?: Array<{ type?: string; title?: string; url?: string }>;
    }>;
  }>;
};

const disclosureStatuses = new Set([
  'not_disclosed',
  'private_only',
  'already_disclosed',
  'unknown',
]);

export function validatePatentAiInput(value: unknown): PatentIntakeInput {
  if (!value || typeof value !== 'object') throw new Error('INVALID_INPUT');
  const input = value as Partial<PatentIntakeInput>;
  const required = [
    input.inventionTitle,
    input.problem,
    input.mechanism,
    input.architecture,
    input.technicalEffect,
    input.differences,
  ];
  if (
    required.some(
      (field) =>
        typeof field !== 'string' ||
        field.trim().length < 10 ||
        field.length > 2_000,
    ) ||
    typeof input.knownPriorArt !== 'string' ||
    input.knownPriorArt.length > 2_000 ||
    typeof input.inventor !== 'string' ||
    input.inventor.length > 200 ||
    typeof input.applicant !== 'string' ||
    input.applicant.length > 200 ||
    !disclosureStatuses.has(input.disclosureStatus ?? '')
  ) {
    throw new Error('INVALID_INPUT');
  }
  return {
    inventionTitle: input.inventionTitle!.trim(),
    problem: input.problem!.trim(),
    mechanism: input.mechanism!.trim(),
    architecture: input.architecture!.trim(),
    technicalEffect: input.technicalEffect!.trim(),
    differences: input.differences!.trim(),
    knownPriorArt: input.knownPriorArt.trim(),
    inventor: input.inventor.trim(),
    applicant: input.applicant.trim(),
    disclosureStatus:
      input.disclosureStatus as PatentIntakeInput['disclosureStatus'],
    disclosureDate:
      typeof input.disclosureDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(input.disclosureDate)
        ? input.disclosureDate
        : undefined,
  };
}

export function buildPatentAiRequest(
  input: PatentIntakeInput,
  currentDate: string,
  model = PATENT_AI_MODEL,
) {
  return {
    model,
    store: false,
    reasoning: { effort: 'medium' },
    max_output_tokens: 2_200,
    max_tool_calls: 6,
    tools: [
      {
        type: 'web_search',
        search_context_size: 'high',
        filters: { allowed_domains: [...PATENT_AI_ALLOWED_DOMAINS] },
      },
    ],
    tool_choice: { type: 'web_search' },
    include: ['web_search_call.action.sources'],
    instructions: [
      'あなたは日本のソフトウェア・システム発明の先行技術調査を補助する担当です。弁理士ではなく、特許性、侵害回避、登録、期限を保証しません。',
      '必ずweb_searchを使い、JPO、INPIT/J-PlatPat、WIPO、EPO/Espacenetの一次情報だけを根拠にしてください。ブログ、まとめ、販売ページは根拠にしません。',
      '公開番号、名称、URLを推測・創作しないでください。原文を確認できた候補だけを挙げ、確認できない場合は「確認できず」と書いてください。',
      '日本語で「検索観点」「近い可能性がある文献・分類」「新規性・進歩性で確認すべき差分」「追加検索」「限界」の順に回答してください。各候補について似ている構成と異なる可能性を分けてください。',
      'ユーザー入力に秘密情報が含まれる可能性があるため、回答に不要な固有名詞や個人名を繰り返さないでください。',
      `基準日: ${currentDate}`,
    ].join('\n'),
    input: [
      `発明名称: ${input.inventionTitle}`,
      `技術課題: ${input.problem}`,
      `仕組み: ${input.mechanism}`,
      `構成・データフロー: ${input.architecture}`,
      `技術的効果: ${input.technicalEffect}`,
      `既存技術との差分: ${input.differences}`,
      `既知文献・製品: ${input.knownPriorArt || '未入力'}`,
    ].join('\n'),
  };
}

function isAllowedCitation(url: string) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return PATENT_AI_ALLOWED_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

export function parsePatentAiResponse(
  value: unknown,
  searchedAt = new Date().toISOString(),
): PatentAiResult {
  const response = value as OpenAiResponse;
  const answer: string[] = [];
  const citations = new Map<string, PatentAiCitation>();
  for (const item of response.output ?? []) {
    if (item.type !== 'message') continue;
    for (const content of item.content ?? []) {
      if (content.type !== 'output_text' || !content.text) continue;
      answer.push(content.text);
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
  const text = answer.join('\n\n').trim();
  if (!text || citations.size === 0) throw new Error('UNCITED_RESPONSE');
  return { answer: text, citations: [...citations.values()], searchedAt };
}
