import { noahProfileApi } from '@/lib/noah-profile-server';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return noahProfileApi().document(request,(await params).id);}
