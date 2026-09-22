import { env } from 'cloudflare:workers';

async function digest(value: string) {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
}

async function equalSecret(left: string, right: string) {
  const [a, b] = await Promise.all([digest(left), digest(right)]);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1)
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}

export async function requestSkyReviewer(request: Request) {
  const bindings = env as unknown as {
    SKY_REVIEWER_SECRET?: string;
    SKY_REVIEWER_ID?: string;
  };
  const configured = bindings.SKY_REVIEWER_SECRET?.trim() ?? '';
  const reviewerId = bindings.SKY_REVIEWER_ID?.trim() ?? '';
  const authorization = request.headers.get('authorization') ?? '';
  const supplied = authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : '';
  if (
    configured.length < 40 ||
    reviewerId.length < 3 ||
    reviewerId.length > 100 ||
    !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(reviewerId) ||
    !(await equalSecret(supplied, configured))
  )
    throw new Error('UNAUTHORIZED_REVIEWER');
  return reviewerId;
}
