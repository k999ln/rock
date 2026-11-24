import { noahIntakeDependencies } from '@/lib/noah-intake-server';
import { createNoahWorkRevenueApi } from '@/lib/noah-work-revenue-api';
export const POST = (request: Request) =>
  createNoahWorkRevenueApi(noahIntakeDependencies()).receipt(request);
