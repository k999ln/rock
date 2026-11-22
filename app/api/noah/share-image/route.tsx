import { ImageResponse } from 'next/og';
import { publicNoahShareAgent } from '@/lib/noah-agent-share-server';
import { NoahAgentShareCard } from '@/lib/noah-agent-share-card';
import { NOAH_PUBLIC_ORIGIN } from '@/lib/noah-public-origin';

let font: Promise<ArrayBuffer> | undefined;
function shareFont() {
  font ??= fetch(`${NOAH_PUBLIC_ORIGIN}/fonts/noah-noto-sans-jp-regular.ttf`).then(async response => {
    if (!response.ok) throw new Error('Share font unavailable');
    return response.arrayBuffer();
  }).catch(error => { font = undefined; throw error; });
  return font;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const agent = await publicNoahShareAgent(params.getAll('id').length === 1 ? params.get('id') : null);
  if (!agent) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  try {
    const image = new ImageResponse(<NoahAgentShareCard agent={agent} />, {
      width: 1200, height: 630,
      fonts: [{ name: 'Noah JP', data: await shareFont(), weight: 400, style: 'normal' }],
    });
    return new Response(await image.arrayBuffer(), { headers: {
      'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch {
    return new Response('Image temporarily unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
export const HEAD = GET;
