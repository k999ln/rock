import { database, requestUser } from '@/lib/fund-store';
import { createNoahRecommendationsApi } from '@/lib/noah-recommendations';
const api = () => createNoahRecommendationsApi({ db: database(), authenticate: requestUser });
export const GET = (request: Request) => api().get(request);
export const PUT = (request: Request) => api().put(request);
