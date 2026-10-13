import { formatCitations } from './mr-tools.ts';
import { applyWorkCommand, createWorkJob, WorkError, type WorkJob } from './workflow.ts';

export const SKY_CITATION_AGENT_ID = 'sky-citation-agent' as const;
export const SKY_CITATION_MAX_INPUT = 20_000;

export type CitationAgentInput = { markdown: string; language: 'ja' | 'en' };

export function parseCitationAgentInput(value: unknown): CitationAgentInput {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new WorkError('出典整理Agentの入力を確認してください。');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !['markdown', 'language'].includes(key)) ||
      typeof input.markdown !== 'string' || !input.markdown.trim() ||
      input.markdown.length > SKY_CITATION_MAX_INPUT ||
      (input.language !== 'ja' && input.language !== 'en'))
    throw new WorkError(`本文は${SKY_CITATION_MAX_INPUT.toLocaleString()}文字以内で入力してください。`);
  return { markdown: input.markdown, language: input.language };
}

export function runCitationAgent(input: CitationAgentInput) {
  const text = formatCitations(input.markdown, input.language);
  if (text.length > 40_000) throw new WorkError('成果が保存上限を超えました。入力を分けてください。', 413);
  const sources = new Set<string>();
  for (const match of text.matchAll(/\]\((https?:\/\/[^\s)]+)\)/g)) sources.add(match[1]);
  const warnings = [
    ...(sources.size === 0 ? [input.language === 'en' ? 'No source links were found.' : '出典リンクが見つかりませんでした。'] : []),
    input.language === 'en'
      ? 'Links and claims have not been independently verified.'
      : 'リンク先と本文の主張は独立検証していません。',
  ];
  return { text, sourceCount: sources.size, warnings };
}

export async function citationInputSha256(input: CitationAgentInput) {
  const bytes = new TextEncoder().encode(JSON.stringify(input));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** A single bounded first-party execution. The workflow reducer certifies the recorded step. */
export function completedCitationAgentJob(
  id: string,
  input: CitationAgentInput,
  inputSha256: string,
  now = new Date().toISOString(),
): WorkJob {
  const result = runCitationAgent(input);
  const title = input.language === 'en' ? 'Organize citations' : '出典を整理';
  const created = createWorkJob({ id, title, templateId: SKY_CITATION_AGENT_ID }, now);
  const recorded = applyWorkCommand(created, {
    id: crypto.randomUUID(), action: 'record', stepId: 'organize-sources',
    tool: 'mr-citations', transport: 'browser', outcome: 'passed',
    sample: false, durationMs: 0,
  }, created.revision, now);
  const completed = applyWorkCommand(recorded, {
    id: crypto.randomUUID(), action: 'complete',
    note: input.language === 'en' ? 'Reviewed source organization output.' : '出典整理の成果を確認可能にしました。',
  }, recorded.revision, now);
  return {
    ...completed,
    standaloneAgent: {
      schema: 'sky.citations.result/1', agentId: SKY_CITATION_AGENT_ID,
      inputSha256, language: input.language, ...result,
      execution: 'first-party-rules',
    },
  };
}
