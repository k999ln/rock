import { createIntakeApi } from '@/lib/noah-intake-api';
import { noahIntakeDependencies } from '@/lib/noah-intake-server';
export const GET = (request: Request) => createIntakeApi(noahIntakeDependencies())(request);
export const POST = (request: Request) => createIntakeApi(noahIntakeDependencies())(request);
