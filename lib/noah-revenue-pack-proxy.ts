const ORIGIN='https://avokado-noah-revenue-runtime.mr-kirin999.workers.dev';
const COOKIE='__Host-noah-revenue';
const METHODS:Record<string,string>={status:'GET',example:'GET',pair:'POST',run:'POST',stop:'POST',logout:'POST'};
const json=(error:string,status:number)=>Response.json({error},{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}});
/** Fixed private service bridge. Never forwards Noah account credentials or exposes admin pairing. */
export async function revenuePackProxy(request:Request,action:string,fetcher:typeof fetch=fetch){
  if(!Object.hasOwn(METHODS,action))return json('見つかりません。',404);
  if(request.method!==METHODS[action])return json('操作を確認してください。',405);
  const origin=new URL(request.url).origin;
  if(request.headers.get('sec-fetch-site')==='cross-site'||(request.method==='POST'&&request.headers.get('origin')!==origin))return json('このNoah画面から操作してください。',403);
  const secret=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length+1);
  if(action!=='pair'&&(!secret||!/^[a-f0-9]{64}$/.test(secret)))return json('このブラウザを本人用収益パックへ接続してください。',401);
  let body:string|undefined;
  if(request.method==='POST'){
    if(!request.headers.get('content-type')?.startsWith('application/json'))return json('JSONで送信してください。',415);
    const reader=request.body?.getReader();if(!reader)return json('入力がありません。',400);const decoder=new TextDecoder();let size=0;body='';
    for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>16384){await reader.cancel();return json('入力が大きすぎます。',413);}body+=decoder.decode(part.value,{stream:true});}body+=decoder.decode();
  }
  try{
    const response=await fetcher(`${ORIGIN}/api/${action}`,{method:request.method,redirect:'manual',signal:AbortSignal.timeout(20000),headers:{Origin:ORIGIN,'Content-Type':'application/json',...(secret&&/^[a-f0-9]{64}$/.test(secret)?{Cookie:`${COOKIE}=${secret}`}:{})},body});
    if(response.status>=300&&response.status<400){await response.body?.cancel();return json('接続先の転送を拒否しました。',502);}
    if(!response.headers.get('content-type')?.includes('application/json')){await response.body?.cancel();return json('クラウドの応答を確認できません。',502);}
    const headers=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store',Vary:'Cookie','X-Content-Type-Options':'nosniff'});
    const set=response.headers.get('set-cookie');
    if(response.ok&&['pair','logout'].includes(action)&&set&&/^__Host-noah-revenue=(?:[a-f0-9]{64})?; Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=(?:2592000|0)$/.test(set))headers.set('Set-Cookie',set);
    return new Response(response.body,{status:response.status,headers});
  }catch{return json('クラウドに接続できません。状態を再確認してください。',503);}
}
