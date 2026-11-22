import { noahProfileApi } from '@/lib/noah-profile-server';
export const POST=(request:Request)=>noahProfileApi().documents(request);
