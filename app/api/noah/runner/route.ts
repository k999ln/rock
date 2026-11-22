import { createNoahLaunchApi } from '@/lib/noah-launch';
import { noahReleaseDependencies } from '@/lib/noah-release-server';
export const POST=(r:Request)=>createNoahLaunchApi(noahReleaseDependencies())(r,true);
