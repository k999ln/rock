import { noahInviteApi } from '@/lib/noah-invites-server';
export const GET = async (request: Request, context: { params: Promise<{ id: string }> }) =>
  noahInviteApi().cover(request, (await context.params).id);
