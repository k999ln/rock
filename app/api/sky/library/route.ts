import { body, handle } from '@/lib/operations-api';
export const GET = (request: Request) =>
  handle(request, (store) => store.listSkyLibrary());
export const PUT = (request: Request) =>
  handle(request, async (store) => store.saveSkyLibrary(await body(request)));
