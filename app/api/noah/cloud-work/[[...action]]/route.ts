import { esc, layout } from '@/toolkits/esim-bootstrap/noah-trial/view.mjs';
import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import { authenticateEsimCloudContext } from '@/lib/esim-cloud-access';

import { LinuxServiceError, linuxRequestText } from '@/lib/sky-linux-service';
import { handleEsimMeteredWork } from '@/lib/noah-esim-metered';
import {
  linuxServiceStore,
  type LinuxServiceConfig,
} from '@/lib/sky-linux-service-store';

export const dynamic = 'force-dynamic';
const fail = (message: string, status: number) =>
  new Response(message, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });

function connectionFailure(request: Request, message: string, status: number) {
  if (request.method !== 'GET') return fail(message, status);
  return new Response(
    layout(
      'Noah専用クラウド',
      '<p>' +
        esc(message) +
        '</p><p><a href="/connect">eSIMの導入</a> · <a href="/noah/purchases">購入履歴・eSIM設定</a> · <a href="/noah">Noahに戻る</a></p>',
      'eSIMクラウド',
    ),
    {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
      },
    },
  );
}

async function handle(request: Request) {
  const url = new URL(request.url);
  if (request.method === 'POST' && request.headers.get('origin') !== url.origin)
    return fail('Noahの画面から操作してください。', 403);
  try {
    const db = database();
    const context = await authenticateEsimCloudContext(request, db, env);
    const metered = url.pathname === '/api/noah/cloud-work/metered';
    const cloud = (env as unknown as { NOAH_CLOUD_WORK?: Fetcher })
      .NOAH_CLOUD_WORK;
    if (!cloud)
      return connectionFailure(
        request,
        '専用クラウドとの接続を準備しています。',
        503,
      );
    // The private carrier gateway verifies its own current-line evidence. Forward
    // only that evidence. The browser's account and eSIM tokens stay at this edge.
    const headers = new Headers({ 'X-Noah-Account': context.owner });
    if (metered) {
      headers.set('X-Noah-Order', context.order);
      headers.set('X-Noah-Device', context.device);
    }
    for (const name of ['Content-Type', 'X-Noah-Carrier-Proof']) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const form =
      metered && request.method === 'POST'
        ? await linuxRequestText(request, 48000)
        : undefined;
    const verified = await cloud.fetch(
      form === undefined
        ? new Request(request, { headers, redirect: 'manual' })
        : new Request(url, {
            method: 'POST',
            headers,
            body: form,
            redirect: 'manual',
          }),
    );

    if (!metered || !verified.ok) return verified;
    if (
      verified.status !== 204 ||
      verified.headers.get('X-Noah-Line-Verified') !== 'metered'
    )
      return fail('専用回線を確認できませんでした。', 403);
    return await handleEsimMeteredWork(
      form,
      context,
      linuxServiceStore(db, env as unknown as LinuxServiceConfig),
      () => requestUser(request, { allowEsimCloudIdentity: false }),
    );
  } catch (error) {
    if (error instanceof LinuxServiceError)
      return fail(error.message, error.status);
    if (error instanceof Error && error.message === 'UNAUTHORIZED')
      return connectionFailure(
        request,
        '有効なNoah用eSIMで接続してください。',
        401,
      );
    return fail(
      '回線の利用権を確認できませんでした。再度お試しください。',
      503,
    );
  }
}
export const GET = handle;
export const POST = handle;
