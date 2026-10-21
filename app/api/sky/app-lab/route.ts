import { appObject, skyPrivateLabAllowed } from '@/lib/sky-app-contract';
import { createLocalChannelStore, LocalChannelError } from '@/lib/sky-app-local-channel';
import { privatePlannerOrigins } from '@/lib/sky-planner-bridge';
import { workId } from '@/lib/workflow';

const store = createLocalChannelStore();
function allowed(request: Request) {
  if (!skyPrivateLabAllowed(process.env.NODE_ENV, new URL(request.url).host)) throw new LocalChannelError('見つかりません。', 404);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin && !privatePlannerOrigins.some((v) => v === origin)) throw new LocalChannelError('許可されていない接続元です。', 403);
  return origin;
}
function json(request: Request, value: unknown, status = 200) {
  const origin = request.headers.get('origin');
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'Vary': 'Origin',
    ...(skyPrivateLabAllowed(process.env.NODE_ENV, new URL(request.url).host) && origin && privatePlannerOrigins.some((v) => v === origin) ? { 'Access-Control-Allow-Origin': origin } : {}) } });
}
function error(request: Request, cause: unknown) {
  return json(request, { error: cause instanceof LocalChannelError ? cause.message : '本人用受渡しの形式・状態を確認してください。' }, cause instanceof LocalChannelError ? cause.status : 400);
}
export async function OPTIONS(request: Request) {
  try {
    const origin = allowed(request);
    return new Response(null, { status: 204, headers: { 'Vary': 'Origin', ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Sky-Lab-Channel' } });
  } catch (cause) { return error(request, cause); }
}
export async function GET(request: Request) {
  try {
    const origin = allowed(request), url = new URL(request.url);
    if (url.search) throw new LocalChannelError('受渡しIDはheaderで指定してください。', 400);
    const channel = store.get(request.headers.get('x-sky-lab-channel'));
    if (origin && privatePlannerOrigins.some((v) => v === origin) && origin !== channel.senderOrigin) throw new LocalChannelError('見つかりません。', 404);
    return json(request, channel);
  } catch (cause) { return error(request, cause); }
}
export async function POST(request: Request) {
  try {
    const origin = allowed(request), reader = request.body?.getReader();
    if (!reader) throw new LocalChannelError('入力がありません。', 400);
    let text = ''; const decoder = new TextDecoder(); let length = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length; if (length > 30000) { await reader.cancel(); throw new LocalChannelError('入力は30KBまでです。', 413); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const input = appObject(JSON.parse(text), ['action', 'channel', 'request', 'revision', 'commandId']);
    if (input.action === 'create') {
      appObject(input, ['action', 'channel', 'request']);
      if (!origin || !privatePlannerOrigins.some((v) => v === origin)) throw new LocalChannelError('Plannerから作成してください。', 403);
      return json(request, store.create(input.channel, origin, input.request), 201);
    }
    appObject(input, ['action', 'channel', 'revision', 'commandId']);
    // Planner can poll; only the Sky surface runs/reviews/delivers this channel.
    if (origin && origin !== new URL(request.url).origin) throw new LocalChannelError('Sky画面から操作してください。', 403);
    if (!Number.isInteger(input.revision)) throw new LocalChannelError('仕事の版を指定してください。', 400);
    return json(request, await store.command(input.channel, String(input.action), input.revision as number, workId(input.commandId), request.signal));
  } catch (cause) {
    if (request.body && !request.bodyUsed && !request.body.locked) void request.body.cancel().catch(() => {});
    return error(request, cause);
  }
}
