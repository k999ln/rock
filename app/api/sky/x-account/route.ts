import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import { body, json } from '@/lib/operations-api';
import { XAccountError, xAccountService } from '@/lib/sky-x-account';
function xAccountMessage(code: string) {
  return (
    (
      {
        'setup-required': 'X連携のサービス設定がまだ整っていません。',
        'consent-required': '投稿の読み取り範囲を確認してください。',
        'reconnect-required':
          'Xへの接続が切れています。もう一度つないでください。',
        'connection-changed':
          '別の画面で連携が変更されています。最新の状態を確認してください。',
        'invalid-state':
          '認可の期限が切れたか、開始した画面と一致しません。もう一度接続してください。',
        'read-budget-exhausted':
          '今日の取得上限です。追加の取得は止めています。',
        'rate-limited': 'Xの更新制限中です。表示された時刻までお待ちください。',
        'provider-budget-required': 'X側の利用枠を確認してください。',
        'key-unavailable':
          '連携の保存鍵を確認できません。運営へお問い合わせください。',
      } as Record<string, string>
    )[code] ?? 'Xへの接続を確認できません。少し待ってから再試行してください。'
  );
}
async function handle(request: Request, method: 'GET' | 'POST' | 'DELETE') {
  try {
    const owner = await requestUser(request),
      origin = new URL(request.url).origin;
    if (method !== 'GET' && request.headers.get('origin') !== origin)
      throw new Error('ORIGIN');
    const service = xAccountService(
      database(),
      owner,
      env as unknown as Record<string, unknown>,
      origin,
    );
    if (method === 'GET') return json(await service.status());
    const v = await body(request);
    if (!v || typeof v !== 'object' || Array.isArray(v))
      return json({ error: '操作を確認してください。' }, 400);
    const input = v as Record<string, unknown>;
    if (method === 'DELETE') {
      if (Object.keys(input).some((k) => k !== 'revision'))
        return json({ error: '操作を確認してください。' }, 400);
      return json(await service.disconnect(input.revision));
    }
    if (
      input.action === 'begin' &&
      Object.keys(input).every((k) => ['action', 'consent'].includes(k))
    ) {
      const value = await service.begin(input.consent);
      const response = json({ authorizeUrl: value.authorizeUrl });
      response.headers.set(
        'Set-Cookie',
        `sky_x_oauth=${value.binding}; HttpOnly; SameSite=Lax; Path=/api/sky/x-account; Max-Age=600${origin.startsWith('https:') ? '; Secure' : ''}`,
      );
      return response;
    }
    if (input.action === 'refresh' && Object.keys(input).length === 1)
      return json(await service.refresh());
    return json({ error: '操作を確認してください。' }, 400);
  } catch (error) {
    if (error instanceof XAccountError)
      return json(
        {
          error: xAccountMessage(error.code),
          code: error.code,
          retryAt: error.retryAt,
        },
        error.status,
      );
    if (error instanceof Error && error.message === 'UNAUTHORIZED')
      return json(
        { error: 'SkyへサインインしてからXをつないでください。' },
        401,
      );
    if (error instanceof Error && error.message === 'ORIGIN')
      return json({ error: 'この画面から操作してください。' }, 403);
    return json({ error: 'X連携の状態を読み込めませんでした。' }, 503);
  }
}
export const GET = (r: Request) => handle(r, 'GET');
export const POST = (r: Request) => handle(r, 'POST');
export const DELETE = (r: Request) => handle(r, 'DELETE');
