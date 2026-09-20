import { database } from '@/lib/fund-store';
import { skyActivationStore } from '@/lib/sky-activation';
import { skyTelegramBridgeAuthorized } from '@/lib/sky-telegram-bridge-auth';
import { SkySubmissionError } from '@/lib/sky-submission';

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  if (!skyTelegramBridgeAuthorized(request))
    return json({ error: 'unauthorized' }, 401);
  try {
    const input = (await request.json()) as Record<string, unknown>;
    const result = await skyActivationStore(database()).redeem({
      code: typeof input.activationCode === 'string' ? input.activationCode : '',
      telegramUserId: typeof input.telegramUserId === 'string' ? input.telegramUserId : '',
      telegramChatId: typeof input.telegramChatId === 'string' ? input.telegramChatId : '',
      botUsername: typeof input.botUsername === 'string' ? input.botUsername : undefined,
    });
    return json({
      granted: true,
      alreadyGranted: result.alreadyGranted,
      grantId: result.grantId,
      package: {
        packageKey: result.package.packageKey,
        name: result.package.manifest.name,
        summary: result.package.manifest.summary,
        version: result.package.manifest.version,
        sideEffects: result.package.manifest.capabilities.sideEffects,
      },
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    if (error instanceof SkySubmissionError)
      return json({ error: error.message }, error.status);
    if (error instanceof SyntaxError) return json({ error: '入力形式を確認してください。' }, 400);
    return json({ error: 'Skyコードを確認できませんでした。' }, 503);
  }
}
