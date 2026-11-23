import registry from '../data/noah-agent-registry.json' with { type: 'json' };
import { noahCardIdentity, noahProjectUrl, type DirectoryEntry } from './noah-agent-directory.ts';
import { noahPinShape, noahPinTopic } from './noah-pins.ts';
import type { NoahAgentSource } from './noah-agent-cards.ts';

/** Research establishes identity only; the existing provider runtime still validates the execution target. */
export async function noahVerifiedDirectory(): Promise<DirectoryEntry[]> {
  return Promise.all(registry.products.map(async product => {
    const url = noahProjectUrl(product.url);
    const id = await noahCardIdentity(url, product.familyId);
    // Citations may describe third-party clients/forks. Only the canonical distribution is a runnable source.
    const sources: NoahAgentSource[] = [product.url].flatMap(sourceUrl => {
      const host = new URL(sourceUrl).hostname;
      const source = host === 'github.com' ? 'github' : host === 'huggingface.co' ? 'huggingface' : null;
      return source ? [{ source, sourceUrl, author: product.publisher, observedAt: Date.parse(registry.asOf) }] : [];
    });
    return { families: [], observedAt: Date.parse(registry.asOf), card: {
      id, feedbackId: id, name: product.name, provider: product.publisher, summary: product.summary,
      host: new URL(product.url).hostname, users: 0, oneTap: false, savedIn: [], href: product.url,
      external: true, sources, topic: noahPinTopic(product.name, product.summary), shape: noahPinShape(id),
    } };
  }));
}

export function mergeNoahVerifiedDirectory(existing: DirectoryEntry[], verified: DirectoryEntry[]) {
  const entries = new Map(existing.map(entry => [entry.card.feedbackId ?? entry.card.id, entry]));
  for (const row of verified) {
    const id = row.card.feedbackId ?? row.card.id, prior = entries.get(id);
    if (!prior) entries.set(id, row);
    else {
      const sources = new Map([...(prior.card.sources ?? []), ...(row.card.sources ?? [])].map(source => [source.sourceUrl, source]));
      entries.set(id, { ...prior, card: { ...prior.card, sources: [...sources.values()] } });
    }
  }
  return [...entries.values()];
}

export async function noahVerifiedIdentities() {
  return Promise.all(registry.products.map(async product => ({ id: product.id, familyId: product.familyId,
    projectId: await noahCardIdentity(noahProjectUrl(product.url), product.familyId), name: product.name,
    source: product.url, category: product.category })));
}
