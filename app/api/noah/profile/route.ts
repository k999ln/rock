import { noahProfileApi } from '@/lib/noah-profile-server';
export const GET=(request:Request)=>noahProfileApi().collection(request);
export const POST=(request:Request)=>noahProfileApi().collection(request);
