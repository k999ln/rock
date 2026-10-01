import { handle } from '@/lib/operations-api';
export const GET = (r: Request) => handle(r, (s) => s.overview());
