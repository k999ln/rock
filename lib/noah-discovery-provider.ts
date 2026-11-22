import { noahSha256 } from './noah-agent-upload.ts';
import { canonicalOperationValue } from './noah-operation-contract.mjs';
export type DiscoveryProvider = 'github' | 'huggingface';
export type DiscoveryMetadata = {
  provider: DiscoveryProvider;
  externalId: string;
  repository: string;
  url: string;
  name: string;
  summary: string;
  authorId: string;
  author: string;
  tags: string[];
  license: string | null;
  commit: string | null;
  language: string | null;
  sdk: string | null;
  metrics?: { stars?: number; likes?: number };
};
export type DiscoveryKnown = {
  id: string;
  external_id: string;
  repository: string;
};
export class DiscoveryFailure extends Error {
  code:
    | 'rate_limited'
    | 'unavailable'
    | 'invalid_response'
    | 'capacity'
    | 'lease_lost';
  retryAt?: number;
  constructor(code: DiscoveryFailure['code'], retryAt?: number) {
    super(code);
    this.code = code;
    this.retryAt = retryAt;
  }
}
export const discoverySources = [
  {
    id: 'github' as const,
    label: 'GitHub · ai-agentタグ',
    url: 'https://api.github.com/search/repositories?q=topic%3Aai-agent%20fork%3Afalse%20archived%3Afalse&sort=updated&order=desc&per_page=10',
  },
  {
    id: 'huggingface' as const,
    label: 'Hugging Face · AgentのSpace',
    url: 'https://huggingface.co/api/spaces?search=agent&sort=lastModified&direction=-1&limit=10&full=true',
  },
];
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown, limit: number) =>
  typeof value === 'string'
    ? Array.from(value)
        .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
        .join('')
        .trim()
        .slice(0, limit)
    : '';
const repository = (value: unknown) =>
  typeof value === 'string' &&
  /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,95}\/[a-zA-Z0-9][a-zA-Z0-9_.-]{0,95}$/.test(
    value,
  )
    ? value
    : null;
const sha = (value: unknown) =>
  typeof value === 'string' && /^[a-f0-9]{40}$/.test(value) ? value : null;
const tags = (values: unknown) =>
  Array.isArray(values)
    ? [
        ...new Set(
          values
            .map((x) => text(x, 80).normalize('NFKC').toLowerCase())
            .filter(Boolean),
        ),
      ]
        .sort()
        .slice(0, 20)
    : [];
export const discoveryDigest = (value: unknown) =>
  noahSha256(new TextEncoder().encode(canonicalOperationValue(value)));
export async function discoveryIdentity(
  provider: DiscoveryProvider,
  externalId: string,
) {
  return (
    'discovery-' + (await discoveryDigest([provider, externalId])).slice(0, 24)
  );
}
export function normalizeDiscovery(
  provider: DiscoveryProvider,
  value: unknown,
  commit: unknown = null,
): DiscoveryMetadata | null {
  const v = object(value),
    repo = repository(provider === 'github' ? v.full_name : v.id);
  if (
    !repo ||
    v.private !== false ||
    v.gated ||
    v.disabled ||
    v.archived ||
    (provider === 'github' && v.fork)
  )
    return null;
  const owner = repo.split('/')[0];
  let externalId: string;
  if (provider === 'github') {
    if (!Number.isSafeInteger(v.id) || Number(v.id) <= 0) return null;
    externalId = String(v.id);
  } else {
    if (typeof v._id !== 'string' || !/^[a-f0-9]{24}$/.test(v._id)) return null;
    externalId = v._id;
  }
  const card = object(v.cardData),
    license = text(
      provider === 'github' ? object(v.license).spdx_id : card.license,
      100,
    );
  return {
    provider,
    externalId,
    repository: repo,
    url: `https://${provider === 'github' ? 'github.com/' : 'huggingface.co/spaces/'}${repo}`,
    name:
      text(provider === 'github' ? v.name : card.title, 160) ||
      repo.split('/')[1],
    summary: text(
      provider === 'github' ? v.description : card.short_description,
      1000,
    ),
    authorId: `${provider}:${owner.toLowerCase()}`,
    author: owner,
    tags: tags(provider === 'github' ? v.topics : v.tags),
    license:
      !license || ['NOASSERTION', 'other'].includes(license) ? null : license,
    commit: sha(provider === 'github' ? commit : v.sha),
    language: text(v.language, 80) || null,
    sdk: provider === 'huggingface' ? text(v.sdk, 80) || null : null,
    ...(provider === 'github' && Number.isSafeInteger(v.stargazers_count) && Number(v.stargazers_count) >= 0 ? { metrics: { stars: Number(v.stargazers_count) } } : {}),
    ...(provider === 'huggingface' && Number.isSafeInteger(v.likes) && Number(v.likes) >= 0 ? { metrics: { likes: Number(v.likes) } } : {}),
  };
}
async function boundedJson(response: Response) {
  if (Number(response.headers.get('content-length')) > 1048576) {
    await response.body?.cancel();
    throw new DiscoveryFailure('invalid_response');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new DiscoveryFailure('invalid_response');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > 1048576) {
      await reader.cancel();
      throw new DiscoveryFailure('invalid_response');
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    throw new DiscoveryFailure('invalid_response');
  }
}
export async function collectDiscoverySource(input: {
  provider: DiscoveryProvider;
  etag: string | null;
  known: DiscoveryKnown[];
  fetcher?: typeof fetch;
  now?: () => number;
  onCandidate: (value: DiscoveryMetadata) => Promise<void>;
  onWithdrawn: (id: string) => Promise<void>;
}) {
  const source = discoverySources.find((s) => s.id === input.provider);
  if (!source) throw new DiscoveryFailure('invalid_response');
  const now = input.now ?? Date.now,
    signal = AbortSignal.timeout(20000),
    fetcher = input.fetcher ?? fetch;
  let calls = 0,
    observed = 0,
    withdrawn = 0;
  async function request(url: string, etag?: string | null) {
    if (++calls > 32) throw new DiscoveryFailure('invalid_response');
    let response: Response;
    try {
      response = await fetcher(url, {
        redirect: 'manual',
        signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Noah-Public-Discovery/1',
          ...(input.provider === 'github'
            ? { 'X-GitHub-Api-Version': '2026-03-10' }
            : {}),
          ...(etag ? { 'If-None-Match': etag } : {}),
        },
      });
    } catch {
      throw new DiscoveryFailure('unavailable');
    }
    if ([403, 429].includes(response.status)) {
      const retry = response.headers.get('retry-after'),
        seconds =
          retry && /^\d+$/.test(retry)
            ? Number(retry) * 1000
            : retry
              ? Date.parse(retry) - now()
              : 0,
        reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
      const retryAt = Math.min(
        now() + 86400000,
        Math.max(
          now() + 60000,
          now() + (Number.isFinite(seconds) ? seconds : 0),
          Number.isFinite(reset) ? reset : 0,
        ),
      );
      await response.body?.cancel();
      throw new DiscoveryFailure('rate_limited', retryAt);
    }
    if ([304, 404, 410].includes(response.status)) {
      await response.body?.cancel();
      return { status: response.status, data: null, etag: null };
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new DiscoveryFailure('unavailable');
    }
    const tag = response.headers.get('etag');
    return {
      status: response.status,
      data: await boundedJson(response),
      etag: tag && tag.length <= 200 && !/[\r\n]/.test(tag) ? tag : null,
    };
  }
  const listing = await request(source.url, input.etag);
  if ([404, 410].includes(listing.status))
    throw new DiscoveryFailure('unavailable');
  const values =
    listing.status === 304
      ? []
      : input.provider === 'github'
        ? object(listing.data).items
        : listing.data;
  if (
    !Array.isArray(values) ||
    values.length > 10 ||
    (input.provider === 'github' &&
      listing.status !== 304 &&
      object(listing.data).incomplete_results === true)
  )
    throw new DiscoveryFailure('invalid_response');
  const entries = new Map<
    string,
    { repo: string; value?: Record<string, unknown>; known?: DiscoveryKnown }
  >();
  for (const raw of values) {
    const v = object(raw),
      repo = repository(input.provider === 'github' ? v.full_name : v.id);
    if (!repo) continue;
    const id = input.provider === 'github' ? String(v.id) : String(v._id);
    if (entries.has(id)) continue;
    entries.set(id, { repo, value: v });
  }
  for (const old of input.known.slice(0, 3)) {
    if (!repository(old.repository)) continue;
    const exists = entries.get(old.external_id);
    if (exists) exists.known = old;
    else entries.set(old.external_id, { repo: old.repository, known: old });
  }
  for (const [expectedId, entry] of entries) {
    let value = entry.value;
    // Search results may lag visibility changes. Confirm the individual resource
    // before treating it as a currently public candidate.
    const url =
      input.provider === 'github'
        ? `https://api.github.com/repos/${entry.repo}`
        : `https://huggingface.co/api/spaces/${entry.repo}`;
    const detail = await request(url);
    if ([404, 410].includes(detail.status)) {
      await input.onWithdrawn(
        await discoveryIdentity(input.provider, expectedId),
      );
      withdrawn++;
      continue;
    }
    value = object(detail.data);
    const actualId =
      input.provider === 'github' ? String(value.id) : String(value._id);
    if (actualId !== expectedId) {
      await input.onWithdrawn(
        await discoveryIdentity(input.provider, expectedId),
      );
      withdrawn++;
      continue;
    }
    let commit: unknown = null;
    if (
      input.provider === 'github' &&
      value.private === false &&
      !value.archived &&
      !value.disabled &&
      !value.fork
    ) {
      const branch = value.default_branch;
      if (
        typeof branch === 'string' &&
        branch.length <= 100 &&
        /^[a-zA-Z0-9_./-]+$/.test(branch) &&
        !branch.includes('..')
      ) {
        const ref = await request(
          `https://api.github.com/repos/${entry.repo}/git/ref/heads/${branch.split('/').map(encodeURIComponent).join('/')}`,
        );
        commit = object(object(ref.data).object).sha;
      }
    }
    const metadata = normalizeDiscovery(input.provider, value, commit);
    if (!metadata) {
      await input.onWithdrawn(
        await discoveryIdentity(input.provider, expectedId),
      );
      withdrawn++;
      continue;
    }
    await input.onCandidate(metadata);
    observed++;
  }
  return {
    etag: listing.status === 304 ? input.etag : listing.etag,
    observed,
    withdrawn,
    calls,
  };
}
