import { xTimelineUrl } from './sky-hub.ts';

export type XPost = { id: string; text: string; author: string; name: string; createdAt: string; url: string };
export type XFeedSettings = { token: string; sources: string[]; dailyRequests: number } | null;
export type XFeedSnapshot = { mode:'api'; posts:XPost[]; fetchedAt:number; retryAt:number; status:string };
type Database = Pick<D1Database,'prepare'>;
type Row = { payload:string; remote_user_id:string|null; fetched_at:number; next_refresh_at:number; retry_after:number; error_code:string|null };
const GLOBAL='__api__',FRESH_MS=15*60_000,RETENTION_MS=24*60*60_000;

export function xFeedSettings(env:Record<string,unknown>):XFeedSettings {
  if(env.SKY_X_API_APPROVED!=='1')return null;
  const token=env.SKY_X_BEARER_TOKEN, limit=Number(env.SKY_X_MAX_REQUESTS_PER_DAY);
  if(typeof token!=='string'||token.length<20||token.length>8192||/\s/.test(token)||!Number.isSafeInteger(limit)||limit<1||limit>100)return null;
  try{const raw=JSON.parse(String(env.SKY_X_API_SOURCES));if(!Array.isArray(raw)||!raw.length||raw.length>20)return null;return{token,sources:raw.map(xTimelineUrl),dailyRequests:limit};}catch{return null;}
}
class XFeedError extends Error {
  readonly code:string;readonly retryAt:number;
  constructor(code:string,retryAt:number){super(code);this.code=code;this.retryAt=retryAt;}
}
export function xRetryAt(headers:Headers,now:number) {
  const retry=headers.get('retry-after'),seconds=Number(retry),date=Number.isFinite(seconds)?0:Date.parse(retry??''),reset=Number(headers.get('x-rate-limit-reset'))*1000;
  return Math.max(now+FRESH_MS,Number.isFinite(seconds)&&seconds>0?now+seconds*1000:0,Number.isFinite(date)&&date>now?date:0,Number.isFinite(reset)&&reset>now?reset:0);
}
function text(value:unknown,max:number) {return typeof value==='string'?value.slice(0,max):'';}
export function parseXPosts(value:unknown,fallback?:{id:string;username:string;name:string}):XPost[] {
  if(!value||typeof value!=='object')throw new XFeedError('invalid-response',0);
  const v=value as {data?:unknown;meta?:{result_count?:unknown};includes?:{users?:unknown}};
  if(!Array.isArray(v.data)){if(v.meta?.result_count===0)return[];throw new XFeedError('invalid-response',0);}
  const users=new Map<string,{username:string;name:string;protected?:boolean}>();
  if(fallback)users.set(fallback.id,fallback);
  if(Array.isArray(v.includes?.users))for(const raw of v.includes.users){if(raw&&typeof raw==='object'){const u=raw as Record<string,unknown>;if(typeof u.id==='string'&&typeof u.username==='string'&&/^[A-Za-z0-9_]{1,15}$/.test(u.username))users.set(u.id,{username:u.username,name:text(u.name,100),protected:u.protected===true});}}
  const posts:XPost[]=[];
  for(const raw of v.data.slice(0,5)){
    if(!raw||typeof raw!=='object')continue;const p=raw as Record<string,unknown>,author=users.get(String(p.author_id));
    if(typeof p.id!=='string'||!/^\d{1,25}$/.test(p.id)||typeof p.text!=='string'||!p.text||!author||author.protected||!Number.isFinite(Date.parse(String(p.created_at))))continue;
    posts.push({id:p.id,text:p.text.slice(0,10000),author:author.username,name:author.name,createdAt:new Date(String(p.created_at)).toISOString(),url:`https://x.com/${author.username}/status/${p.id}`});
  }
  if(v.data.length&&!posts.length)throw new XFeedError('source-unavailable',0);
  return posts;
}

export function skyXFeed(db:Database,settings:XFeedSettings,fetcher:typeof fetch=fetch,clock=Date.now) {
  const ensure=async(key:string)=>{await db.prepare('INSERT INTO sky_x_feed_state(key) VALUES(?) ON CONFLICT(key) DO NOTHING').bind(key).run();};
  const row=async(key:string)=>db.prepare('SELECT payload,remote_user_id,fetched_at,next_refresh_at,retry_after,error_code FROM sky_x_feed_state WHERE key=?').bind(key).first<Row>();
  function sourceAllowed(input:string){const source=xTimelineUrl(input);if(settings&&!settings.sources.includes(source))throw new Error('X_SOURCE_NOT_APPROVED');return source;}
  async function snapshot(input:string):Promise<XFeedSnapshot>{
    const source=sourceAllowed(input);if(!settings)return{mode:'api',posts:[],fetchedAt:0,retryAt:0,status:'api-not-configured'};
    const [cached,global]=await Promise.all([row(source),row(GLOBAL)]),now=clock();
    const posts=cached&&now-cached.fetched_at<RETENTION_MS?JSON.parse(cached.payload) as XPost[]:[];
    return{mode:'api',posts,fetchedAt:cached?.fetched_at??0,retryAt:Math.max(cached?.next_refresh_at??0,cached?.retry_after??0,global?.retry_after??0),status:cached?.error_code??(cached?.fetched_at?'ready':'not-fetched')};
  }
  async function api(path:string,query?:URLSearchParams):Promise<unknown>{
    if(!settings)throw new XFeedError('api-not-configured',0);
    const now=clock(),day=new Date(now).toISOString().slice(0,10);await ensure(GLOBAL);
    const reserved=await db.prepare('UPDATE sky_x_feed_state SET request_count=CASE WHEN window_day=? THEN request_count+1 ELSE 1 END,window_day=? WHERE key=? AND retry_after<=? AND (window_day<>? OR request_count<?)').bind(day,day,GLOBAL,now,day,settings.dailyRequests).run();
    if(reserved.meta.changes!==1){const global=await row(GLOBAL);if(global&&global.retry_after>now)throw new XFeedError('rate-limited',global.retry_after);throw new XFeedError('api-limit',Date.parse(`${day}T00:00:00Z`)+RETENTION_MS);}
    const url=new URL(path,'https://api.x.com');if(query)url.search=query.toString();
    let response:Response;
    try{response=await fetcher(url,{headers:{Authorization:`Bearer ${settings.token}`,Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(8000)});}catch{throw new XFeedError('network-error',now+FRESH_MS);}
    if(response.status===429){const retryAt=xRetryAt(response.headers,now);await db.prepare('UPDATE sky_x_feed_state SET retry_after=MAX(retry_after,?) WHERE key=?').bind(retryAt,GLOBAL).run();throw new XFeedError('rate-limited',retryAt);}
    if(!response.ok)throw new XFeedError(response.status===401||response.status===403?'auth-required':response.status===404||response.status===410?'source-unavailable':response.status===402?'credits-required':'upstream-error',now+FRESH_MS);
    const reader=response.body?.getReader();if(!reader)throw new XFeedError('invalid-response',now+FRESH_MS);
    let size=0,body='';const decoder=new TextDecoder();
    try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>256000){await reader.cancel();throw new XFeedError('response-too-large',now+FRESH_MS);}body+=decoder.decode(part.value,{stream:true});}}finally{reader.releaseLock();}
    try{return JSON.parse(body+decoder.decode());}catch{throw new XFeedError('invalid-response',now+FRESH_MS);}
  }
  async function refresh(input:string):Promise<XFeedSnapshot>{
    const source=sourceAllowed(input);if(!settings)return{mode:'api',posts:[],fetchedAt:0,retryAt:0,status:'api-not-configured'};
    await ensure(source);const now=clock(),lease=crypto.randomUUID();
    const acquired=await db.prepare('UPDATE sky_x_feed_state SET lease_id=?,lease_until=? WHERE key=? AND lease_until<=? AND retry_after<=? AND next_refresh_at<=?').bind(lease,now+60000,source,now,now,now).run();
    if(acquired.meta.changes!==1)return snapshot(source);
    try{
      const before=await row(source),parsed=new URL(source);let remoteId=before?.remote_user_id,author:{id:string;username:string;name:string}|undefined;
      if(!parsed.pathname.startsWith('/i/lists/')){
        // Recheck public visibility when refreshing, rather than retaining protected/deleted profiles.
        const result=await api(`/2/users/by/username/${parsed.pathname.slice(1)}`,new URLSearchParams({'user.fields':'protected'})) as {data?:{id?:unknown;username?:unknown;name?:unknown;protected?:unknown}};
        const u=result?.data;if(typeof u?.id!=='string'||!/^\d{1,25}$/.test(u.id)||String(u.username).toLowerCase()!==parsed.pathname.slice(1)||u.protected===true)throw new XFeedError('source-unavailable',now+FRESH_MS);
        remoteId=u.id;author={id:u.id,username:String(u.username),name:text(u.name,100)};
      }
      const path=parsed.pathname.startsWith('/i/lists/')?`/2/lists/${parsed.pathname.split('/').pop()}/tweets`:`/2/users/${remoteId}/tweets`;
      const query=new URLSearchParams({max_results:'5','tweet.fields':'created_at,author_id'});
      if(!author){query.set('expansions','author_id');query.set('user.fields','name,username,protected');}
      const posts=parseXPosts(await api(path,query),author),done=clock();
      await db.prepare('UPDATE sky_x_feed_state SET payload=?,remote_user_id=?,fetched_at=?,next_refresh_at=?,retry_after=0,error_code=NULL,lease_id=NULL,lease_until=0 WHERE key=? AND lease_id=?').bind(JSON.stringify(posts),remoteId??null,done,done+FRESH_MS,source,lease).run();
    }catch(error){const e=error instanceof XFeedError?error:new XFeedError('fetch-failed',clock()+FRESH_MS);await db.prepare("UPDATE sky_x_feed_state SET retry_after=?,error_code=?,payload=CASE WHEN ?='source-unavailable' OR ?='auth-required' THEN '[]' ELSE payload END,lease_id=NULL,lease_until=0 WHERE key=? AND lease_id=?").bind(Math.max(e.retryAt,clock()+FRESH_MS),e.code,e.code,e.code,source,lease).run();}
    return snapshot(source);
  }
  return{snapshot,refresh};
}
