import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import { requestRockstarUser } from '@/lib/rockstar-device-link';
import { exportSkyOwnerWork } from '@/lib/sky-owner-export.server';
import { SKY_OWNER_EXPORT_CSP, SkyOwnerExportError } from '@/lib/sky-owner-export';

type Context = { params: Promise<{ id: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer', Vary: 'Cookie, Authorization, oai-authenticated-user-id' };

export async function GET(request: Request, context: Context) {
  try {
    const db = database();
    const owner = await requestRockstarUser(request, db);
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site')
      return Response.json({ error: 'このサイトから持出しを選択してください。' }, { status: 403, headers });
    const { id } = await context.params;
    const values = [...url.searchParams.keys()];
    const revision = url.searchParams.get('revision') ?? '';
    if (!uuid.test(id) || values.length !== 1 || values[0] !== 'revision' ||
      !/^\d{1,10}$/.test(revision) || !Number.isSafeInteger(Number(revision)))
      throw new SkyOwnerExportError('INVALID_INPUT');
    // Authentication is required, but paid execution entitlement is deliberately not a recovery prerequisite.
    const key = (env as unknown as { A2A_INPUT_ENCRYPTION_KEY?: string }).A2A_INPUT_ENCRYPTION_KEY;
    const result = await exportSkyOwnerWork(db, owner, id, Number(revision), key);
    return new Response(result.html, { headers: { ...headers,
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Content-Security-Policy': SKY_OWNER_EXPORT_CSP,
      'X-Sky-Export-Completeness': result.manifest.completeness,
    } });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED')
      return Response.json({ error: '本人確認のためサインインしてください。' }, { status: 401, headers });
    if (error instanceof Error && error.message === 'ORIGIN')
      return Response.json({ error: 'このサイトから操作してください。' }, { status: 403, headers });
    const code = error instanceof SkyOwnerExportError ? error.code : 'UNAVAILABLE';
    const status = { NOT_FOUND: 404, REVISION_CONFLICT: 409, INVALID_INPUT: 400,
      TOO_LARGE: 413, INVALID_ARTIFACT: 503, UNAVAILABLE: 503 }[code];
    const message = { NOT_FOUND: '仕事が見つかりません。', REVISION_CONFLICT: '生成中に仕事や成果が更新されました。一覧を更新して再試行してください。',
      INVALID_INPUT: '仕事と版を選び直してください。', TOO_LARGE: '今回の持出し容量・件数の上限を超えています。省略したfileは作成していません。',
      INVALID_ARTIFACT: '保存成果の完全性を確認できません。成果を取得済みとして扱わず、再試行してください。',
      UNAVAILABLE: '持出しデータを作成できませんでした。接続と保存状態を確認して再試行してください。' }[code];
    return Response.json({ error: message, code }, { status, headers });
  }
}
