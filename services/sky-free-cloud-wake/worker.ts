// No prompt, user identity, or model credentials leave the Site for this wake worker.
export default {
 async scheduled(_event:ScheduledController,env:{SKY_FREE_CLOUD_WAKE_KEY:string}){
  const timestamp=String(Date.now());
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.SKY_FREE_CLOUD_WAKE_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${timestamp}\nPOST\n/api/llm/free-cloud/tick\n{}`))),x=>x.toString(16).padStart(2,'0')).join('');
  const r=await fetch('https://avoado.si/api/llm/free-cloud/tick',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json','x-sky-time':timestamp,'x-sky-signature':signature},body:'{}',signal:AbortSignal.timeout(240000)});
  if(!r.ok)throw Error(`Sky wake HTTP ${r.status}`);
  console.log(JSON.stringify(await r.json()));
 }
};
