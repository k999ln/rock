import { noahInviteApi } from '@/lib/noah-invites-server';
export const GET = (request: Request) => noahInviteApi().list(request);
export const POST = (request: Request) => noahInviteApi().create(request);
