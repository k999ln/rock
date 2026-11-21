import { createNoahTrialApi } from '@/lib/noah-trial-api';
import { noahTrialDependencies } from '@/lib/noah-trial-server';
export const GET = (request: Request) => createNoahTrialApi(noahTrialDependencies())(request);
export const POST = (request: Request) => createNoahTrialApi(noahTrialDependencies())(request);
