import { database, requestUser } from '@/lib/fund-store';
import { createDiscoveryApi } from '@/lib/noah-discovery-api';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return createDiscoveryApi({ db: database(), authenticate: requestUser })(
    request,
    (await params).id,
  );
}
