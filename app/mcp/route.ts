import { handleSkyMcpMessage } from '@/lib/sky-codex-bridge';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Type': 'application/json' };

export async function POST(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json'))
    return Response.json({ error: 'JSON required.' }, { status: 415, headers });
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > 32_000)
    return Response.json({ error: 'Request too large.' }, { status: 413, headers });
  let input: unknown;
  try { input = JSON.parse(body); }
  catch { return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error.' } }, { status: 400, headers }); }
  const response = handleSkyMcpMessage(input, Boolean(request.headers.get('oai-authenticated-user-id')));
  return response ? Response.json(response, { headers }) : new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
