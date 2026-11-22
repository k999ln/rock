import { noahInviteApi } from '@/lib/noah-invites-server';
export const POST = async (request: Request, ctx: { params: Promise<{id:string}> }) => noahInviteApi().claim(request,(await ctx.params).id);
