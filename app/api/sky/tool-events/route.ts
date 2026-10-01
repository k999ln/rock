import { database, requestUser } from '@/lib/fund-store';
import { requestDeveloperUser } from '@/lib/sky-developer-auth';
import { SkySubmissionError } from '@/lib/sky-submission';
import {
  parseSkyToolEvent,
  skyToolEventStore,
} from '@/lib/sky-tool-events';

const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });

function failure(error: unknown) {
  if (error instanceof SkySubmissionError)
    return json({ error: error.message }, error.status);
  if (error instanceof Error && error.message === 'UNAUTHORIZED')
    return json({ error: '有効な開発者キーが必要です。' }, 401);
  if (error instanceof Error && error.message === 'ORIGIN')
    return json({ error: 'Rock Studioから確認してください。' }, 403);
  if (error instanceof SyntaxError)
    return json({ error: '利用イベントの形式を確認してください。' }, 400);
  return json({ error: '利用イベントを処理できませんでした。' }, 503);
}

async function body(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 8_192)
    throw new SkySubmissionError('利用イベントは8 KB以下にしてください。', 413);
  return JSON.parse(raw) as unknown;
}

export async function GET(request: Request) {
  try {
    return json({
      usage: await skyToolEventStore(database()).summary(await requestUser(request)),
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const db = database();
    const userId = await requestDeveloperUser(request, db);
    const event = parseSkyToolEvent(await body(request));
    const result = await skyToolEventStore(db).record(userId, event);
    return json(result, result.replay ? 200 : 202);
  } catch (error) {
    return failure(error);
  }
}
