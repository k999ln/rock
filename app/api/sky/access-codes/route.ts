import { database } from '@/lib/fund-store';
import { requestDeveloperUser } from '@/lib/sky-developer-auth';
import { skyActivationStore } from '@/lib/sky-activation';
import { SkySubmissionError } from '@/lib/sky-submission';

const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });

async function body(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 4_096)
    throw new SkySubmissionError('入力が大きすぎます。', 413);
  return JSON.parse(raw) as Record<string, unknown>;
}

function label(value: unknown) {
  if (typeof value !== 'string')
    throw new SkySubmissionError('コード名を1〜80文字で入力してください。');
  const normalized = value.trim();
  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index);
    if (code < 32 || code === 127)
      throw new SkySubmissionError('コード名を1〜80文字で入力してください。');
  }
  if (normalized.length < 1 || normalized.length > 80)
    throw new SkySubmissionError('コード名を1〜80文字で入力してください。');
  return normalized;
}

function packageKey(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^[a-z0-9]+(?:[.-][a-z0-9]+)+@[0-9]+\.[0-9]+\.[0-9]+$/.test(value)
  )
    throw new SkySubmissionError('Package IDを確認してください。');
  return value;
}

function maxUses(value: unknown) {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 1000)
    throw new SkySubmissionError('使用回数は1〜1000の整数にしてください。');
  return value as number;
}

function expiresAt(value: unknown) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string')
    throw new SkySubmissionError('期限の形式を確認してください。');
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time <= Date.now() || time > Date.now() + 366 * 24 * 60 * 60 * 1000)
    throw new SkySubmissionError('期限は現在から1年以内の未来にしてください。');
  return time;
}

function failure(error: unknown) {
  if (error instanceof SkySubmissionError)
    return json({ error: error.message }, error.status);
  if (error instanceof Error && error.message === 'UNAUTHORIZED')
    return json({ error: 'サインインするとSkyコードを発行できます。' }, 401);
  if (error instanceof Error && error.message === 'ORIGIN')
    return json({ error: 'Skyから操作してください。' }, 403);
  if (error instanceof SyntaxError)
    return json({ error: '入力形式を確認してください。' }, 400);
  return json({ error: 'Skyコードを発行できませんでした。' }, 503);
}

export async function GET(request: Request) {
  try {
    const db = database();
    const userId = await requestDeveloperUser(request, db);
    return json({ codes: await skyActivationStore(db).listOwner(userId) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const db = database();
    const userId = await requestDeveloperUser(request, db);
    const input = await body(request);
    const created = await skyActivationStore(db).issue(userId, {
      packageKey: packageKey(input.packageKey),
      label: label(input.label),
      maxUses: maxUses(input.maxUses ?? 1),
      expiresAt: expiresAt(input.expiresAt),
    });
    return json(
      {
        code: created,
        warning:
          'コードは登録済みToolへの利用許可です。ソースコードや秘密鍵はTelegramへ貼らず、外部・金融作用は実行時に別確認します。',
      },
      201,
    );
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const db = database();
    const userId = await requestDeveloperUser(request, db);
    const input = await body(request);
    if (typeof input.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.id))
      throw new SkySubmissionError('コードIDを確認してください。');
    if (!(await skyActivationStore(db).revoke(userId, input.id)))
      throw new SkySubmissionError('有効なコードが見つかりません。', 404);
    return json({ revoked: true });
  } catch (error) {
    return failure(error);
  }
}
