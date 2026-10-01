import { handle, body } from '@/lib/operations-api';
export const POST = (r: Request) =>
  handle(r, async (s) => s.book(await body(r)));
