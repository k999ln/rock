import { database, requestUser } from '@/lib/fund-store';
import { createDiscoveryApi } from '@/lib/noah-discovery-api';
import { noahResearchCatalog } from '@/lib/noah-research-catalog';
const api = () =>
  createDiscoveryApi({ db: database(), authenticate: requestUser, publicTags:id=>noahResearchCatalog.get(id)?.entry.tags??[] });
export const GET = (request: Request) => api()(request);
export const POST = (request: Request) => api()(request);
