import { computeGridRouteApi } from '@/lib/sky-compute-grid-route';

export const GET = (request: Request) => computeGridRouteApi().status(request);
