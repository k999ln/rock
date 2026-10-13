// An owner scope is an intent check, never an authentication credential. The
// authenticated requestUser remains the sole authority for reads and writes.
export const OWNER_SCOPE_HEADER = 'X-Rock-Owner-Scope';
export const OWNER_CHANGED = 'OWNER_CHANGED';
export const OWNER_CHECK_REQUIRED = '保存先の本人確認ができません。接続を確認してください。';
export const OWNER_CHANGED_MESSAGE = '保存を始めたアカウントと異なります。元のアカウントで接続を確認するか、保留を解除して入力から新しく保存してください。';
export function readOwnerScope(value: unknown): string | null {
  return typeof value === 'string' && /^owner-v1:[a-f0-9]{64}$/.test(value) ? value : null;
}
export async function ownerScopeFor(user: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`rock-owner-intent-v1\0${user}`));
  return `owner-v1:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
export async function rejectChangedOwner(request: Request, user: string): Promise<Response | null> {
  const expected = request.headers.get(OWNER_SCOPE_HEADER);
  // Optional for existing API clients. Recovering browser workspaces
  // always send it; when supplied, malformed/empty values also fail closed.
  if (expected === null || (readOwnerScope(expected) && expected === await ownerScopeFor(user))) return null;
  if (request.body && !request.bodyUsed && !request.body.locked) void request.body.cancel().catch(() => {});
  return Response.json({ error: OWNER_CHANGED_MESSAGE, code: OWNER_CHANGED }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
}
