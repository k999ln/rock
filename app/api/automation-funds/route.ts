import { catalog } from '@/lib/catalog';
import {
  DEFAULT_FUND_TOOL_COUNT,
  formAutomationFund,
  validateFundName,
  validateFundStrategy,
  validateFundToolCount,
} from '@/lib/automation-fund';
import { fundCandidatesFromCatalog } from '@/lib/automation-fund-catalog';
import {
  automationFundStore,
  AutomationFundError,
} from '@/lib/automation-fund-store';
import { database } from '@/lib/fund-store';
import { body, json } from '@/lib/operations-api';
import { OperationError } from '@/lib/operations';
import { requestUser } from '@/lib/request-auth';

function object(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AutomationFundError('入力を確認してください。');
  return value as Record<string, unknown>;
}

function idempotencyKey(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(value)
  )
    throw new AutomationFundError('操作IDを確認してください。');
  return value;
}

function fundId(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u.test(value)
  )
    throw new AutomationFundError('ファンドIDを確認してください。');
  return value;
}

async function handle(
  request: Request,
  action: (
    store: ReturnType<typeof automationFundStore>,
  ) => Promise<unknown>,
) {
  try {
    const user = await requestUser(request);
    return json(await action(automationFundStore(database(), user)));
  } catch (error) {
    if (error instanceof AutomationFundError)
      return json({ error: error.message }, error.status);
    if (error instanceof OperationError)
      return json({ error: error.message }, error.status);
    if (error instanceof Error && error.message.startsWith('AUTOMATION_FUND_'))
      return json({ error: 'ファンドの条件を確認してください。' }, 400);
    if (error instanceof Error && error.message === 'UNAUTHORIZED')
      return json({ error: 'サインインしてください。' }, 401);
    if (error instanceof Error && error.message === 'ORIGIN')
      return json({ error: 'このアプリから操作してください。' }, 403);
    return json(
      { error: 'ファンドを保存できませんでした。再試行してください。' },
      503,
    );
  }
}

export const GET = (request: Request) =>
  handle(request, (store) =>
    store.list(fundCandidatesFromCatalog(catalog)),
  );

export const POST = (request: Request) =>
  handle(request, async (store) => {
    const input = object(await body(request));
    if (input.action === 'join') {
      const allowed = new Set(['action', 'fundId']);
      if (Object.keys(input).some((key) => !allowed.has(key)))
        throw new AutomationFundError('未対応の入力があります。');
      return store.join(fundId(input.fundId));
    }
    if (input.action !== 'form')
      throw new AutomationFundError('操作を確認してください。');
    const allowed = new Set([
      'action',
      'idempotencyKey',
      'name',
      'strategy',
      'targetToolCount',
    ]);
    if (Object.keys(input).some((key) => !allowed.has(key)))
      throw new AutomationFundError('未対応の入力があります。');
    const key = idempotencyKey(input.idempotencyKey);
    const timestamp = new Date().toISOString();
    const plan = formAutomationFund({
      id: `fund:${crypto.randomUUID()}`,
      name: validateFundName(input.name),
      strategy: validateFundStrategy(input.strategy),
      targetToolCount: validateFundToolCount(
        input.targetToolCount ?? DEFAULT_FUND_TOOL_COUNT,
      ),
      candidates: fundCandidatesFromCatalog(catalog),
      now: timestamp,
    });
    return { fund: await store.create(plan, key) };
  });
