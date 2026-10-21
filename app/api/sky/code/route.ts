import { database } from '@/lib/fund-store';
import { handleSkyCode } from '@/lib/sky-code-api';
async function handle(request: Request) {
  try {
    return await handleSkyCode(request, database());
  } catch {
    return Response.json(
      { error: 'コードの保存先はまだ利用できません。' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
