import { database } from '@/lib/fund-store';
import { skyActivationStore } from '@/lib/sky-activation';
import { skyTelegramBridgeAuthorized } from '@/lib/sky-telegram-bridge-auth';
import { SkySubmissionError } from '@/lib/sky-submission';

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: Request) {
  if (!skyTelegramBridgeAuthorized(request))
    return json({ error: 'unauthorized' }, 401);
  try {
    const telegramUserId = new URL(request.url).searchParams.get('telegramUserId') || '';
    if (!/^-?[0-9]{1,32}$/.test(telegramUserId))
      throw new SkySubmissionError('Telegram利用者IDを確認してください。');
    return json({ tools: await skyActivationStore(database()).listTelegramTools(telegramUserId) });
  } catch (error) {
    if (error instanceof SkySubmissionError)
      return json({ error: error.message }, error.status);
    return json({ error: 'Skyの有効化済みToolを読み込めませんでした。' }, 503);
  }
}
