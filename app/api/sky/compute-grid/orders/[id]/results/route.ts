import { computeGridRouteApi } from '@/lib/sky-compute-grid-route';

type Context = { params: Promise<{ id: string }> };

export const GET = async (request: Request, context: Context) =>
  computeGridRouteApi().results(request, (await context.params).id);

// Delete the stored inputs and outputs of a closed order now.
export const DELETE = async (request: Request, context: Context) =>
  computeGridRouteApi().purgeOrder(request, (await context.params).id);
