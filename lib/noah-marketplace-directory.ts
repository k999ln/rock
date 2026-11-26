import { catalog } from './catalog.ts';
import { skyAiMarketplaceEntries } from './sky-ai-marketplace.ts';
import { noahCardIdentity, noahProjectUrl, type DirectoryEntry } from './noah-agent-directory.ts';
import { noahPinShape, noahPinTopic } from './noah-pins.ts';
import { noahReleaseCoverUrl } from './noah-cover.ts';
import type { StoredSkyToolPackage } from './sky-tool-package-store.ts';

/** Reuse the public registry's review gate; a listing is never a purchase or execution grant. */
export async function mergeNoahMarketplaceDirectory(existing: DirectoryEntry[], registry: StoredSkyToolPackage[]) {
  const entries = new Map(existing.map(entry => [entry.card.feedbackId ?? entry.card.id, entry]));
  const base = (id: string, name: string, summary: string, provider: string): DirectoryEntry => ({
    families: [], observedAt: 0, card: { id, name, summary, provider, host: null,
      users: 0, oneTap: false, savedIn: [], external: true, topic: noahPinTopic(name, summary), shape: noahPinShape(id) },
  });
  for (const tool of catalog) {
    const entry = base(`market:tool:${tool.id}`, tool.name, tool.description, 'Noah');
    entry.card.marketplace = { kind: 'tool', key: tool.id, label: tool.status === 'ready' ? '利用条件を確認' : '導入候補' };
    entries.set(entry.card.id, entry);
  }
  for (const model of skyAiMarketplaceEntries) {
    const entry = base(`market:model:${model.id}`, model.name, model.detail, model.id);
    entry.card.marketplace = { kind: 'model', key: model.id, label: 'モデル · 接続条件を確認' };
    entries.set(entry.card.id, entry);
  }
  // Multiple versions remain accessible through purchase links, but appear once in the feed.
  const latest = new Map<string, StoredSkyToolPackage>();
  for (const row of [...registry].filter(row => row.status === 'verified' && row.installable === true)
    .sort((a,b) => (b.publishedAt ?? b.createdAt) - (a.publishedAt ?? a.createdAt) || a.packageKey.localeCompare(b.packageKey))) {
    if (!latest.has(row.manifest.id)) latest.set(row.manifest.id, row);
  }
  const urls = new Map<string, number>();
  for (const row of latest.values()) {
    const url = noahProjectUrl(row.manifest.source.url);
    if (url) urls.set(url, (urls.get(url) ?? 0) + 1);
  }
  for (const row of latest.values()) {
    const { manifest } = row, url = noahProjectUrl(manifest.source.url);
    // Never merge distinct tools just because their repository or host is shared.
    const projectId = url && urls.get(url) === 1 ? await noahCardIdentity(url, '') : null;
    const prior = projectId ? entries.get(projectId) : undefined;
    const entry = prior ? { ...prior, card: { ...prior.card } } : base(`market:package:${manifest.id}`, manifest.name, manifest.summary, manifest.developer.displayName);
    entry.card.marketplace = { kind: 'package', key: row.packageKey, label: '料金・購入条件',
      ...(manifest.cover ? { cover: { type: manifest.cover.type, url: noahReleaseCoverUrl(row.packageKey, row.manifestSha256) } } : {}) };
    entry.observedAt = Math.max(entry.observedAt, row.publishedAt ?? row.createdAt);
    entry.createdAt = row.publishedAt ?? row.createdAt;
    entries.set(entry.card.feedbackId ?? entry.card.id, entry);
  }
  return [...entries.values()];
}
