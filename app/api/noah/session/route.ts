import { noahSessionApi } from '@/lib/noah-session-server';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => noahSessionApi()(request);
