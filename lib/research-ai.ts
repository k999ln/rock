import { RemoteAiGuardError } from './remote-ai-guard.ts';

export type ResearchAiCitation = { title: string; url: string };
export const researchAiNoStoreHeaders = { 'Cache-Control': 'no-store' };

export class ResearchAiUpstreamError extends Error {
  readonly status: number;

  constructor(status: number) {
    super('RESEARCH_AI_UPSTREAM_FAILED');
    this.name = 'ResearchAiUpstreamError';
    this.status = status;
  }
}

/** Called only after the route's authentication, input and remote-use gates. */
export async function requestResearchAi(
  body: unknown,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const upstream = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  // Preserve the existing route contract: malformed JSON/transport failures
  // take the generic failure path; a parsed non-2xx response takes the 502 path.
  const payload: unknown = await upstream.json();
  if (!upstream.ok) throw new ResearchAiUpstreamError(upstream.status);
  return payload;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function officialCitationUrl(
  value: unknown,
  allowedDomains: readonly string[],
): URL | undefined {
  if (
    typeof value !== 'string' ||
    !/^https:\/\//i.test(value) ||
    value.includes('\\')
  )
    return undefined;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 0x20 || code === 0x7f) return undefined;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port)
      return undefined;
    const hostname = url.hostname.toLowerCase();
    return allowedDomains.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    )
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}

/** A shared parser; each Tool supplies its own official-source allowlist. */
export function parseResearchAiResponse(
  value: unknown,
  allowedDomains: readonly string[],
): { answer: string; citations: ResearchAiCitation[] } {
  const output = record(value)?.output;
  const answerParts: string[] = [];
  const citations = new Map<string, ResearchAiCitation>();
  for (const itemValue of Array.isArray(output) ? output : []) {
    const item = record(itemValue);
    if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const contentValue of item.content) {
      const content = record(contentValue);
      if (
        content?.type !== 'output_text' ||
        typeof content.text !== 'string' ||
        !content.text
      )
        continue;
      answerParts.push(content.text);
      for (const annotationValue of Array.isArray(content.annotations)
        ? content.annotations
        : []) {
        const annotation = record(annotationValue);
        if (annotation?.type !== 'url_citation') continue;
        const url = officialCitationUrl(annotation.url, allowedDomains);
        if (!url) continue;
        const originalUrl = annotation.url as string;
        citations.set(originalUrl, {
          title:
            (typeof annotation.title === 'string' && annotation.title.trim()) ||
            url.hostname,
          url: originalUrl,
        });
      }
    }
  }
  const answer = answerParts.join('\n\n').trim();
  if (!answer || citations.size === 0) throw new Error('UNCITED_RESPONSE');
  return { answer, citations: [...citations.values()] };
}

export function researchAiErrorResponse(
  error: unknown,
  messages: { logLabel: string; upstream: string },
  logError: (...values: unknown[]) => void = console.error,
): Response {
  if (error instanceof RemoteAiGuardError)
    return Response.json(
      {
        error:
          error.code === 'RATE_LIMITED'
            ? '利用上限に達しました。1分後に再試行してください。'
            : error.code === 'ORIGIN'
              ? 'このサイトから操作してください。'
              : 'サインインしてください。',
        code: error.code,
      },
      { status: error.status, headers: researchAiNoStoreHeaders },
    );
  if (error instanceof ResearchAiUpstreamError) {
    logError(`${messages.logLabel} upstream failed`, error.status);
    return Response.json(
      { error: messages.upstream },
      { status: 502, headers: researchAiNoStoreHeaders },
    );
  }
  logError(
    `${messages.logLabel} failed`,
    error instanceof Error ? error.message : 'unknown',
  );
  return Response.json(
    { error: '入力を確認して、もう一度お試しください。' },
    { status: 400, headers: researchAiNoStoreHeaders },
  );
}
