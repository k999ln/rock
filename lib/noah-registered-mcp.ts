import { AGENTBOARD_MCP } from './noah-registration-native.ts';
import type { NoahExternalAccountStore } from './noah-external-account-store.ts';

const blocked=new Set(['register_agent','rotate_credential','delete_account']);
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
async function read(response:Response,id:unknown){
  const reader=response.body?.getReader();if(!reader)throw Error('empty');let text='',size=0;const decoder=new TextDecoder();
  try{for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>1_048_576)throw Error('size');text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel().catch(()=>{});}
  if(response.headers.get('content-type')?.includes('text/event-stream')){
    for(const event of text.split(/\r?\n\r?\n/)){const line=event.split(/\r?\n/).filter(v=>v.startsWith('data:')).map(v=>v.slice(5).trim()).join('\n');if(!line)continue;const value=JSON.parse(line);if(value.id===id)return value;}
    throw Error('missing reply');
  }
  return JSON.parse(text);
}
/** Adapts only the audited provider. Credentials are injected after Noah validates the visible input. */
export async function createNoahRegisteredMcpFetch(deps:{owner:string;url:string;store:NoahExternalAccountStore;fetcher:typeof fetch}):Promise<typeof fetch>{
  if(deps.url!==AGENTBOARD_MCP)return deps.fetcher;
  const privateTools=new Set<string>(),allowed=new Set<string>();
  const error=(id:unknown,message:string)=>Response.json({jsonrpc:'2.0',id,error:{code:-32001,message}},{headers:{'Cache-Control':'no-store'}});
  return (async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=input instanceof Request?input.url:String(input);
    if(url!==AGENTBOARD_MCP)throw Error('registered destination changed');
    const raw=typeof init?.body==='string'?JSON.parse(init.body):null;
    if(!object(raw)||!['initialize','notifications/initialized','tools/list','tools/call'].includes(String(raw.method)))return deps.fetcher(input,{...init,redirect:'error'});
    let credential:string|undefined;
    if(raw.method==='tools/call'){
      const params=raw.params;
      if(!object(params)||typeof params.name!=='string'||!allowed.has(params.name)||blocked.has(params.name))return error(raw.id,'この操作は登録Agentから行ってください。');
      const args=params.arguments??{};
      if(!object(args)||Object.keys(args).some(k=>['credential','agent','__proto__','prototype','constructor'].includes(k)))return error(raw.id,'接続情報はNoahが渡します。入力内容を確認してください。');
      if(privateTools.has(params.name)){
        const {account}=await deps.store.load(deps.owner,'agentboard');
        if(account?.state!=='ready'||!account.credential)return Response.json({jsonrpc:'2.0',id:raw.id,result:{isError:true,content:[{type:'text',text:'この操作にはAgentboardへの登録が必要です。「登録して使う」から進めてください。'}]}});
        credential=account.credential;
        raw.params={...params,arguments:{...args,credential}};
        init={...init,body:JSON.stringify(raw)};
      }
    }
    const response=await deps.fetcher(input,{...init,redirect:'error'});
    if(!['tools/list','tools/call'].includes(String(raw.method)))return response;
    if(!response.ok){await response.body?.cancel();return error(raw.id,'接続先を確認できません。時間をおいて試してください。');}
    let reply;try{reply=await read(response,raw.id);}catch{return error(raw.id,'接続先の応答を確認できません。');}
    if(raw.method==='tools/list'){
      if(!object(reply)||!object(reply.result)||!Array.isArray(reply.result.tools))return error(raw.id,'道具の一覧を確認できません。');
      reply.result.tools=reply.result.tools.filter((tool:unknown)=>object(tool)&&typeof tool.name==='string'&&!blocked.has(tool.name)).map((tool:Record<string,unknown>)=>{
        const name=String(tool.name);allowed.add(name);
        if(!object(tool.inputSchema)||!object(tool.inputSchema.properties))return tool;
        const schema=tool.inputSchema,properties={...schema.properties as Record<string,unknown>};
        if(Object.hasOwn(properties,'credential'))privateTools.add(name);
        delete properties.credential;delete properties.agent;
        const required=Array.isArray(schema.required)?schema.required.filter((v:unknown)=>v!=='credential'&&v!=='agent'):[];
        return {...tool,inputSchema:{...schema,properties,required}};
      });
    }
    // Never persist or return a provider credential, including one echoed by an upstream error.
    let encoded=JSON.stringify(reply);if(credential)encoded=encoded.split(credential).join('[接続キーは非表示]');
    encoded=encoded.replace(/agb_[a-f0-9]{32,256}/g,'[接続キーは非表示]');
    return new Response(encoded,{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }) as typeof fetch;
}
