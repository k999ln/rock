import { handle, body } from '@/lib/operations-api';
export const GET = (r: Request) => handle(r, (s) => s.listJobs());
export const POST = (r: Request) =>
  handle(r, async (s) => s.createJob(await body(r)));
