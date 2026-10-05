import handler from 'vinext/server/fetch-handler';
import schema from './sky-schema-bootstrap.json';

let initializing: Promise<void> | undefined;
async function ensureSchema(db: D1Database) {
  const ready = await db.prepare('SELECT version FROM sky_service_schema WHERE version = 1').first();
  if (ready) return;
  initializing ??= (async () => {
    // Static, idempotent schema only. No app request is admitted until every guard exists.
    for (let offset = 0; offset < schema.length; offset += 40) {
      await db.batch(schema.slice(offset, offset + 40).map((sql) => db.prepare(sql)));
    }
    await db.prepare('INSERT OR IGNORE INTO sky_service_schema(version) VALUES (1)').run();
  })().finally(() => { initializing = undefined; });
  await initializing;
}
export default {
  async fetch(request: Request, env: { DB: D1Database }, ctx: ExecutionContext) {
    if (new URL(request.url).pathname.startsWith('/api/')) {
      try { await ensureSchema(env.DB); }
      catch {
        return Response.json({ error: 'サービスを準備しています。少し待って再試行してください。' }, {
          status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '5' },
        });
      }
    }
    return handler.fetch(request, env, ctx);
  },
};
