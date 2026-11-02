import { requestUser } from '@/lib/request-auth';

export const dynamic = 'force-dynamic';

/** Use the existing authenticated gateway; never trust browser account flags. */
export async function GET(request: Request) {
  const headers = {
    'Cache-Control': 'private, no-store',
    Vary: 'Cookie, Authorization',
  };
  try {
    await requestUser(request);
    return Response.json({ signedIn: true }, { headers });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED')
      return Response.json({ signedIn: false }, { status: 401, headers });
    return Response.json(
      { error: 'アカウントを確認できません。' },
      { status: 503, headers },
    );
  }
}
