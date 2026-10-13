import osManifest from '@/app/manifest';

export function GET() {
  return Response.json(osManifest(), {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
