import { body, handle } from '@/lib/operations-api';

export const GET = (request: Request) =>
  handle(request, (store) => store.skyFeedHistory());

export const PUT = (request: Request) =>
  handle(request, async (store) =>
    store.setSkyFeedPersonalization(await body(request)),
  );

export const POST = (request: Request) =>
  handle(request, async (store) =>
    store.recordSkyFeedEvents(await body(request)),
  );

export const DELETE = (request: Request) =>
  handle(request, (store) => store.clearSkyFeedHistory());
