import { database, requestUser } from '@/lib/fund-store';
import { createNoahFeedApi } from '@/lib/noah-feed';
import { noahResearchCatalog } from '@/lib/noah-research-catalog';
const api = () => createNoahFeedApi({ db: database(), authenticate: requestUser,publicTags:id=>noahResearchCatalog.get(id)?.entry.tags??[] });
export const GET = (request: Request) => api().get(request);
export const PUT = (request: Request) => api().set(request);
