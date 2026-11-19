import { findCampus } from '../../lib/campus-sky.ts';
import policy from '../../data/web-security-policy.json' with { type: 'json' };

/** Keep the legacy hub entry and its campus shortcut, including security headers. */
export function GET(request: Request) {
  const campus = findCampus(new URL(request.url).searchParams.get('campus') ?? '');
  return new Response(null, {
    status: 307,
    headers: {
      ...policy.universalHeaders,
      Location: campus ? `/sky/campus/${campus.id}/hub` : '/',
      'Cache-Control': 'no-store',
    },
  });
}
