import type { DirectoryEntry } from './noah-agent-directory.ts';
import { noahCardIdentity } from './noah-agent-directory.ts';
const landing = 'https://avoado.si/noah/business-si';
const endpoint = 'https://noah-business-si.mr-kirin999.workers.dev/consult/mcp';
const catalog =
  'https://noah-revenue-agents.mr-kirin999.workers.dev/api/revenue';
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
    const item = value.items.find(
      (v: unknown) =>
        v &&
        typeof v === 'object' &&
        'id' in v &&
        v.id === 'noah-business-training',
    );
    if (
      !item ||
      item.origin !== 'first_party' ||
      item.url !== landing ||
      item.mcp !== endpoint ||
      typeof item.checkedAt !== 'string'
    )
      return [];
    const observedAt = Date.parse(item.checkedAt);
    if (
      !Number.isFinite(observedAt) ||
      observedAt > now ||
      now - observedAt > 20 * 60000
    )
      return [];
    const id = await noahCardIdentity(landing, 'noah-business-training');
    return [
      {
        firstParty: 'business-training',
        families: [],
        observedAt,
        card: {
          id,
          feedbackId: id,
          name: '法人のsi導入準備',
          summary:
            '業務の整理票と研修で聞くことを作ります。必要に合う場合に、広告を含む相談先をご案内します。',
          provider: 'Noah',
          host: 'avoado.si',
          href: landing,
          external: true,
          users: 0,
          oneTap: false,
          savedIn: [],
          topic: 'work',
          shape: 0,
        },
      },
    ];
  } catch {
    return [];
  }
}
/** Only a server-created reviewed entry can resolve this fixed free preparation tool. */
export async function noahRevenueTarget(
  entry: DirectoryEntry,
  now = Date.now(),
) {
  if (
    entry.firstParty !== 'business-training' ||
    entry.card.href !== landing ||
    entry.card.feedbackId !==
      (await noahCardIdentity(landing, 'noah-business-training')) ||
    !Number.isFinite(entry.observedAt) ||
    entry.observedAt > now ||
    now - entry.observedAt > 20 * 60000
  )
    return null;
  return {
    kind: 'mcp' as const,
    repository: landing,
    url: endpoint,
    provenance: catalog,
  };
}
