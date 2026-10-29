export { A2ADelegationWorkflow } from '../../../services/sky-agent-runtime/src/worker.ts';
const fixtureWorker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/job') {
      const row = await env.DB.prepare('SELECT user_id,payload,revision FROM work_jobs WHERE id=? AND user_id=?')
        .bind(url.searchParams.get('id'), url.searchParams.get('owner')).first();
      return row ? Response.json({owner:row.user_id, job:JSON.parse(row.payload), revision:row.revision}) : new Response(null,{status:404});
    }
    return new Response(null,{status:404});
  },
};
export default fixtureWorker;
