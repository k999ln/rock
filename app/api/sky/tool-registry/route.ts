import { database } from '@/lib/fund-store';
import { skyToolPackageStore } from '@/lib/sky-tool-package-store';

export async function GET() {
  try {
    return Response.json(
      { packages: await skyToolPackageStore(database()).listRegistry() },
      { headers: { 'Cache-Control': 'public, max-age=60' } },
    );
  } catch {
    return Response.json(
      { error: '公開Registryを読み込めませんでした。' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
