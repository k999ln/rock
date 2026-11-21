import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import { authenticateEsimCloudRequest } from '@/lib/esim-cloud-access';

export const dynamic = 'force-dynamic';
const fail = (message: string, status: number) =>
  new Response(message, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });

async function handle(request: Request) {
  const url = new URL(request.url);
  if (request.method === 'POST' && request.headers.get('origin') !== url.origin)
    return fail('Noahの画面から操作してください。', 403);
  try {
    const owner = await authenticateEsimCloudRequest(request, database(), env);
    const cloud = (env as unknown as { NOAH_CLOUD_WORK?: Fetcher })
      .NOAH_CLOUD_WORK;
    if (!cloud) return fail('専用クラウドとの接続を準備しています。', 503);
    // The private carrier gateway verifies its own current-line evidence. Forward
    // only that evidence. The browser's account and eSIM tokens stay at this edge.
    const headers = new Headers({ 'X-Noah-Account': owner });
    for (const name of ['Content-Type', 'X-Noah-Carrier-Proof']) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    return await cloud.fetch(
      new Request(request, { headers, redirect: 'manual' }),
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED')
      return fail('有効なNoah用eSIMで接続してください。', 401);
    return fail(
      '回線の利用権を確認できませんでした。再度お試しください。',
      503,
    );
  }
}
export const GET = handle;
export const POST = handle;
