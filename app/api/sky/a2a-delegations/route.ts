import {
  a2aDelegationStore,
  A2ADelegationStoreError,
} from '@/lib/a2a-delegation-store';
import { createA2AIntentDigests } from '@/lib/a2a-authorization';
import { database, requestUser } from '@/lib/fund-store';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function body(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('INVALID_BODY');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 12_000) {
      await reader.cancel();
      throw new Error('BODY_TOO_LARGE');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('INVALID_BODY');
  return value as Record<string, unknown>;
}

function errorResponse(error: unknown) {
  if (error instanceof A2ADelegationStoreError) {
    const status =
      error.code.includes('conflict') ||
      error.code.includes('mismatch') ||
      error.code.includes('budget_exceeded') ||
      error.code.includes('reservation_failed')
        ? 409
        : 400;
    return json({ error: error.message, code: error.code }, status);
  }
  if (error instanceof Error && error.message === 'UNAUTHORIZED')
    return json({ error: 'サインインが必要です。' }, 401);
  if (error instanceof Error && error.message === 'ORIGIN')
    return json({ error: 'このサイトから操作してください。' }, 403);
  if (error instanceof Error && error.message === 'BODY_TOO_LARGE')
    return json({ error: '依頼は8 KB以下にしてください。' }, 413);
  if (
    error instanceof SyntaxError ||
    (error instanceof Error &&
      (error.message.startsWith('INVALID_') ||
        error.message === 'INVALID_TARGET'))
  )
    return json({ error: '入力形式を確認してください。' }, 400);
  return json({ error: 'エージェント委任を保存できませんでした。' }, 503);
}

export async function GET(request: Request) {
  try {
    const owner = await requestUser(request);
    const parentJobId =
      new URL(request.url).searchParams.get('parentJobId') ?? '';
    if (!uuid.test(parentJobId))
      return json({ error: '親job IDが不正です。' }, 400);
    const store = a2aDelegationStore(database());
    return json({
      delegations: await store.listForParent(owner, parentJobId),
      budget: await store.getBudget(owner, parentJobId),
      reservations: await store.listBudgetReservations(owner, parentJobId),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const owner = await requestUser(request);
    const input = await body(request);
    const allowed = new Set([
      'id',
      'parentJobId',
      'idempotencyKey',
      'messageId',
      'targetOrigin',
      'targetAgentName',
      'targetAgentVersion',
      'message',
      'budgetCurrency',
      'budgetLimitMinor',
      'parentBudgetLimitMinor',
      'deadlineAt',
    ]);
    if (Object.keys(input).some((key) => !allowed.has(key)))
      throw new Error('INVALID_FIELDS');
    const {
      id,
      parentJobId,
      idempotencyKey,
      messageId,
      targetOrigin,
      targetAgentName,
      targetAgentVersion,
      message,
      budgetCurrency,
      budgetLimitMinor,
      parentBudgetLimitMinor,
      deadlineAt,
    } = input;
    if (
      typeof id !== 'string' ||
      !uuid.test(id) ||
      typeof parentJobId !== 'string' ||
      !uuid.test(parentJobId) ||
      typeof messageId !== 'string' ||
      !uuid.test(messageId) ||
      typeof idempotencyKey !== 'string' ||
      !/^[A-Za-z0-9._:-]{1,128}$/.test(idempotencyKey) ||
      typeof message !== 'string' ||
      !message.trim() ||
      message.length > 8_000 ||
      typeof targetOrigin !== 'string' ||
      typeof targetAgentName !== 'string' ||
      typeof targetAgentVersion !== 'string' ||
      typeof budgetCurrency !== 'string' ||
      typeof budgetLimitMinor !== 'number' ||
      typeof parentBudgetLimitMinor !== 'number' ||
      typeof deadlineAt !== 'number'
    )
      throw new Error('INVALID_FIELDS');
    let origin: URL;
    try {
      origin = new URL(targetOrigin);
    } catch {
      throw new Error('INVALID_TARGET');
    }
    if (
      origin.protocol !== 'https:' ||
      origin.origin !== targetOrigin ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash
    )
      throw new Error('INVALID_TARGET');

    const intent = {
      id,
      parentJobId,
      idempotencyKey,
      messageId,
      targetOrigin,
      targetAgentName,
      targetAgentVersion,
      protocolVersion: '1.0' as const,
      budgetCurrency,
      budgetLimitMinor,
      parentBudgetLimitMinor,
      deadlineAt,
    };
    const digests = await createA2AIntentDigests({
      ...intent,
      ownerUserId: owner,
      message,
    });
    const store = a2aDelegationStore(database());
    const result = await store.prepare(owner, {
      ...intent,
      ...digests,
    });
    if (!result.delegation)
      return json(
        { error: '親jobが見つからないか、委任期限を過ぎています。' },
        404,
      );
    const pool = await store.getBudget(owner, parentJobId);
    if (pool && (pool.currency !== budgetCurrency ||
      pool.budgetLimitMinor !== parentBudgetLimitMinor))
      return json({ error: 'この親jobには別の共通予算が固定されています。', code: 'PARENT_BUDGET_MISMATCH' }, 409);
    return json(
      {
        delegation: result.delegation,
        created: result.created,
        approval: {
          required: result.delegation.state === 'awaiting_approval',
          digest: result.delegation.authorizationSha256,
          note: 'このAPIは依頼条件を保存するだけで、外部agentへ送信しません。',
        },
      },
      result.created ? 201 : 200,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
