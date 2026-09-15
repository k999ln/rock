import { env } from 'cloudflare:workers';
import { body, json } from './operations-api';
import { database } from './fund-store';
import { OperationError } from './operations';
import { operatorControl } from './operator-control';
import { requestUser } from './request-auth';

function configuredOperatorUserId() {
  const value = (
    env as unknown as { ROCK_OPERATOR_USER_ID?: string }
  ).ROCK_OPERATOR_USER_ID?.trim();
  if (!value || value.length > 256)
    throw new OperationError('運営管理者の設定が完了していません。', 503);
  return value;
}

export async function operatorHandle(
  request: Request,
  action: (control: ReturnType<typeof operatorControl>) => Promise<unknown>,
) {
  try {
    const user = await requestUser(request);
    const control = operatorControl(
      database(),
      user,
      configuredOperatorUserId(),
    );
    return json(await action(control));
  } catch (error) {
    if (error instanceof OperationError)
      return json({ error: error.message }, error.status);
    if (error instanceof Error && error.message === 'UNAUTHORIZED')
      return json({ error: 'サインインしてください。' }, 401);
    if (error instanceof Error && error.message === 'ORIGIN')
      return json({ error: 'このアプリから操作してください。' }, 403);
    return json(
      { error: '運営管理を読み込めませんでした。時間を置いて再試行してください。' },
      503,
    );
  }
}

export { body as operatorBody };
