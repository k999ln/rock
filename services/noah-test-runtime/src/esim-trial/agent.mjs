import { goods, regions, runGuide } from './guide.mjs';

// The package receives only a selection and a fixture source. No owner session,
// line administration, wallet, provider secrets, or outbound network binding.
export default {
  fetch(request, env) {
    const id = request.headers.get('X-Work-Id');
    if (request.method !== 'POST' || !/^[a-f0-9]{64}$/.test(id ?? ''))
      return new Response(null, { status: 400 });
    return env.EXECUTIONS.get(env.EXECUTIONS.idFromName(id)).fetch(request);
  },
};
export class GuideExecution {
  constructor(ctx) {
    this.storage = ctx.storage;
  }
  async fetch(request) {
    const { region, item, records } = await request.json();
    if (!Object.hasOwn(regions, region) || !Object.hasOwn(goods, item))
      return new Response(null, { status: 400 });
    const record = await this.storage.transaction(async (tx) => {
      const existing = await tx.get('execution');
      if (existing) return existing;
      const finished = {
        region,
        item,
        result: runGuide(records, region, item),
      };
      await tx.put('execution', finished);
      return finished;
    });
    if (record.region !== region || record.item !== item)
      return new Response(null, { status: 409 });
    return Response.json(record);
  }
}
