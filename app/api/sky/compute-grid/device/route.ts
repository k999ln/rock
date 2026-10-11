import { computeGridRouteApi } from '@/lib/sky-compute-grid-route';

// Signed requests of an enrolled device: offer, withdraw, claim, release, receipt.
export const POST = (request: Request) => computeGridRouteApi().device(request);
