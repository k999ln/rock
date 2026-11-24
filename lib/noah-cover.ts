/** Media is presented only through the owning Agent or reviewed package endpoint. */
export const NOAH_COVER_LIMIT = 8 * 1024 * 1024;
export const NOAH_COVER_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'video/webm', 'video/mp4'] as const;
export type NoahCover = { type: typeof NOAH_COVER_TYPES[number]; bytes: number; sha256: string };
export function isNoahCover(value: unknown): value is NoahCover {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const pin = value as NoahCover;
  return Object.keys(value).length === 3 && NOAH_COVER_TYPES.includes(pin.type) &&
    Number.isInteger(pin.bytes) && pin.bytes >= 16 && pin.bytes <= NOAH_COVER_LIMIT &&
    typeof pin.sha256 === 'string' && /^[a-f0-9]{64}$/.test(pin.sha256);
}

export function noahPrivateCoverUrl(id: string) {
  return '/api/noah/agents/' + encodeURIComponent(id) + '/cover';
}
export function noahReleaseCoverUrl(packageKey: string, manifestSha256: string, publicOnly = false) {
  return '/api/noah/releases/' + encodeURIComponent(packageKey) + '/cover?digest=' + encodeURIComponent(manifestSha256) + (publicOnly ? '&public=1' : '');
}
export function noahInviteCoverUrl(inviteId: string) {
  return '/api/noah/invites/' + encodeURIComponent(inviteId) + '/cover';
}
