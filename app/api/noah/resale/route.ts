import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import { workStore } from '@/lib/work-store';
import { WorkError } from '@/lib/workflow';
const OWNER_SCOPE_HEADER = 'x-noah-resale-owner';
import { resaleService } from '@/lib/noah-resale-service';
import {
  ebayResaleProvider,
  digest,
  type ResaleCredentials,
} from '@/lib/noah-resale-provider';
import { totals } from '@/lib/noah-resale';
const json = (v: unknown, status = 200) =>
  Response.json(v, { status, headers: { 'Cache-Control': 'no-store' } });
async function handle(request: Request, mutate: boolean) {
  try {
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(
        new URL(request.url).hostname,
      )
    )
      return json({ error: '本人用ローカル機能です。' }, 404);
    const user = await requestUser(request),
      scope = await digest(['noah-resale-owner', user]);
    // Credentials are bound to this local owner; never shared with arbitrary signed-in users.
    if (user !== 'local-preview:rockstar-owner')
      return json({ error: 'このMacの所有者で接続してください。' }, 403);
    if (
      mutate &&
      (request.headers.get('origin') !== new URL(request.url).origin ||
        request.headers.get(OWNER_SCOPE_HEADER) !== scope)
    )
      return json({ error: '本人・送信元を確認してください。' }, 403);
    const provider = ebayResaleProvider(env as unknown as ResaleCredentials),
      service = resaleService(workStore(database()), provider);
    let job;
    if (mutate) {
      const reader = request.body?.getReader();
      if (!reader) throw new WorkError('入力がありません。');
      let size = 0;
      const chunks: Uint8Array[] = [];
      while (true) {
        const r = await reader.read();
        if (r.done) break;
        size += r.value.length;
        if (size > 20000) {
          await reader.cancel();
          throw new WorkError('入力が長すぎます。', 413);
        }
        chunks.push(r.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const c of chunks) {
        bytes.set(c, offset);
        offset += c.length;
      }
      const v = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      );
      if (!v || typeof v !== 'object' || Array.isArray(v))
        throw new WorkError('入力を確認してください。');
      job = await service.run(user, v);
    } else job = await service.get(user);
    const approvals = Object.fromEntries(
      await Promise.all(
        job.resale.items.map(async (i) => [
          i.id,
          {
            purchase: await digest(i.checkout ?? null),
            publish: await digest(i.listing ?? null),
          },
        ]),
      ),
    );
    return json({
      job,
      ownerScope: scope,
      totals: totals(job.resale),
      ready: service.ready,
      approvals,
    });
  } catch (e) {
    return json(
      {
        error:
          e instanceof WorkError
            ? e.message
            : '保存・接続・入力を確認してください。',
      },
      e instanceof WorkError ? e.status : 503,
    );
  }
}
export const GET = (r: Request) => handle(r, false);
export const POST = (r: Request) => handle(r, true);
