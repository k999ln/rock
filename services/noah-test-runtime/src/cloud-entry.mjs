import { cloudScreen } from '../../../toolkits/esim-bootstrap/noah-trial/view.mjs';
export { CloudWork } from './esim-trial/cloud-work.mjs';
export { TextResult } from './esim-trial/text-agent.mjs';
import textAgent from './esim-trial/text-agent.mjs';

const root = '/api/noah/cloud-work';
const headers = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};
const failure = (message, status) => new Response(message, { status, headers });

export default {
  async fetch(request, env) {
    // This Worker is private (service bindings only). The web ingress authenticates
    // the account. LINE separately verifies the carrier evidence for this request.
    if (!env.LINE) return failure('実回線の接続確認を準備しています。', 503);
    const { pathname } = new URL(request.url);
    const action =
      request.method === 'GET' && pathname === root
        ? 'list'
        : request.method === 'POST' && pathname === root + '/start'
          ? 'start'
          : request.method === 'POST' && pathname === root + '/stop'
            ? 'stop'
            : null;
    if (!action) return failure('操作を確認してください。', 404);
    const account = request.headers.get('X-Noah-Account');
    if (!account) return failure('利用者を確認してください。', 403);
    const evidence = request.headers.get('X-Noah-Carrier-Proof');
    if (!evidence || evidence.length > 8192)
      return failure('専用回線から接続してください。', 403);
    let input = {
      agent: new URL(request.url).searchParams.get('agent') ?? undefined,
    };
    let bodyBytes = new Uint8Array();
    if (action !== 'list') {
      if (
        request.headers.get('content-type')?.split(';')[0] !==
        'application/x-www-form-urlencoded'
      )
        return failure('フォームから送信してください。', 415);
      const reader = request.body?.getReader();
      if (!reader) return failure('入力を確認してください。', 400);
      const parts = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 8192) {
          await reader.cancel();
          return failure('文章が長すぎます。', 413);
        }
        parts.push(value);
      }
      bodyBytes = new Uint8Array(await new Blob(parts).arrayBuffer());
      const form = new URLSearchParams(new TextDecoder().decode(bodyBytes));
      if (new Set(form.keys()).size !== [...form.keys()].length)
        return failure('入力が重複しています。', 400);
      input = Object.fromEntries(form);
    }
    const digest = await crypto.subtle.digest('SHA-256', bodyBytes);
    const bodySha256 = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    const verified = await env.LINE.fetch('https://line.invalid/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account,
        method: request.method,
        url: request.url,
        bodySha256,
        evidence,
      }),
      redirect: 'manual',
    });
    if (!verified.ok)
      return failure(
        '回線を確認できません。',
        verified.status >= 500 ? 503 : 403,
      );
    const grant = await verified.json();
    if (
      grant.active !== true ||
      grant.account !== account ||
      typeof grant.owner !== 'string' ||
      !/^[a-zA-Z0-9._:-]{1,128}$/.test(grant.owner)
    )
      return failure('回線の利用者が一致しません。', 403);
    const jobs = env.JOBS.get(env.JOBS.idFromName(grant.owner));
    const response = await jobs.fetch('https://jobs.invalid/' + action, {
      method: 'POST',
      headers: { 'X-Trial-Owner': grant.owner },
      body: JSON.stringify(input),
    });
    if (!response.ok)
      return failure(
        (await response.json()).error ?? '状態を確認してください。',
        response.status,
      );
    if (action !== 'list')
      return new Response(null, {
        status: 303,
        headers: {
          ...headers,
          Location: input.agent
            ? root + '?agent=' + encodeURIComponent(input.agent)
            : root,
        },
      });
    return new Response(
      cloudScreen(await response.json(), crypto.randomUUID(), {
        root,
        hosted: true,
      }),
      { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } },
    );
  },
};

// Service binding entry point for the first-party, deterministic text Agent.
import { WorkerEntrypoint } from 'cloudflare:workers';
export class NoahTextAgent extends WorkerEntrypoint {
  fetch(request) {
    return textAgent.fetch(request, this.env);
  }
}
