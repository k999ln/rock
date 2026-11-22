import { createNoahProviderApi } from '@/lib/noah-provider-api';
import { noahIntakeDependencies } from '@/lib/noah-intake-server';
export const GET = (request: Request) =>
  createNoahProviderApi(noahIntakeDependencies())(request);
export const POST = GET;
