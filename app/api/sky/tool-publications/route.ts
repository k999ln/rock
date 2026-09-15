import { database } from '@/lib/fund-store';
import { requestDeveloperUser } from '@/lib/sky-developer-auth';
import { SkySubmissionError } from '@/lib/sky-submission';
import { skyToolPackageStore } from '@/lib/sky-tool-package-store';

const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });

function value(input: unknown, label: string, pattern: RegExp) {
  if (typeof input !== 'string' || !pattern.test(input))
    throw new SkySubmissionError(`${label}を確認してください。`);
  return input;
}

async function body(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 4_096)
    throw new SkySubmissionError('公開要求が大きすぎます。', 413);
  return JSON.parse(raw) as { packageKey?: unknown; manifestSha256?: unknown };
}

function failure(error: unknown) {
  if (error instanceof SkySubmissionError)
    return json({ error: error.message }, error.status);
  if (error instanceof Error && error.message === 'UNAUTHORIZED')
    return json({ error: 'サインインするとToolを公開できます。' }, 401);
  if (error instanceof Error && error.message === 'ORIGIN')
    return json({ error: 'Rock Studioから公開してください。' }, 403);
  if (error instanceof SyntaxError)
    return json({ error: '公開要求の形式を確認してください。' }, 400);
  return json({ error: 'Toolを公開できませんでした。' }, 503);
}

export async function POST(request: Request) {
  try {
    const db = database();
    const userId = await requestDeveloperUser(request, db);
    const input = await body(request);
    const packageKey = value(
      input.packageKey,
      'Package ID',
      /^[a-z0-9]+(?:[.-][a-z0-9]+)+@[0-9]+\.[0-9]+\.[0-9]+$/,
    );
    const manifestSha256 = value(
      input.manifestSha256,
      'Package SHA-256',
      /^[0-9a-f]{64}$/,
    );
    const published = await skyToolPackageStore(db).publishDeclared(
      userId,
      packageKey,
      manifestSha256,
    );
    if (!published)
      throw new SkySubmissionError(
        '所有者・版・SHAまたは現在の公開状態を確認してください。',
        409,
      );
    return json({
      package: published,
      warning:
        '掲載情報を公開しました。Sandbox実行と作者署名が未確認のため、自動インストールはまだ無効です。',
    });
  } catch (error) {
    return failure(error);
  }
}
