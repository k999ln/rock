import { noahInviteApi } from '@/lib/noah-invites-server';
export const GET = async (request: Request, ctx: { params: Promise<{id:string}> }) => noahInviteApi().download(request,(await ctx.params).id);
