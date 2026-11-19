import { noahReleaseApi } from '@/lib/noah-release-server';
export async function GET(request: Request) { return noahReleaseApi().describe(request); }
