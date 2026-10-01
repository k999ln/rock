import { handle, body } from '@/lib/operations-api';
export const POST = (r: Request) =>
  handle(r, async (s) => s.device(await body(r)));
