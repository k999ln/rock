import {
  EverythingMarketError,
  validateMarketProposal,
  validateNewMarketAsset,
} from '@/lib/everything-market';
import { everythingMarketStore } from '@/lib/everything-market-store';
import { database } from '@/lib/fund-store';
import { body, json } from '@/lib/operations-api';
import { OperationError } from '@/lib/operations';
import { requestUser } from '@/lib/request-auth';

function object(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new EverythingMarketError(
      'invalid_input',
      '入力を確認してください。',
    );
  return value as Record<string, unknown>;
}

async function handle(
  request: Request,
  action: (
    store: ReturnType<typeof everythingMarketStore>,
  ) => Promise<unknown>,
) {
  try {
    const user = await requestUser(request);
    return json(await action(everythingMarketStore(database(), user)));
  } catch (error) {
    if (error instanceof EverythingMarketError)
      return json({ error: error.message, code: error.code }, error.status);
    if (error instanceof OperationError)
      return json({ error: error.message }, error.status);
    if (error instanceof Error && error.message === 'UNAUTHORIZED')
      return json({ error: 'サインインしてください。' }, 401);
    if (error instanceof Error && error.message === 'ORIGIN')
      return json({ error: 'このアプリから操作してください。' }, 403);
    return json(
      { error: '市場の状態を保存できませんでした。再試行してください。' },
      503,
    );
  }
}

export const GET = (request: Request) =>
  handle(request, (store) => store.snapshot());

export const POST = (request: Request) =>
  handle(request, async (store) => {
    const input = object(await body(request));
    if (input.action === 'create_asset') {
      const { action: _, ...asset } = input;
      return store.createAsset(validateNewMarketAsset(asset));
    }
    if (input.action === 'propose') {
      const { action: _, idempotencyKey, ...proposal } = input;
      if (typeof idempotencyKey !== 'string')
        throw new EverythingMarketError(
          'invalid_idempotency_key',
          '操作IDを確認してください。',
        );
      return {
        proposal: await store.propose(
          validateMarketProposal(proposal),
          idempotencyKey,
        ),
      };
    }
    if (input.action === 'approve') {
      const allowed = new Set(['action', 'proposalId', 'digest']);
      if (Object.keys(input).some((key) => !allowed.has(key)))
        throw new EverythingMarketError(
          'unsupported_input',
          '未対応の入力があります。',
        );
      return { proposal: await store.approve(input.proposalId, input.digest) };
    }
    if (input.action === 'execute') {
      const allowed = new Set([
        'action',
        'proposalId',
        'idempotencyKey',
      ]);
      if (Object.keys(input).some((key) => !allowed.has(key)))
        throw new EverythingMarketError(
          'unsupported_input',
          '未対応の入力があります。',
        );
      return {
        proposal: await store.execute(
          input.proposalId,
          input.idempotencyKey,
        ),
      };
    }
    throw new EverythingMarketError(
      'invalid_action',
      '操作を確認してください。',
    );
  });
