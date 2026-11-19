import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import { serviceSetupStore } from '@/lib/rockstar-service-setup-store';
import {
  ServiceSetupError,
  serviceSetupReadiness,
  serviceSetupView,
} from '@/lib/rockstar-service-setup';
import { LinuxServiceError, linuxRequestText } from '@/lib/sky-linux-service';
const json = (v: unknown, status = 200) =>
  Response.json(v, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  });
function failure(e: unknown) {
  if (e instanceof Error && e.message === 'UNAUTHORIZED')
    return json({ error: 'サインインしてください。' }, 401);
  if (e instanceof Error && e.message === 'ORIGIN')
    return json({ error: '操作元を確認してください。' }, 403);
  if (e instanceof ServiceSetupError || e instanceof LinuxServiceError)
    return json({ error: e.message }, e.status);
  if (e instanceof SyntaxError)
    return json({ error: '操作の形式を確認してください。' }, 400);
  return json(
    {
      error: '利用開始の結果を確認できません。同じ手続きを読み直してください。',
    },
    503,
  );
}
export async function GET(request: Request) {
  try {
    const readiness = serviceSetupReadiness(
      env as unknown as Record<string, string>,
    );
    // Public module availability contains no identity, contract or payment information.
    if (!readiness.osReady)
      return json({
        readiness,
        setup: null,
        eligibleOrders: [],
        access: serviceSetupView(null, {
          readiness,
          currentGrant: false,
          workspaceMatches: false,
          linuxCanExecute: false,
          linuxReason: null,
        }),
      });
    return json(
      await serviceSetupStore(
        database(),
        env as unknown as Record<string, string>,
      ).view(await requestUser(request)),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const owner = await requestUser(request),
      input = JSON.parse(await linuxRequestText(request, 12000));
    const store = serviceSetupStore(
      database(),
      env as unknown as Record<string, string>,
    );
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new SyntaxError();
    if (input.action === 'draft')
      return json({ setup: await store.draft(owner, input.orderId) }, 201);
    if (!Number.isSafeInteger(input.revision) || input.revision < 0)
      throw new SyntaxError();
    if (input.action === 'accept')
      return json({ setup: await store.accept(owner, input.revision, input) });
    if (input.action === 'start-billing')
      return json(await store.startBilling(owner, input.revision));
    if (input.action === 'reconcile-billing')
      return json({
        setup: await store.reconcileBilling(owner, input.revision),
      });
    if (input.action === 'prepare-environment')
      return json({ setup: await store.provision(owner, input.revision) });
    return json({ error: '対応する操作を選んでください。' }, 400);
  } catch (e) {
    return failure(e);
  }
}
