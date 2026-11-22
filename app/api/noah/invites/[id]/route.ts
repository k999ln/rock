import { noahInviteApi } from '@/lib/noah-invites-server';
type Context = { params: Promise<{id:string}> };
export const GET = async (request: Request, ctx: Context) => noahInviteApi().get(request,(await ctx.params).id);
export const DELETE = async (request: Request, ctx: Context) => noahInviteApi().revoke(request,(await ctx.params).id);
