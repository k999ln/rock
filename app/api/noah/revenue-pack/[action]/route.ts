import { revenuePackProxy } from '@/lib/noah-revenue-pack-proxy';
type Context={params:Promise<{action:string}>};
export async function GET(request:Request,ctx:Context){return revenuePackProxy(request,(await ctx.params).action);}
export async function POST(request:Request,ctx:Context){return revenuePackProxy(request,(await ctx.params).action);}
