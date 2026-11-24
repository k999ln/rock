import { noahWebManifest } from '@/app/web-app-manifests';

export function GET() {
  return Response.json(noahWebManifest(), {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'no-cache, must-revalidate',
    },
  });
}
