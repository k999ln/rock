import { body, handle } from '@/lib/operations-api';

export const GET = (request: Request) =>
  handle(request, (store) => store.listSkyProviderConnections());

export const PUT = (request: Request) =>
  handle(request, async (store) =>
    store.saveSkyProviderConnection(await body(request)),
  );
