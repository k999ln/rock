import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import { handleSkyPayments } from '@/lib/sky-payments';

async function handle(request: Request, context: { params: Promise<{ action: string }> }) {
  try {
    const { action } = await context.params;
    return await handleSkyPayments(request, action, database(), env as unknown as Record<string, unknown>);
  } catch {
    return Response.json({ error: '支払い記録を読み込めませんでした。' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
export const GET = handle;
export const POST = handle;
