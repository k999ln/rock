import { eveCombinationGet, eveCombinationPost } from '@/lib/eve-combination-catalog';

// 組み合わせの一覧・検査・採点（task 130）。外へ通信しない。何も保存しない。送金・公開はしない。
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

const LIMIT = 256_000;

export async function GET(request: Request) {
  const r = eveCombinationGet(new URL(request.url).searchParams.get('id'));
  return json(r.body, r.status);
}

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'この画面から操作してください。' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSON で送ってください。' }, 415);
  const reader = request.body?.getReader();
  if (!reader) return json({ error: '入力がありません。' }, 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > LIMIT) {
        await reader.cancel();
        return json({ error: '一度に送る量を減らしてください。' }, 413);
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return json({ error: 'JSON の形を確かめてください。' }, 400);
  }
  const r = eveCombinationPost(value);
  return json(r.body, r.status);
}
