import { xTimelineWidgetDocument, xWidgetChannel } from '@/lib/sky-x-embed';
/** Only a validated public source; this endpoint never includes account data. */
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const document = xTimelineWidgetDocument(query.get('source') ?? '', xWidgetChannel(query.get('channel')), crypto.randomUUID());
    return new Response(document.html, { headers: {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Security-Policy': `${document.csp}; frame-ancestors 'self'; sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox`,
      'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
    } });
  } catch { return new Response('公開アカウント・リストを確認してください。', { status: 400, headers: { 'Cache-Control':'no-store' } }); }
}
