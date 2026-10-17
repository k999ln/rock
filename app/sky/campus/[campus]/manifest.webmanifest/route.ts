import osManifest from '@/app/manifest';
import { findCampus } from '@/lib/campus-sky';
import { campusSkyAppManifest } from '@/lib/sky-app-manifest';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ campus: string }> },
) {
  const campus = findCampus((await params).campus);
  if (!campus) return new Response('Not found', { status: 404 });
  return Response.json(campusSkyAppManifest(osManifest(), campus.id), {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
