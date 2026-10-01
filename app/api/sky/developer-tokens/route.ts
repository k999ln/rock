import { database, requestUser } from '@/lib/fund-store';
import { skyDeveloperTokenStore } from '@/lib/sky-developer-auth';
import { SkySubmissionError } from '@/lib/sky-submission';

const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });

function failure(error: unknown) {
  if (error instanceof SkySubmissionError)
    return json({ error: error.message }, error.status);
  if (error instanceof Error && error.message === 'UNAUTHORIZED')
    return json({ error: 'サインインすると開発者キーを管理できます。' }, 401);
  if (error instanceof Error && error.message === 'ORIGIN')
    return json({ error: 'Rock Studioから操作してください。' }, 403);
  if (error instanceof SyntaxError)
    return json({ error: '入力形式を確認してください。' }, 400);
  return json({ error: '開発者キーを操作できませんでした。' }, 503);
}

async function input(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 2_048)
    throw new SkySubmissionError('入力が大きすぎます。', 413);
  return JSON.parse(raw) as Record<string, unknown>;
}

function label(value: unknown) {
  let hasControlCharacter = false;
  if (typeof value === 'string')
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code < 32 || code === 127) hasControlCharacter = true;
    }
  if (
    typeof value !== 'string' ||
    value.trim().length < 2 ||
    value.trim().length > 80 ||
    hasControlCharacter
  )
    throw new SkySubmissionError('キー名を2〜80文字で入力してください。');
  return value.trim();
}

export async function GET(request: Request) {
  try {
    const userId = await requestUser(request);
    return json({ tokens: await skyDeveloperTokenStore(database()).list(userId) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requestUser(request);
    const data = await input(request);
    const token = await skyDeveloperTokenStore(database()).create(
      userId,
      label(data.label),
    );
    return json(
      {
        token,
        warning:
          'このキーは再表示できません。コードへ直書きせずSKY_DEVELOPER_TOKENへ保存してください。',
      },
      201,
    );
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await requestUser(request);
    const data = await input(request);
    if (typeof data.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(data.id))
      throw new SkySubmissionError('開発者キーIDを確認してください。');
    const revoked = await skyDeveloperTokenStore(database()).revoke(
      userId,
      data.id,
    );
    if (!revoked) throw new SkySubmissionError('有効なキーが見つかりません。', 404);
    return json({ revoked: true });
  } catch (error) {
    return failure(error);
  }
}
