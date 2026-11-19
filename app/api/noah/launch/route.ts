import { createNoahLaunchApi } from '@/lib/noah-launch';
import { noahReleaseDependencies } from '@/lib/noah-release-server';
export const GET=(r:Request)=>createNoahLaunchApi(noahReleaseDependencies())(r);
export const POST=GET;
