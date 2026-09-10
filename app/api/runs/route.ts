import { requestUser, apiError } from '@/lib/fund-store';
// The old post-hoc endpoint cannot bypass the new execution lifecycle.
export async function POST(request: Request) {
  try {
    requestUser(request);
    return Response.json(
      { error: 'アプリを更新してから実行してください。' },
      { status: 410, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return apiError(e);
  }
}
