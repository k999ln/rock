import { env } from 'cloudflare:workers';
import { requestUser } from '@/lib/request-auth';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const source = 'https://avocado-princeton-progress.noellesugar1.chatgpt.site/api/sky-sync';

export async function GET(request: Request) {
  try {
    await requestUser(request);
  } catch {
    return Response.json({ error: 'Skyへのサインインが必要です。' }, { status: 401, headers: noStore });
  }

  const bindings = env as unknown as {
    SKY_AVOCADO_OWNER_EMAIL?: string;
    SKY_AVOCADO_SITE_BYPASS?: string;
    SKY_AVOCADO_SYNC_SECRET?: string;
  };
  const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  if (!bindings.SKY_AVOCADO_OWNER_EMAIL || email !== bindings.SKY_AVOCADO_OWNER_EMAIL.trim().toLowerCase()) {
    return Response.json({ error: 'この接続は所有者専用です。' }, { status: 403, headers: noStore });
  }
  if (!bindings.SKY_AVOCADO_SITE_BYPASS || !bindings.SKY_AVOCADO_SYNC_SECRET) {
    return Response.json({ error: 'Skyとの接続設定が未完了です。' }, { status: 503, headers: noStore });
  }

  try {
    const upstream = await fetch(source, {
      method: 'GET',
      headers: {
        'OAI-Sites-Authorization': `Bearer ${bindings.SKY_AVOCADO_SITE_BYPASS}`,
        'x-avocado-sky-sync': bindings.SKY_AVOCADO_SYNC_SECRET,
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
    if (upstream.status === 409) {
      return Response.json({ error: '個人プランに複数の保存先があります。自動同期先を確認してください。' }, { status: 409, headers: noStore });
    }
    if (!upstream.ok) throw new Error('upstream');
    const data = await upstream.json();
    return Response.json(data, { headers: noStore });
  } catch {
    return Response.json({ error: '個人プランを取得できません。少し待って再試行してください。' }, { status: 502, headers: noStore });
  }
}
