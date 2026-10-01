import { body, handle } from '@/lib/operations-api';

export const GET = (request: Request) =>
  handle(request, (store) => store.wallet());

export const POST = (request: Request) =>
  handle(request, async (store) => {
    await store.book(await body(request));
    return store.wallet();
  });
