import { eveManifest } from '@/app/web-app-manifests';

export function GET() {
  return Response.json(eveManifest(), {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
