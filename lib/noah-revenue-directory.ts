import type { DirectoryEntry } from './noah-agent-directory.ts';
import { noahCardIdentity } from './noah-agent-directory.ts';
const landing = 'https://avoado.si/noah/business-si';
const endpoint = 'https://noah-business-si.mr-kirin999.workers.dev/consult/mcp';
const catalog =
  'https://noah-revenue-agents.mr-kirin999.workers.dev/api/revenue';
const reviewed = [
  {
    id: 'noah-business-training',
    type: 'business-training' as const,
    landing,
    endpoint,
    name: '法人のsi導入準備',
    summary:
      '業務の整理票と研修で聞くことを作ります。必要に合う場合に、広告を含む相談先をご案内します。',
  },
  {
    id: 'noah-wordpress-maintenance',
    type: 'wordpress-maintenance' as const,
    landing:
      'https://noah-revenue-agents.mr-kirin999.workers.dev/agent/wordpress-maintenance',
    endpoint:
      'https://noah-revenue-agents.mr-kirin999.workers.dev/consult/site/wordpress-maintenance/mcp',
    name: 'WordPressの診断と保守相談',
    summary:
      '公開ページを実診断して保守の確認事項を整理。希望者へ広告を含む相談先をご案内します。',
  },
  {
    id: 'noah-ec-production',
    type: 'ec-production' as const,
    landing:
      'https://noah-revenue-agents.mr-kirin999.workers.dev/agent/ec-production',
    endpoint:
      'https://noah-revenue-agents.mr-kirin999.workers.dev/consult/site/ec-production/mcp',
    name: 'ECサイトの診断と制作準備',
    summary:
      '公開サイトの読み取りやすさを実診断して制作・改修の依頼事項を整理。希望者へ広告を含む見積もり先をご案内します。',
  },
];
/** A reviewed first-party lane, independent of the external registry and its claims. */
export async function noahRevenueDirectory(
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<DirectoryEntry[]> {
  try {
    const response = await fetcher(catalog, {
      redirect: 'manual',
      signal: AbortSignal.timeout(2500),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      return [];
    }
    const reader = response.body.getReader(),
      decoder = new TextDecoder();
    let text = '',
      size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8192) return [];
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    const value: unknown = JSON.parse(text);
    if (
      !value ||
      typeof value !== 'object' ||
      !('items' in value) ||
      !Array.isArray(value.items)
    )
      return [];
    const entries: DirectoryEntry[] = [];
    for (const spec of reviewed) {
      const item = value.items.find(
        (v: unknown) =>
          v && typeof v === 'object' && 'id' in v && v.id === spec.id,
      );
      if (
        !item ||
        item.origin !== 'first_party' ||
        item.url !== spec.landing ||
        item.mcp !== spec.endpoint ||
        typeof item.checkedAt !== 'string'
      )
        continue;
      const observedAt = Date.parse(item.checkedAt);
      if (
        !Number.isFinite(observedAt) ||
        observedAt > now ||
        now - observedAt > 20 * 60000
      )
        continue;
      const id = await noahCardIdentity(spec.landing, spec.id);
      entries.push({
        firstParty: spec.type,
        families: [],
        observedAt,
        card: {
          id,
          feedbackId: id,
          name: spec.name,
          summary: spec.summary,
          provider: 'Noah',
          host: new URL(spec.landing).hostname,
          href: spec.landing,
          external: true,
          users: 0,
          oneTap: false,
          savedIn: [],
          topic: 'work',
          shape: 0,
        },
      });
    }
    return entries;
  } catch {
    return [];
  }
}
/** Only a server-created reviewed entry can resolve this fixed free preparation tool. */
export async function noahRevenueTarget(
  entry: DirectoryEntry,
  now = Date.now(),
) {
  const spec = reviewed.find((s) => s.type === entry.firstParty);
  if (
    !spec ||
    entry.card.href !== spec.landing ||
    entry.card.feedbackId !== (await noahCardIdentity(spec.landing, spec.id)) ||
    !Number.isFinite(entry.observedAt) ||
    entry.observedAt > now ||
    now - entry.observedAt > 20 * 60000
  )
    return null;
  return {
    kind: 'mcp' as const,
    repository: spec.landing,
    url: spec.endpoint,
    provenance: catalog,
  };
}
