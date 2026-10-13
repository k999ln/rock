import osManifest from '@/app/manifest';
import { CAMPUSES, CAMPUS_IDS, type CampusId } from '@/lib/campus';

export async function GET(_request: Request, {params}: {params: Promise<{campusId: string}>}) {
  const {campusId} = await params;
  if (!CAMPUS_IDS.includes(campusId as CampusId)) return new Response('Not found', {status: 404});
  const campus = CAMPUSES[campusId as CampusId];
  return Response.json({
    ...osManifest(),
    id: `/os/sky/campus/${campusId}`,
    name: `${campus.shortName} Sky`,
    short_name: `${campus.shortName} Sky`,
    start_url: `/os/sky/campus/${campusId}/hub`,
    scope: '/os/sky/',
    description: campus.description,
  }, {headers: {'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=300'}});
}
