import { handle, body } from '@/lib/operations-api';
export const PUT = (r: Request) =>
  handle(r, async (s) => s.control(await body(r)));
