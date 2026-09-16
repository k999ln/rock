import { AccessAuthError, authorizeOperator } from './access-auth.ts';
import { operatorControl } from './operator-control.ts';
import { OperatorError } from './validation.ts';

type Env = {
  ASSETS: Fetcher;
  DB: D1Database;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  ROCK_OPERATOR_SUB?: string;
};

const securityHeaders = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy':
    "default-src 'self'; base-uri 'none'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self'; object-src 'none'; script-src 'self'; style-src 'self'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
} as const;

function secured(response: Response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders))
    headers.set(name, value);
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function json(value: unknown, status = 200) {
  return secured(Response.json(value, { status }));
}

async function body(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new OperatorError('JSONで送信してください。', 415);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > 4096)
    throw new OperatorError('入力サイズの上限を超えています。', 413);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new OperatorError('入力の形式を確認してください。');
  }
}

function requireSameOrigin(request: Request) {
  if (request.method !== 'POST') return;
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin)
    throw new OperatorError('運営Dockから操作してください。', 403);
}

function denied(request: Request, error: AccessAuthError) {
  if (new URL(request.url).pathname.startsWith('/api/'))
    return json({ error: error.message }, error.status);
  return secured(
    new Response('Not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }),
  );
}

const worker = {
  async fetch(request: Request, env: Env) {
    let operatorSub: string;
    try {
      ({ operatorSub } = await authorizeOperator(request, env));
    } catch (error) {
      if (error instanceof AccessAuthError) return denied(request, error);
      return denied(
        request,
        new AccessAuthError('運営者を確認できません。', 503),
      );
    }

    const url = new URL(request.url);
    try {
      requireSameOrigin(request);
      if (url.pathname === '/api/devices') {
        const control = operatorControl(
          env.DB,
          operatorSub,
          env.ROCK_OPERATOR_SUB?.trim() ?? '',
        );
        if (request.method === 'GET') return json(await control.overview());
        if (request.method === 'POST') {
          const input = await body(request);
          if (
            input &&
            typeof input === 'object' &&
            !Array.isArray(input) &&
            (input as { operation?: unknown }).operation === 'cancel'
          )
            return json(await control.cancel(input));
          return json(await control.issue(input));
        }
        return json({ error: '許可されていないHTTP methodです。' }, 405);
      }
      if (request.method !== 'GET' && request.method !== 'HEAD')
        return json({ error: '許可されていないHTTP methodです。' }, 405);
      return secured(await env.ASSETS.fetch(request));
    } catch (error) {
      if (error instanceof OperatorError)
        return json({ error: error.message }, error.status);
      return json(
        { error: '運営Dockを処理できませんでした。時間を置いて再試行してください。' },
        503,
      );
    }
  },
};

export default worker;
