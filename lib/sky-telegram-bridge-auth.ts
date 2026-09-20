import { env } from 'cloudflare:workers';

function configuredSecret() {
  const value = (env as unknown as Record<string, unknown>).SKY_TELEGRAM_BRIDGE_SECRET;
  return typeof value === 'string' ? value : '';
}

export function skyTelegramBridgeAuthorized(request: Request) {
  const expected = configuredSecret();
  const actual = (request.headers.get('authorization') || '').replace(
    /^Bearer\s+/i,
    '',
  );
  if (!expected || expected.length !== actual.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1)
    difference |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  return difference === 0;
}
