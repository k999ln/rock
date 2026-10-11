import { computeGridRouteApi } from '@/lib/sky-compute-grid-route';

export const GET = (request: Request) => computeGridRouteApi().listOrders(request);
export const POST = (request: Request) => computeGridRouteApi().createOrder(request);
