const PRODUCT_HUNT_HOSTS = new Set(['producthunt.com', 'www.producthunt.com']);

export function parseProductHuntUrl(value: string): string | null {
  const raw = value.trim();
  if (!raw || raw.length > 500) return null;
  try {
    const parsed = new URL(raw);
    if (
      parsed.protocol !== 'https:' ||
      !PRODUCT_HUNT_HOSTS.has(parsed.hostname.toLowerCase()) ||
      parsed.username ||
      parsed.password ||
      parsed.hash
    )
      return null;
    if (!/^\/(posts|products)\/[a-z0-9][a-z0-9-]*(?:\/)?$/i.test(parsed.pathname))
      return null;
    parsed.search = '';
    parsed.pathname = parsed.pathname.replace(/\/$/, '');
    return parsed.toString();
  } catch {
    return null;
  }
}

export function isProductHuntUrl(value: string): boolean {
  return parseProductHuntUrl(value) !== null;
}
