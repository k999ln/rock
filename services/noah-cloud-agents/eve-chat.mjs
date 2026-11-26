import { validEveMessages, eveChatModelMessages, parseEveChatReply, eveChatBytes } from '../../lib/eve-chat.ts';
import { NOAH_CLOUD_MODEL, noahCloudId, noahCloudCallNeuronsCap, noahCloudReplyUsage, NOAH_FREE_CLOUD_LIMITS } from '../../lib/noah-cloud-contract.ts';
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
/** Never dispatch through a connection/job DO: model content exists only for this request. */
export async function eveChat(body, env, ctx) {
  if (env.NOAH_CLOUD_MODE !== 'free' || !env.AI || !/^[a-f0-9]{64}$/.test(body.owner ?? '') || !noahCloudId(body.id) || !validEveMessages(body.messages)
    || !Array.isArray(body.candidates) || body.candidates.length > 6 || !body.candidates.every(c => c && /^project-[a-f0-9]{64}$/.test(c.id) && typeof c.name === 'string' && c.name.length <= 100 && typeof c.summary === 'string' && c.summary.length <= 300)) return json({ error: 'invalid_chat' }, 400);
  const input = { messages: eveChatModelMessages(body.messages, body.candidates), max_tokens: 1024, reasoning_effort: 'low', response_format: { type: 'json_object' } };
  const inputBytes = eveChatBytes(input), cap = noahCloudCallNeuronsCap(inputBytes, input.max_tokens);
  if (inputBytes > NOAH_FREE_CLOUD_LIMITS.modelInputBytes || cap > NOAH_FREE_CLOUD_LIMITS.jobNeurons) return json({ error: 'chat_too_large' }, 400);
  const budget = env.BUDGET.getByName('global'), id = `${body.owner}:chat:${body.id}`;
  const rpc = value => budget.fetch('https://runtime.internal/', { method: 'POST', body: JSON.stringify({ id, owner: body.owner, ...value }) });
  const admitted = await rpc({ action: 'admit-chat', mode: 'run' });
  if (!admitted.ok) return admitted;
  // A lost response never retries inference. Keep only admission IDs and usage in Budget.
  // A client timeout does not prove that Workers AI stopped; account/release on settlement.
  const work = (async () => {
    let reply;
    try { reply = await env.AI.run(NOAH_CLOUD_MODEL, input); }
    catch { /* Failed inference may still consume tokens; charge the preflight cap below. */ }
    const usage = reply ? noahCloudReplyUsage(reply, inputBytes, input.max_tokens) : { neurons: cap };
    const charged = await rpc({ action: 'use', neurons: usage.neurons });
    if (!charged.ok) return json({ error: 'usage_unconfirmed' }, 503); // retain the lease on accounting failure
    await rpc({ action: 'release' });
    const content = reply?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.length > 16000 || reply?.choices?.[0]?.finish_reason === 'length') return json({ error: 'invalid_reply' }, 502);
    const result = parseEveChatReply(content, body.candidates);
    return result ? json(result) : json({ error: 'invalid_reply' }, 502);
  })();
  ctx.waitUntil(work.then(() => {}, () => {}));
  let timer;
  try { return await Promise.race([work, new Promise(resolve => { timer = setTimeout(() => resolve(json({ error: 'chat_timeout' }, 504)), 45000); })]); }
  finally { clearTimeout(timer); }
}
