/** Public Noah URLs must remain usable from a phone, independently of this Mac. */
export const NOAH_PUBLIC_ORIGIN = 'https://avoado.si';

/** NOAH_ORIGIN accepts a hostname or an HTTPS origin, never a local address or path. */
export function noahPublicOrigin(value?: string): string {
  if (!value?.trim()) return NOAH_PUBLIC_ORIGIN;
  const raw = value.trim();
  const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      url.pathname !== '/' || url.search || url.hash || !host.includes('.') ||
      /^[\d.]+$/.test(host) || host.includes(':') ||
      ['localhost', 'local', 'internal', 'lan', 'test', 'invalid', 'onion'].some(s => host === s || host.endsWith(`.${s}`))) {
    throw new Error('NOAH_ORIGIN must be a public HTTPS origin');
  }
  return url.origin;
}
