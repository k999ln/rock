import {
  createNoahProviderRuntime,
  providerWorkView,
  type ProviderDependencies,
} from './noah-provider-runtime.ts';
import { boundedNoahBody } from './noah-agent-api.ts';
import { NoahAgentError } from './noah-agent-upload.ts';
import { object } from './noah-gradio.ts';
import { ownerScopeFor, OWNER_SCOPE_HEADER } from './owner-intent.ts';
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
    },
  });
export function createNoahProviderApi(deps: ProviderDependencies) {
  const runtime = createNoahProviderRuntime(deps);
  return async (request: Request) => {
    try {
      if (!['GET', 'POST'].includes(request.method))
        return json({ error: '対応しない操作です。' }, 405);
      const owner = await deps.authenticate(request),
        ownerScope = await ownerScopeFor(owner),
        url = new URL(request.url);
      if (request.method === 'GET' && url.searchParams.has('work')) {
        const id = url.searchParams.get('work') ?? '';
        const job = await runtime.get(owner, id);
        if (!job) return json({ error: '仕事が見つかりません。' }, 404);
        // Keep the HTTP response alive for the entire provider SSE. waitUntil alone
        // only lasts 30 seconds after the response and cannot host long inference.
        const encoder = new TextEncoder();
        let alive = true;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const heartbeat = setInterval(() => {
              if (alive) controller.enqueue(encoder.encode('\n'));
            }, 10000);
            void (async () => {
              try {
                await runtime.poll(owner, id);
                const current = await runtime.get(owner, id);
                if (alive && current)
                  controller.enqueue(
                    encoder.encode(
                      JSON.stringify({
                        ...providerWorkView(current),
                        ownerScope,
                      }) + '\n',
                    ),
                  );
              } finally {
                clearInterval(heartbeat);
                if (alive) {
                  alive = false;
                  controller.close();
                }
              }
            })().catch(() => undefined);
          },
          cancel() {
            alive = false;
          },
        });
        return new Response(stream, {
          headers: {
            'Content-Type': 'application/x-ndjson',
            'Cache-Control': 'no-store, private',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
      if (request.method === 'GET')
        return json({
          plan: await runtime.plan(url.searchParams.get('project') ?? ''),
          ownerScope,
        });
      if (request.headers.get('origin') !== url.origin)
        return json({ error: '同じNoahから操作してください。' }, 403);
      if (request.headers.get(OWNER_SCOPE_HEADER) !== ownerScope)
        return json(
          { error: '保存先が変わりました。画面を開き直してください。' },
          409,
        );
      if (!request.headers.get('content-type')?.startsWith('application/json'))
        return json({ error: 'JSONで操作してください。' }, 415);
      let value: unknown;
      try {
        value = JSON.parse(
          new TextDecoder().decode(await boundedNoahBody(request, 16000)),
        );
      } catch (e) {
        if (e instanceof NoahAgentError) throw e;
        return json({ error: '入力を確認してください。' }, 400);
      }
      if (
        !object(value) ||
        Object.keys(value).some(
          (k) =>
            !['id', 'projectId', 'api', 'digest', 'input', 'confirm'].includes(
              k,
            ),
        ) ||
        typeof value.id !== 'string' ||
        typeof value.projectId !== 'string' ||
        typeof value.api !== 'string' ||
        typeof value.digest !== 'string' ||
        !/^[a-f0-9]{64}$/.test(value.digest) ||
        !object(value.input) ||
        value.confirm !== true
      )
        return json({ error: '依頼内容と送信先を確認してください。' }, 400);
      const accepted = await runtime.accept(
        owner,
        deps.reviewers.includes(owner),
        {
          id: value.id,
          projectId: value.projectId,
          api: value.api,
          digest: value.digest,
          input: value.input,
          confirm: true,
        },
      );
      if (accepted.run) {
        const work = accepted.run().catch(() => undefined);
        if (deps.waitUntil) deps.waitUntil(work);
        else await work;
      }
      return json(
        { ...providerWorkView(accepted.job), ownerScope },
        accepted.replay ? 200 : 202,
      );
    } catch (e) {
      if (e instanceof NoahAgentError)
        return json(
          { error: e.status === 413 ? '入力が大きすぎます。' : e.message },
          e.status,
        );
      return json(
        {
          error:
            e instanceof Error && e.message === 'UNAUTHORIZED'
              ? '保存先を開けませんでした。'
              : '実行の準備ができませんでした。時間をおいて読み直してください。',
        },
        e instanceof Error && e.message === 'UNAUTHORIZED' ? 401 : 503,
      );
    }
  };
}
