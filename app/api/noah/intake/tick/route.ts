import { createIntakeTick } from '@/lib/noah-intake-api';
import { noahIntakeDependencies } from '@/lib/noah-intake-server';
export const POST = (request: Request) => createIntakeTick(noahIntakeDependencies())(request);
