import { boundedNoahBody } from './noah-agent-api.ts';
import { NoahAgentError, noahUploadId } from './noah-agent-upload.ts';
import { OWNER_SCOPE_HEADER, ownerScopeFor } from './owner-intent.ts';
import {
  SHARED_COMPUTE_CONSENT,
  createSharedComputeStore,
} from './noah-shared-compute-store.ts';
import {
  isSharedSampleId,
  SHARED_WORKLOAD_SHA256,
  SHARED_WORKLOAD_VERSION,
} from './noah-shared-workload.ts';
import type { BillingScope } from './noah-shared-compute-plan.ts';

const respond = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      Vary: 'Cookie, Authorization',
      'X-Content-Type-Options': 'nosniff',
    },
  });
const inputError = () => new NoahAgentError('依頼の形式を確認してください。');
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw inputError();
  return value as Record<string, unknown>;
}
function keys(input: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throw inputError();
}
function consent(input: Record<string, unknown>) {
  if (
    input.consentVersion !== SHARED_COMPUTE_CONSENT ||
    input.acceptThirdParty !== true
  ) {
    throw new NoahAgentError(
      '第三者の参加端末での処理に明示的な同意が必要です。',
      403,
    );
  }
}

export function createSharedComputeApi(deps: {
  db: Pick<D1Database, 'prepare' | 'batch'>;
  authenticate: (request: Request) => Promise<string>;
  authorize: (
    owner: string,
    target: string,
    action: string,
    digest: string,
    confirmed: boolean,
  ) => Promise<number>;
  scope: BillingScope | null;
  now?: () => number;
}) {
  const store = createSharedComputeStore(deps.db, deps.scope);
  async function account(request: Request, write = false) {
    const user = await deps.authenticate(request);
    if (!user || user.startsWith('noah-browser:')) throw Error('UNAUTHORIZED');
    const owner = await ownerScopeFor(user);
    if (write && request.headers.get(OWNER_SCOPE_HEADER) !== owner)
      throw new NoahAgentError(
        'アカウントを確認し、画面を開き直してください。',
        409,
      );
    return { user, owner };
  }
  return async (request: Request) => {
    try {
      const clock = deps.now ?? Date.now;
      if (request.method === 'GET') {
        const { owner } = await account(request);
        return respond({
          ownerScope: owner,
          consentVersion: SHARED_COMPUTE_CONSENT,
          acceptingDevices: !!deps.scope,
          ...(await store.status(owner, clock())),
        });
      }
      if (request.method !== 'POST')
        return respond({ error: 'この操作は利用できません。' }, 405);
      const origin = request.headers.get('origin');
      if (
        (origin !== null && origin !== new URL(request.url).origin) ||
        request.headers.get('sec-fetch-site') === 'cross-site'
      )
        throw Error('ORIGIN');
      if (
        request.headers.get('content-type')?.split(';')[0].trim() !==
        'application/json'
      )
        return respond({ error: 'JSONで送信してください。' }, 415);
      const input = record(
        JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(
            await boundedNoahBody(request, 2048),
          ),
        ),
      );
      const action = input.action;
      const runnerKeys = ['action', 'deviceId', 'deviceToken'];
      if (
        action === 'claim' ||
        action === 'heartbeat' ||
        action === 'release' ||
        action === 'complete'
      ) {
        const device = await store.authenticateDevice(
          noahUploadId(input.deviceId),
          noahUploadId(input.deviceToken),
        );
        const now = clock();
        if (action === 'claim') {
          keys(input, runnerKeys);
          return respond(await store.claim(device, now));
        }
        keys(input, [
          ...runnerKeys,
          'jobId',
          'leaseId',
          ...(action === 'complete' ? ['result', 'elapsedMs'] : []),
        ]);
        const job = noahUploadId(input.jobId),
          lease = noahUploadId(input.leaseId);
        if (action === 'heartbeat')
          return respond(await store.heartbeat(device, job, lease, now));
        if (action === 'release')
          return respond(await store.release(device, job, lease, now));
        const result = record(input.result);
        keys(result, ['label', 'score']);
        if (
          !Number.isInteger(input.elapsedMs) ||
          typeof input.elapsedMs !== 'number' ||
          input.elapsedMs < 0 ||
          input.elapsedMs > 750
        )
          throw inputError();
        return respond(
          await store.complete(
            device,
            job,
            lease,
            result,
            input.elapsedMs,
            now,
          ),
        );
      }
      if (origin === null) throw Error('ORIGIN');
      const { owner, user } = await account(request, true);
      switch (action) {
        case 'enroll':
          keys(input, [
            'action',
            'deviceId',
            'consentVersion',
            'acceptThirdParty',
          ]);
          consent(input);
          const hostRevision = await deps.authorize(
            user,
            SHARED_WORKLOAD_VERSION,
            'connect',
            SHARED_WORKLOAD_SHA256,
            true,
          );
          return respond(
            await store.enroll(
              owner,
              noahUploadId(input.deviceId),
              hostRevision,
              clock(),
            ),
          );
        case 'revoke':
          keys(input, ['action', 'deviceId']);
          return respond(
            await store.revoke(owner, noahUploadId(input.deviceId), clock()),
          );
        case 'submit':
          keys(input, [
            'action',
            'requestId',
            'sampleId',
            'consentVersion',
            'acceptThirdParty',
          ]);
          consent(input);
          if (!isSharedSampleId(input.sampleId)) throw inputError();
          const requestRevision = await deps.authorize(
            user,
            SHARED_WORKLOAD_VERSION,
            'run',
            SHARED_WORKLOAD_SHA256,
            true,
          );
          return respond(
            await store.submit(
              owner,
              noahUploadId(input.requestId),
              input.sampleId,
              requestRevision,
              clock(),
            ),
          );
        case 'cancel':
          keys(input, ['action', 'jobId']);
          return respond(
            await store.cancel(owner, noahUploadId(input.jobId), clock()),
          );
        default:
          throw inputError();
      }
    } catch (e) {
      if (e instanceof NoahAgentError)
        return respond({ error: e.message }, e.status);
      if (e instanceof SyntaxError || e instanceof TypeError)
        return respond({ error: '入力形式を確認してください。' }, 400);
      if (e instanceof Error && e.message === 'UNAUTHORIZED')
        return respond({ error: 'サインインしてください。' }, 401);
      if (e instanceof Error && e.message === 'ORIGIN')
        return respond({ error: 'Noahの画面から操作してください。' }, 403);
      return respond({ error: '計算の受付状況を確認できませんでした。' }, 503);
    }
  };
}
