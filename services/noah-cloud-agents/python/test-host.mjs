// Local-only deterministic model fixture. Never deployed with the private Worker.
import { RpcTarget } from 'cloudflare:workers';
let pending = false;
class Model extends RpcTarget {
  calls = [];
  constructor(input) { super(); this.input = input; }
  async live() { if (this.input.mode === 'stopped') throw Error('stopped'); return true; }
  async complete(encoded) {
    const input = JSON.parse(encoded);
    this.calls.push(input);
    if(this.input.profile==='hermes' && this.calls.length===1 && JSON.stringify(input.tools?.map(t=>t.function?.name).sort())!==JSON.stringify(['memory','todo'])) throw Error('Official Hermes tool schemas were not sent');
    if(this.input.mode === 'slow' && this.calls.length === 1){pending=true;await new Promise(r=>setTimeout(r,1500));pending=false;}
    if (this.input.mode === 'stop-model') throw Error('stopped during model');
    const nonce = this.input.prompt;
    let message = { role: 'assistant', content: nonce };
    if (this.input.profile === 'hermes') {
      if ((this.calls.length === 1 && this.input.mode !== 'no-tool-once' || this.calls.length === 2 && this.input.mode === 'no-tool-once') && this.input.mode !== 'no-tool') {
        const operations = this.input.mode === 'read'
          ? [['todo', {}]]
          : this.input.mode === 'bad-tool' ? [['terminal', {command:'false'}]]
          : [['todo', {todos:[{id:'one',content:nonce,status:'pending'}]}], ['memory', {action:'add',target:'memory',content:nonce}]];
        message = {role:'assistant',content:null,tool_calls:operations.map(([name,args],i)=>({id:`call${i}`,type:'function',function:{name,arguments:JSON.stringify(args)}}))};
        if(message.tool_calls.some(c=>!input.tools?.some(t=>t.function?.name===c.function.name)) && this.input.mode!=='bad-tool') throw Error('Fixture cannot call an unadvertised tool');
      }
    } else {
      message.content = this.input.mode === 'bad-boss' ? '{}' : JSON.stringify({job_summary:nonce,questions:Array.from({length:5},(_,i)=>({question:`Question ${i+1}: ${nonce}`,framework:'Use an example'})),preparation_tips:[nonce]});
    }
    if(this.input.mode==='missing-choices') return JSON.stringify({response:'private model text'});
    if(this.input.mode==='empty-content' || this.input.mode==='output-limit') message.content=null;
    if(this.input.mode==='invalid-json') message.content='private incomplete JSON {';
    return JSON.stringify({id:'fixture',object:'chat.completion',created:1,choices:[{index:0,finish_reason:['output-limit','truncated-json'].includes(this.input.mode)?'length':message.tool_calls?'tool_calls':'stop',message}]});
  }
}
export default {async fetch(request, env) {
  if (new URL(request.url).pathname === '/ready') return new Response('ready');
  if (new URL(request.url).pathname === '/busy') return Response.json({pending});
  const input = await request.json(), stub = env[{time:'PYTHON',boss:'PYTHON_BOSS',hermes:'PYTHON_HERMES'}[input.routeProfile||input.profile]].getByName(input.id), model = new Model(input);
  try {
    if(input.mode==='probe') return Response.json({ready:await stub.probe(input.profile)});
    if (input.profile === 'time') return Response.json({tools:JSON.parse(await stub.tools()),result:JSON.parse(await stub.call(input.tool,JSON.stringify(input.arguments)))});
    const data = JSON.parse(await stub.execute(JSON.stringify(input),model));
    if(data.error) return Response.json({error:data.error,calls:model.calls},{status:422});
    return Response.json({data,calls:model.calls});
  } catch (error) { return Response.json({error:String(error),calls:model.calls},{status:422}); }
}};
