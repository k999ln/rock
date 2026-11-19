import { noahOutboxApi } from '@/lib/noah-outbox-server';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return noahOutboxApi()(request,(await params).id);}
export const POST=GET;
