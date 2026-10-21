import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import { EveHistoryError, eveHistoryKeys, eveHistoryStore, eveThreadId, eveHistoryOwnerBinding } from '@/lib/eve-history';

const json=(value:unknown,status=200,binding?:string)=>Response.json(value,{status,headers:{...(binding?{'X-Rock-Eve-Owner':binding}:{}),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function input(request:Request) {
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new EveHistoryError('JSONで送信してください。',415);
  const reader=request.body?.getReader();if(!reader)throw new EveHistoryError('入力がありません。');
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>640000){await reader.cancel();throw new EveHistoryError('一度に保存する量を減らしてください。',413);}chunks.push(part.value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown;}catch{throw new EveHistoryError('会話の形式を確認してください。');}
}
async function handle(request:Request,method:'GET'|'PUT'|'POST'|'DELETE') {
  try {
    const owner=await requestUser(request);
    if(method!=='GET'&&request.headers.get('origin')!==new URL(request.url).origin)throw new Error('ORIGIN');
    const keys=eveHistoryKeys((env as unknown as {EVE_HISTORY_KEYRING?:string}).EVE_HISTORY_KEYRING);
    const binding = await eveHistoryOwnerBinding(owner, keys);
    if (method !== 'GET' && request.headers.get('x-rock-eve-owner') !== binding) throw new EveHistoryError('アカウントが変わりました。履歴を読み直してから保存してください。', 409);
    const store=eveHistoryStore(database(),owner,keys),query=new URL(request.url).searchParams;
    if(method==='GET') {
      const id=query.get('id');
      return json(id?await store.get(eveThreadId(id),Number(query.get('before')??0)):await store.list(query.get('cursor')??''),200,binding);
    }
    const value=await input(request);
    if(method==='PUT')return json(await store.save(value));
    if(!value||typeof value!=='object'||Array.isArray(value))throw new EveHistoryError('入力を確認してください。');
    const v=value as Record<string,unknown>;
    if(method==='POST') {
      if(Object.keys(v).some(k=>!['query','exclude'].includes(k))||typeof v.query!=='string'||(v.exclude!==undefined&&typeof v.exclude!=='string'))throw new EveHistoryError('記憶の検索条件を確認してください。');
      return json({sources:await store.recall(v.query,String(v.exclude??''))});
    }
    if(Object.keys(v).some(k=>!['id','revision','confirm'].includes(k))||v.confirm!=='delete-history')throw new EveHistoryError('履歴と記憶の削除を確認してください。');
    await store.remove(eveThreadId(v.id),Number(v.revision));return json({deleted:true});
  } catch(error) {
    if(error instanceof EveHistoryError)return json({error:error.message},error.status);
    if(error instanceof Error&&error.message==='UNAUTHORIZED')return json({error:'同じアカウントへサインインすると履歴を引き継げます。'},401);
    if(error instanceof Error&&error.message==='ORIGIN')return json({error:'この画面から操作してください。'},403);
    return json({error:'履歴を読み書きできません。未保存の会話を保持して、接続を確認してください。'},503);
  }
}
export const GET=(request:Request)=>handle(request,'GET');
export const PUT=(request:Request)=>handle(request,'PUT');
export const POST=(request:Request)=>handle(request,'POST');
export const DELETE=(request:Request)=>handle(request,'DELETE');
