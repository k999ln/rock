import { executeOutputTest } from '../../../lib/test-workspace-executor.ts';

const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json(
      { error: 'このサイトから操作してください。' },
      { status: 403, headers },
    );
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    return Response.json(
      { error: 'JSON形式で送信してください。' },
      { status: 415, headers },
    );
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error('入力がありません。');
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 64_000) {
        await reader.cancel();
        return Response.json(
          { error: 'テスト入力は64KB以内にしてください。' },
          { status: 413, headers },
        );
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const result = await executeOutputTest(
      JSON.parse(new TextDecoder().decode(bytes)),
    );
    return Response.json({ result }, { headers });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : '入力を確認してください。',
      },
      { status: 400, headers },
    );
  }
}
