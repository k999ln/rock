import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import { handleSkyCommerce } from '@/lib/sky-commerce';

async function handle(request: Request, context: { params: Promise<{ action: string }> }) {
  try {
    const { action } = await context.params;
    return await handleSkyCommerce(request, action, database(), env as unknown as Record<string, unknown>);
  } catch {
    return Response.json({ error: '決済用データを読み込めませんでした。' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
export const GET = handle;
export const POST = handle;
