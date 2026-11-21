// A zero-cost text counter for the trial. Each service binding uses an isolated
// durable namespace and implements the same result lookup as a provider adapter.
const report = {
  done: ['入力された文章の文字数と行数を集計しました。'],
  incomplete: [],
  unverified: [],
};
export default {
  fetch(request, env) {
    const id = new URL(request.url).pathname.split('/').pop();
    if (!/^[0-9a-f]{64}$/.test(id)) return new Response(null, { status: 400 });
    return env.RESULTS.get(env.RESULTS.idFromName(id)).fetch(request);
  },
};
export class TextResult {
  constructor(ctx) {
    this.storage = ctx.storage;
  }
  async fetch(request) {
    const id = new URL(request.url).pathname.split('/').pop();
    if (request.method === 'GET') {
      const saved = await this.storage.get('result');
      return saved
        ? Response.json({ id, result: saved.result, report })
        : new Response(null, { status: 404 });
    }
    if (request.method !== 'PUT') return new Response(null, { status: 405 });
    const { text } = await request.json();
    if (typeof text !== 'string' || !text.trim() || text.length > 500)
      return new Response(null, { status: 400 });
    const saved = await this.storage.transaction(async (tx) => {
      const previous = await tx.get('result');
      if (previous) return previous;
      const record = {
        text,
        result:
          '文字数 ' + [...text].length + '、行数 ' + text.split(/\r?\n/).length,
      };
      await tx.put('result', record);
      return record;
    });
    return text === saved.text
      ? Response.json({ id, result: saved.result, report })
      : new Response(null, { status: 409 });
  }
}
