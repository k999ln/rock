import { body, handle } from '@/lib/operations-api';

export const GET = (request: Request) =>
  handle(request, (store) => store.listSkyConnections());

export const PUT = (request: Request) =>
  handle(request, async (store) => store.connectSky(await body(request)));
