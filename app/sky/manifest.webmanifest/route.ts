import osManifest from '@/app/manifest';
import { skyAppManifest } from '@/lib/sky-app-manifest';

export function GET() {
  return Response.json(
    skyAppManifest(osManifest()),
    {
      headers: {
        'Content-Type': 'application/manifest+json',
        'Cache-Control': 'public, max-age=300',
      },
    },
  );
}
