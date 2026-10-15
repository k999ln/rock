import { readBoundedStream } from './bounded-stream.ts';
import { WorkError } from './workflow.ts';
import { localMonthlyPaymentFixture, skyMonthlySandbox } from './sky-monthly-sandbox.ts';

export function monthlySandboxAllowed(request: Request, mode: unknown) {
  const url = new URL(request.url);
  return mode === 'local-fixture' && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
}
export async function handleMonthlySandbox(request: Request, owner: string, db: Pick<D1Database,'prepare'|'batch'>, mode: unknown) {
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!monthlySandboxAllowed(request, mode)) return json({ error: '月次請求テストはローカル環境でのみ利用できます。' }, 404);
  try {
    if (!owner) return json({ error: '本人確認が必要です。' }, 401);
    const service = skyMonthlySandbox(db);
    if (request.method === 'GET') return json(await service.list(owner));
    if (request.method !== 'POST') return json({ error: 'METHOD' }, 405);
    if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'ORIGIN' }, 403);
    if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') return json({ error: 'JSON_REQUIRED' }, 415);
    const reader = request.body?.getReader();
    if (!reader) throw new WorkError('入力がありません。');
    const body = JSON.parse(new TextDecoder().decode(await readBoundedStream(reader, 85_000, () => new WorkError('入力が大きすぎます。', 413)))) as Record<string, unknown>;
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.id !== 'string') throw new WorkError('入力を確認してください。');
    switch (body.action) {
      case 'quote': return json({ quote: await service.quote(owner, body.id, body.input) });
      case 'run': return json(await service.run(owner, body.id, body.approvedAmountMinor, body.approvedRateVersion));
      case 'close': return json({ invoice: await service.close(owner, body.id, true), simulatedMonthEnd: true });
      case 'reconcile': return json({ invoice: await service.reconcile(owner, body.id, localMonthlyPaymentFixture), simulatedPayment: true });
      default: throw new WorkError('操作を確認してください。');
    }
  } catch (error) {
    if (error instanceof WorkError) return json({ error: error.message }, error.status);
    if (error instanceof SyntaxError) return json({ error: 'JSONを確認してください。' }, 400);
    return json({ error: '結果不明です。同じIDで照合してください。' }, 503);
  }
}
