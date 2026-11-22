import { noahRegistrationRuntime } from '@/lib/noah-registration-runtime-server';
export const GET=(request:Request)=>noahRegistrationRuntime().browserControl(request);
export const POST=(request:Request)=>noahRegistrationRuntime().browserControl(request);
