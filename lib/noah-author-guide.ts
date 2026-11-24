export const NOAH_GUIDE_LIMIT = 2000;

/** Guide markup is display text. Renderers never load images, links or raw HTML. */
export function normalizedNoahGuide(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\r\n?/g, '\n').trim();
  if (!text || text.length > NOAH_GUIDE_LIMIT) return null;
  for (const char of text) {
    const code = char.charCodeAt(0);
    if ((code < 32 && char !== '\n' && char !== '\t') || code === 127) return null;
  }
  return text;
}
