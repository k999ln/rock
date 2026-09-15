import { database, requestUser } from '@/lib/fund-store';
import { requestDeveloperUser } from '@/lib/sky-developer-auth';
import { SkySubmissionError } from '@/lib/sky-submission';
import { parseSkyToolPackage } from '@/lib/sky-tool-package';
import { skyToolPackageStore } from '@/lib/sky-tool-package-store';

const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });

async function body(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 131_072)
    throw new SkySubmissionError('Tool Packageは128 KB以下にしてください。', 413);
  return JSON.parse(raw) as unknown;
}

function failure(error: unknown) {
  if (error instanceof SkySubmissionError)
    return json({ error: error.message }, error.status);
  if (error instanceof Error && error.message === 'UNAUTHORIZED')
    return json({ error: 'サインインするとToolを登録できます。' }, 401);
  if (error instanceof Error && error.message === 'ORIGIN')
    return json({ error: 'Rock Studioから登録してください。' }, 403);
  if (error instanceof SyntaxError)
    return json({ error: 'PackageのJSON形式を確認してください。' }, 400);
  return json({ error: 'Tool Packageを保存できませんでした。' }, 503);
}

export async function GET(request: Request) {
  try {
    return json({
      packages: await skyToolPackageStore(database()).listOwner(
        requestUser(request),
      ),
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const db = database();
    const userId = await requestDeveloperUser(request, db);
    const payload = (await body(request)) as {
      manifest?: unknown;
      confirmations?: Record<string, unknown>;
    };
    const confirmations = payload.confirmations;
    if (
      !confirmations ||
      confirmations.rights !== true ||
      confirmations.pricing !== true ||
      confirmations.sideEffects !== true ||
      confirmations.tests !== true
    )
      throw new SkySubmissionError(
        '権利・料金・副作用・テスト内容を確認してください。',
      );
    const manifest = parseSkyToolPackage(payload.manifest);
    const saved = await skyToolPackageStore(db).create(userId, manifest);
    if (!saved)
      throw new SkySubmissionError(
        '同じTool IDと版は登録済みです。版を上げてください。',
        409,
      );
    return json({ package: saved }, 201);
  } catch (error) {
    return failure(error);
  }
}
