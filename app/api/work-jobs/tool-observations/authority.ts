import { env } from 'cloudflare:workers';
import { configuredLocalDevelopmentUser } from '@/lib/request-auth';

/** Local developer preview only. This is not service, eSIM, or commerce authority. */
export function dispatchAuthorityAvailable(request: Request, owner: string, requireOrigin: boolean): boolean {
  const config = env as unknown as { ROCKSTAR_LOCAL_DEVELOPMENT_USER_ID?: string; ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string };
  const url = new URL(request.url), configured = configuredLocalDevelopmentUser(request, config.ROCKSTAR_LOCAL_DEVELOPMENT_USER_ID);
  if (url.protocol !== 'http:' || !configured || configured !== owner || config.ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED !== 'false') return false;
  if (request.headers.has('authorization') || request.headers.has('cookie')) return false;
  const gateway = request.headers.get('oai-authenticated-user-id');
  if (gateway && gateway.trim() !== configured) return false;
  const origin = request.headers.get('origin');
  return requireOrigin ? origin === url.origin : !origin || origin === url.origin;
}
