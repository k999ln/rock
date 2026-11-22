import type { Metadata } from 'next';
import { NOAH_PUBLIC_ORIGIN } from './noah-public-origin.ts';

export type NoahShareAgent = { id: string; name: string; summary: string; provider: string };

// Keep the existing C0 + DEL boundary; other Unicode characters remain valid.
const isShareControl = (character: string): boolean => {
  const code = character.charCodeAt(0);
  return code <= 0x1f || code === 0x7f;
};
export function noahShareId(value: unknown): string | null {
  return typeof value === 'string' && value.length >= 3 && value.length <= 400 &&
    !Array.from(value).some(isShareControl) ? value : null;
}
export function noahAgentShareUrl(id: string): string {
  if (!noahShareId(id)) throw new Error('Invalid Agent ID');
  return `${NOAH_PUBLIC_ORIGIN}/noah/ready/agent?${new URLSearchParams({ id })}`;
}
const clean = (value: string, limit: number) => Array.from(Array.from(value, character => isShareControl(character) ? ' ' : character).join('').replace(/\s+/gu, ' ').trim()).slice(0, limit).join('');

/** Only the anonymous public listing may supply previews, even for signed-in viewers. */
export async function loadNoahShareAgent(value: unknown, deps: {
  publicListing: boolean;
  detail: (id: string, owner: null, reviewer: false) => Promise<{ id: string; name: string; summary: string; provider: string; listed: boolean }>;
}): Promise<NoahShareAgent | null> {
  const id = noahShareId(value);
  if (!id || !deps.publicListing) return null;
  try {
    const item = await deps.detail(id, null, false);
    if (!item.listed || item.id !== id) return null;
    return { id, name: clean(item.name, 100) || 'Agent', summary: clean(item.summary, 220), provider: clean(item.provider, 80) };
  } catch { return null; }
}

export function noahAgentShareMetadata(agent: NoahShareAgent | null): Metadata {
  if (!agent) return { title: 'Agent の詳細 — Noah', description: 'Noahで公開されているAgentを探せます。', robots: { index: false, follow: false } };
  const title = `${agent.name} — Noah`;
  const description = agent.summary || `${agent.provider}が提供するAgent。Noahで詳細を確認できます。`;
  const url = noahAgentShareUrl(agent.id);
  const image = { url: `${NOAH_PUBLIC_ORIGIN}/api/noah/share-image?${new URLSearchParams({ id: agent.id, v: '1' })}`, width: 1200, height: 630, alt: `${agent.name} — ${description}` };
  return {
    title, description, metadataBase: new URL(NOAH_PUBLIC_ORIGIN), alternates: { canonical: url },
    openGraph: { type: 'website', locale: 'ja_JP', siteName: 'Noah', title, description, url, images: [{ ...image, type: 'image/png' }] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}
