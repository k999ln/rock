/** Display-only handoff from a public catalog card. Never carries permissions or connection state. */
export type NoahDetailPreview = { id: string; name: string; summary: string; provider?: string };
export const NOAH_DETAIL_PREVIEW_KEY = 'noah-detail-preview-v1';
const MAX_AGE = 5 * 60 * 1000;
export function noahDetailTarget(href: string): string | null {
  try {
    const url = new URL(href, 'https://avoado.si');
    if (url.origin !== 'https://avoado.si' || !['/noah/discover/agent', '/noah/ready/agent'].includes(url.pathname) || url.searchParams.has('firstJob')) return null;
    const id = url.searchParams.get('id');
    return id && id.length <= 400 ? `${url.pathname}?${new URLSearchParams({ id })}` : null;
  } catch { return null; }
}
export function noahDetailPreviewRecord(href: string, card: NoahDetailPreview, now = Date.now()): string | null {
  const target = noahDetailTarget(href);
  if (!target) return null;
  return JSON.stringify({ target, at: now, card: { id: card.id.slice(0, 400), name: card.name.slice(0, 300), summary: card.summary.slice(0, 8000), provider: card.provider?.slice(0, 300) } });
}
export function readNoahDetailPreview(raw: string | null, href: string, now = Date.now()): NoahDetailPreview | null {
  try {
    if (!raw || raw.length > 12000) return null;
    const value = JSON.parse(raw), target = noahDetailTarget(href);
    if (!target || value.target !== target || typeof value.at !== 'number' || value.at > now || now - value.at > MAX_AGE) return null;
    const card = value.card;
    return card && typeof card.id === 'string' && typeof card.name === 'string' && typeof card.summary === 'string' && (card.provider === undefined || typeof card.provider === 'string')
      ? { id: card.id, name: card.name, summary: card.summary, provider: card.provider } : null;
  } catch { return null; }
}
