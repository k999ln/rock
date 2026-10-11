import { computeGridRouteApi } from '@/lib/sky-compute-grid-route';

type Context = { params: Promise<{ id: string }> };

export const GET = async (request: Request, context: Context) =>
  computeGridRouteApi().getOrder(request, (await context.params).id);

// Cancel: recall outstanding work and release the credits the order still holds.
export const DELETE = async (request: Request, context: Context) =>
  computeGridRouteApi().cancelOrder(request, (await context.params).id);
