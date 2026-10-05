function safeOperatorId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
}

async function sha256(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function authorizeRemoteAiRateCardOperator(
  request: Request,
  configuredToken: unknown,
  configuredOperatorId: unknown,
) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) return { ok: false as const, status: 403, code: 'ORIGIN' };
  if (typeof configuredToken !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(configuredToken) ||
    !safeOperatorId(configuredOperatorId))
    return { ok: false as const, status: 503, code: 'RATE_CARD_OPERATOR_UNCONFIGURED' };
  const authorization = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(authorization);
  if (!match) return { ok: false as const, status: 401, code: 'UNAUTHORIZED' };
  const [expectedHash, providedHash] = await Promise.all([sha256(configuredToken), sha256(match[1])]);
  if (!constantTimeEqual(expectedHash, providedHash)) return { ok: false as const, status: 401, code: 'UNAUTHORIZED' };
  return { ok: true as const, operatorId: configuredOperatorId };
}
