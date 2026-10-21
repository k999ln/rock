import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import { eveHistoryKeys, EveHistoryError } from '@/lib/eve-history';
import { eveDeviceSyncStore } from '@/lib/eve-device-sync';
import { rockstarDeviceLinkStore } from '@/lib/rockstar-device-link';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function handle(request:Request) {
  try {
    const db=database(),owner=await requestUser(request),keys=eveHistoryKeys((env as unknown as {EVE_HISTORY_KEYRING?:string}).EVE_HISTORY_KEYRING),store=eveDeviceSyncStore(db,owner,keys);
    const auth=request.headers.get('authorization')??'';
    const device=auth.startsWith('Bearer rock_session_')?await rockstarDeviceLinkStore(db).identity(auth.slice(7)):null;
    if(request.method==='GET')return json({ownerUserId:owner,jobs:await store.list(new URL(request.url).searchParams.get('threadId')??''),devices:await store.devices(),...(device?{commands:await store.pending(device.id)}:{})});
    if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'同じ接続先から操作してください。'},403);
    if(device&&device.userId!==owner)throw new Error('UNAUTHORIZED');
    if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSONで送信してください。'},415);
    const chunks:Uint8Array[]=[];let size=0;const reader=request.body?.getReader();if(!reader)return json({error:'入力がありません。'},400);
    try{while(true){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>180000){await reader.cancel();return json({error:'同期する量を減らしてください。'},413);}chunks.push(p.value);}}finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.byteLength;}
    const input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as Record<string,unknown>;
    if(request.method==='POST')return json(await store.enqueue(input));
    if(!device)return json({error:'接続を承認したPixelからだけ仕事を同期できます。'},403);
    if(input.action==='presence'&&Object.keys(input).length===2){await store.presence(input.presence,device.id);return json({ok:true});}
    if(input.action==='ack'&&Object.keys(input).length===2&&typeof input.id==='string'){await store.acknowledge(device.id,input.id);return json({ok:true});}
    return json(await store.publish(input,device.id));
  }catch(e){if(e instanceof EveHistoryError)return json({error:e.message},e.status);if(e instanceof SyntaxError)return json({error:'同期データの形式を確認してください。'},400);if(e instanceof Error&&e.message==='UNAUTHORIZED')return json({error:'同じアカウントへ再接続してください。'},401);return json({error:'同期できません。端末の成果を残し、接続後に再試行します。'},503);}
}
export const GET=handle;
export const PUT=handle;
export const POST=handle;
