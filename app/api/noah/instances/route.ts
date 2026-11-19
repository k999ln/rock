import { noahReleaseDependencies } from '@/lib/noah-release-server';
import { createNoahInstancesApi } from '@/lib/noah-instances';
export const GET = (request: Request) => createNoahInstancesApi(noahReleaseDependencies())(request);
export const POST = GET;
