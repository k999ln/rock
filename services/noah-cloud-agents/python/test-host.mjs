// Local-only deterministic model fixture. Never deployed with the private Worker.
import { RpcTarget } from 'cloudflare:workers';
class Model extends RpcTarget {
  calls = [];
  constructor(input) { super(); this.input = input; }
  async live() { if (this.input.mode === 'stopped') throw Error('stopped'); return true; }
  async complete(encoded) {
    const input = JSON.parse(encoded);
    this.calls.push(input);
    if (this.input.mode === 'stop-model') throw Error('stopped during model');
    const nonce = this.input.prompt;
    let message = { role: 'assistant', content: nonce };
    if (input.tools) {
      if (this.calls.length === 1 && this.input.mode !== 'no-tool') {
        const operations = this.input.mode === 'read'
          ? [['todo', {}]]
          : this.input.mode === 'bad-tool' ? [['terminal', {command:'false'}]]
          : [['todo', {todos:[{id:'one',content:nonce,status:'pending'}]}], ['memory', {action:'add',target:'memory',content:nonce}]];
        message = {role:'assistant',content:null,tool_calls:operations.map(([name,args],i)=>({id:`call${i}`,type:'function',function:{name,arguments:JSON.stringify(args)}}))};
      }
    } else {
      message.content = this.input.mode === 'bad-boss' ? '{}' : JSON.stringify({job_summary:nonce,questions:Array.from({length:5},(_,i)=>({question:`Question ${i+1}: ${nonce}`,framework:'Use an example'})),preparation_tips:[nonce]});
    }
    return JSON.stringify({id:'fixture',object:'chat.completion',created:1,choices:[{index:0,finish_reason:message.tool_calls?'tool_calls':'stop',message}]});
  }
}
export default {async fetch(request, env) {
  if (new URL(request.url).pathname === '/ready') return new Response('ready');
  const input = await request.json(), stub = env.PYTHON.getByName(input.id), model = new Model(input);
  try {
    if (input.profile === 'time') return Response.json({tools:JSON.parse(await stub.tools()),result:JSON.parse(await stub.call(input.tool,JSON.stringify(input.arguments)))});
    const data = JSON.parse(await stub.execute(JSON.stringify(input),model));
    return Response.json({data,calls:model.calls});
  } catch (error) { return Response.json({error:String(error),calls:model.calls},{status:422}); }
}};
