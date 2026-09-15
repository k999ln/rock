import {
  operatorBody,
  operatorHandle,
} from '@/lib/operator-api';

export const GET = (request: Request) =>
  operatorHandle(request, (control) => control.overview());

export const POST = (request: Request) =>
  operatorHandle(request, async (control) => {
    const input = await operatorBody(request);
    if (
      input &&
      typeof input === 'object' &&
      !Array.isArray(input) &&
      (input as { operation?: unknown }).operation === 'cancel'
    )
      return control.cancel(input);
    return control.issue(input);
  });
