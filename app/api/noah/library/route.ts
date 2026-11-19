import { noahReleaseDependencies } from '@/lib/noah-release-server';
import { createNoahLibraryApi } from '@/lib/noah-library';
export async function GET(request: Request) { return createNoahLibraryApi(noahReleaseDependencies())(request); }
