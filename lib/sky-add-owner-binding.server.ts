import type { VerifiedZoomLaunch } from './zoom-app-context.server.ts';

/** Stored only after a separate, authenticated Sky account-link flow succeeds. */
export type SkyAddZoomOwnerLink = {
  hostAppId: string;
  hostUserMac: string;
  launchContextMac: string;
  skyOwnerUserId: string;
  allowedContextTypes: readonly VerifiedZoomLaunch['type'][];
  issuedAtMs: number;
  expiresAtMs: number;
  revokedAtMs: number | null;
};

export type SkyAddOwnerBindingDecision =
  | 'owner-auth-required'
  | 'account-link-required'
  | 'host-user-mismatch'
  | 'host-app-mismatch'
  | 'host-context-mismatch'
  | 'host-session-expired'
  | 'host-session-revoked'
  | 'ready-for-capability-check';

const MAX_LEASE_MS = 5 * 60_000;

function sameMac(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1)
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function base64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function hmac(value: string, serverSecret: string): Promise<string> {
  if (serverSecret.length < 32) throw new Error('HOST_USER_MAC_CONFIG');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(serverSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64Url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}

/** The server secret is distinct from the Zoom Client Secret; never expose it to a WebView. */
export async function macZoomUserId(hostAppId: string, zoomUserId: string, serverSecret: string): Promise<string> {
  if (!hostAppId || !zoomUserId) throw new Error('HOST_USER_MAC_CONFIG');
  return hmac(`user:${hostAppId.length}:${hostAppId}${zoomUserId.length}:${zoomUserId}`, serverSecret);
}

/** Bind a lease to the exact meeting/chat launch, not just the Zoom user. */
export async function macZoomLaunchContext(hostAppId: string, launch: VerifiedZoomLaunch, serverSecret: string): Promise<string> {
  if (!hostAppId) throw new Error('HOST_USER_MAC_CONFIG');
  return hmac(`context:${hostAppId}:${JSON.stringify([
    launch.type, launch.meetingUuid ?? null, launch.parentMeetingUuid ?? null,
    launch.chatId ?? null, launch.messageId ?? null, launch.actionId ?? null, launch.triggerId ?? null,
  ])}`, serverSecret);
}

/** A successful result is only eligible for grant, budget and Broker checks; it is not an execution grant. */
export async function evaluateSkyAddZoomOwnerBinding(input: {
  verifiedLaunch: VerifiedZoomLaunch;
  hostAppId: string;
  serverSecret: string;
  authenticatedSkyOwnerUserId: string | null;
  link: SkyAddZoomOwnerLink | null;
  nowMs: number;
}): Promise<SkyAddOwnerBindingDecision> {
  const { verifiedLaunch, hostAppId, serverSecret, authenticatedSkyOwnerUserId, link, nowMs } = input;
  if (!authenticatedSkyOwnerUserId) return 'owner-auth-required';
  if (!link || link.skyOwnerUserId !== authenticatedSkyOwnerUserId) return 'account-link-required';
  if (link.hostAppId !== hostAppId) return 'host-app-mismatch';
  const hostUserMac = await macZoomUserId(hostAppId, verifiedLaunch.zoomUserId, serverSecret);
  if (!sameMac(link.hostUserMac, hostUserMac)) return 'host-user-mismatch';
  const launchContextMac = await macZoomLaunchContext(hostAppId, verifiedLaunch, serverSecret);
  if (!sameMac(link.launchContextMac, launchContextMac)) return 'host-context-mismatch';
  if (!link.allowedContextTypes.includes(verifiedLaunch.type)) return 'host-context-mismatch';
  if (link.revokedAtMs !== null) return 'host-session-revoked';
  if (!Number.isSafeInteger(nowMs) || !Number.isSafeInteger(link.issuedAtMs)
    || !Number.isSafeInteger(link.expiresAtMs)
    || link.issuedAtMs > nowMs || link.expiresAtMs <= link.issuedAtMs
    || link.expiresAtMs - link.issuedAtMs > MAX_LEASE_MS
    || verifiedLaunch.expiresAtMs <= nowMs || link.expiresAtMs <= nowMs)
    return 'host-session-expired';
  return 'ready-for-capability-check';
}
