import { assertSafeOutbound } from '../toolkits/spider-guard/detector.mjs';
import type { PatentIntakeInput } from './patent-assistant';
import {
  parseResearchAiResponse,
  type ResearchAiCitation,
} from './research-ai.ts';
import { PATENT_AI_INSTRUCTIONS } from './generated/private-content.ts';

export const PATENT_AI_MODEL = 'gpt-5.4-nano';

const PATENT_AI_ENGLISH_INSTRUCTIONS = [
  'You are an English-language patent prior-art research assistant.',
  'Use only the official or primary patent sources returned by the web search tool and cite every material factual claim.',
  'Do not provide legal advice, a filing decision, or a claim of novelty. Clearly label uncertainty and ask a patent professional to review the result.',
  'Return the answer in English with these headings: Search perspective, Candidate prior art, Technical comparison, Uncertainties, and Sources.',
  'Keep the analysis focused on the supplied technical features. Do not invent documents, quotations, dates, or source contents.',
] as const;

export const PATENT_AI_ALLOWED_DOMAINS = [
  'jpo.go.jp',
  'inpit.go.jp',
  'wipo.int',
  'epo.org',
  'espacenet.com',
  'uspto.gov',
] as const;

export type PatentAiCitation = ResearchAiCitation;
export type PatentAiResult = {
  answer: string;
  citations: PatentAiCitation[];
  searchedAt: string;
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
  language: 'ja' | 'en' = 'ja',
) {
  assertSafeOutbound({
    inventionTitle: input.inventionTitle,
    problem: input.problem,
    mechanism: input.mechanism,
    architecture: input.architecture,
    technicalEffect: input.technicalEffect,
    differences: input.differences,
    knownPriorArt: input.knownPriorArt,
  });
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
      ...(language === 'en' ? PATENT_AI_ENGLISH_INSTRUCTIONS : PATENT_AI_INSTRUCTIONS),
      language === 'en' ? `Reference date: ${currentDate}` : `基準日: ${currentDate}`,
    ].join('\n'),
    input: language === 'en'
      ? [
        `Invention title: ${input.inventionTitle}`,
        `Technical problem: ${input.problem}`,
        `Mechanism: ${input.mechanism}`,
        `Architecture and data flow: ${input.architecture}`,
        `Technical effect: ${input.technicalEffect}`,
        `Differences from existing technology: ${input.differences}`,
        `Known literature or products: ${input.knownPriorArt || 'Not provided'}`,
      ].join('\n')
      : [
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

export function parsePatentAiResponse(
  value: unknown,
  searchedAt = new Date().toISOString(),
): PatentAiResult {
  return {
    ...parseResearchAiResponse(value, PATENT_AI_ALLOWED_DOMAINS),
    searchedAt,
  };
}
