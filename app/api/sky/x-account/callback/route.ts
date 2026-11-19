import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import { xAccountService } from '@/lib/sky-x-account';
export async function GET(request: Request) {
  const origin = new URL(request.url).origin,
    url = new URL(request.url),
    returnUrl = new URL('/#news-plugins', origin);
  let result = 'failed';
  try {
    const owner = await requestUser(request);
    const binding =
      request.headers
        .get('cookie')
        ?.split(';')
        .map((s) => s.trim())
        .find((s) => s.startsWith('sky_x_oauth='))
        ?.slice('sky_x_oauth='.length) ?? '';
    if (url.searchParams.has('error')) result = 'denied';
    else {
      await xAccountService(
        database(),
        owner,
        env as unknown as Record<string, unknown>,
        origin,
      ).callback(
        url.searchParams.get('state') ?? '',
        url.searchParams.get('code') ?? '',
        binding,
      );
      result = 'connected';
    }
  } catch {
    /* Do not echo provider errors, OAuth codes, state or tokens. */
  }
  returnUrl.searchParams.set('x_connection', result);
  return new Response(null, {
    status: 303,
    headers: {
      Location: returnUrl.toString(),
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'Set-Cookie': `sky_x_oauth=; HttpOnly; SameSite=Lax; Path=/api/sky/x-account; Max-Age=0${origin.startsWith('https:') ? '; Secure' : ''}`,
    },
  });
}
