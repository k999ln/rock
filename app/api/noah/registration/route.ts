import { noahRegistrationApi } from '@/lib/noah-registration-server';
export const GET = (request: Request) => noahRegistrationApi()(request);
export const POST = (request: Request) => noahRegistrationApi()(request);
