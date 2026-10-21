import { env } from 'cloudflare:workers';
import { requestUser } from '@/lib/fund-store';
import { skyPrivateLabAllowed } from '@/lib/sky-app-contract';
import { json } from '@/lib/operations-api';
/** Read-only installed model discovery for the owner's private localhost preview. */
export async function GET(request: Request) {
  if (!skyPrivateLabAllowed(process.env.NODE_ENV, new URL(request.url).host)) return json({ error: 'この環境では端末モデル一覧を公開していません。' },404);
  try {
    await requestUser(request);
    const base = new URL((env as unknown as {SKY_OLLAMA_BASE_URL?:string}).SKY_OLLAMA_BASE_URL || 'http://127.0.0.1:11434');
    if (!['127.0.0.1','localhost','[::1]'].includes(base.hostname) || !['http:','https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) return json({error:'端末内のモデル接続先を確認してください。'},503);
    const response=await fetch(new URL('/api/tags',base),{redirect:'manual',signal:AbortSignal.timeout(4000)});
    if(!response.ok || Number(response.headers.get('content-length')??0)>128000) return json({error:'端末モデル一覧を取得できません。'},503);
    const reader=response.body?.getReader();if(!reader)return json({error:'端末モデル一覧が空です。'},503);
    const chunks:Uint8Array[]=[];let bytes=0;
    try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>128000){await reader.cancel();return json({error:'端末モデル一覧を確認できません。'},503);}chunks.push(part.value);}}finally{reader.releaseLock();}
    const body=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}const raw=new TextDecoder().decode(body);
    const value=JSON.parse(raw) as {models?:Array<{name?:unknown;digest?:unknown;size?:unknown}>};
    if(!Array.isArray(value.models))return json({error:'端末モデル一覧の形式を確認できません。'},503);
    return json({provider:'ollama',models:value.models.slice(0,50).filter(m=>typeof m.name==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,119}$/.test(m.name)&&typeof m.digest==='string'&&/^[a-f0-9]{64}$/.test(m.digest)).map(m=>({name:m.name,digest:m.digest,bytes:typeof m.size==='number'&&Number.isSafeInteger(m.size)&&m.size>=0?m.size:null})),inferenceStarted:false});
  }catch(error){if(error instanceof Error&&error.message==='UNAUTHORIZED')return json({error:'サインインして確認してください。'},401);return json({error:'端末のOllamaに接続できません。起動状態を確認してください。'},503);}
}
