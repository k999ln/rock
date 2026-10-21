// Disposable loopback Worker only. Never creates synthetic public accounts.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base=new URL(process.argv[2]??'http://127.0.0.1:3037');
assert.ok(base.protocol==='http:'&&['127.0.0.1','localhost'].includes(base.hostname),'Disposable loopback only');
let checks=0;const check=(v,n)=>{checks++;assert.ok(v,n);};
class Browser{
 cookies=new Map();
 async call(method,path,body,extra={}){
  const r=await fetch(new URL(path,base),{method,redirect:'error',headers:{Origin:base.origin,Cookie:[...this.cookies].map(([k,v])=>k+'='+v).join('; '),...(body?{'Content-Type':'application/json'}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})});
  for(const c of r.headers.getSetCookie()){const first=c.split(';')[0],i=first.indexOf('=');if(/Max-Age=0(?:;|$)/i.test(c))this.cookies.delete(first.slice(0,i));else this.cookies.set(first.slice(0,i),first.slice(i+1));}
  return {status:r.status,body:await r.json(),headers:r.headers};
 }
}
const a=new Browser(),b=new Browser();const name='fixture_'+randomUUID().slice(0,8),password='fixture correct horse battery 2026';
const signup=await a.call('POST','/api/os/access',{action:'password',mode:'signup',handle:name,password});
check(signup.status===200,'password signup on actual Worker');check(signup.body.recoveryCode.startsWith('rock_recovery_'),'one-time recovery code');
const first=await a.call('GET','/api/os/access');check(first.body.signedIn&&first.body.method==='password','independent identity without gateway');check(first.body.passwordLogin.handle===name,'own login handle');const scope=first.body.storageScope;
const thread=randomUUID();const saved=await a.call('PUT','/api/eve/history',{session:{version:1,id:thread,toolId:'sky-auto',createdAt:Date.now(),messages:[{id:'fixture',side:'me',text:'[合成API試験] password continuation'}],activeRequest:null,workflowStatus:'ready',outcome:null},revision:0,remember:true});check(saved.status===200,'encrypted Eve history saved');
const signupB=await b.call('POST','/api/os/access',{action:'password',mode:'signup',handle:name+'_b',password});check(signupB.status===200,'second owner');check((await b.call('GET','/api/eve/history?id='+thread)).status===404,'second owner cannot read first history');
const oldCookie=new Map(a.cookies);check((await a.call('DELETE','/api/os/access')).status===200,'logout');check((await a.call('GET','/api/eve/history')).status===401,'logged-out history denied');
const wrong=await a.call('POST','/api/os/access',{action:'password',mode:'login',handle:name,password:password+' wrong'});check(wrong.status===401,'wrong password denied');
const login=await a.call('POST','/api/os/access',{action:'password',mode:'login',handle:name,password});check(login.status===200,'password re-login');check((await a.call('GET','/api/os/access')).body.storageScope===scope,'same owner after re-login');check((await a.call('GET','/api/eve/history?id='+thread)).status===200,'same Eve history');
const cross=await a.call('POST','/api/os/access',{action:'password',mode:'login',handle:name,password},{Origin:'https://attacker.invalid'});check(cross.status===403,'cross-origin denied');
const recovered=await a.call('POST','/api/os/access',{action:'password',mode:'recover',handle:name,password:password+' new',recoveryCode:signup.body.recoveryCode,confirmRevoke:true});check(recovered.status===200,'recovery');check((await a.call('GET','/api/os/access')).body.storageScope===scope,'recovery owner preserved');check((await a.call('GET','/api/eve/history?id='+thread)).status===200,'history retained after recovery');
const old=new Browser();old.cookies=oldCookie;check((await old.call('GET','/api/eve/history')).status===401,'old session revoked');
const current=await a.call('GET','/api/eve/history?id='+thread);
check((await a.call('DELETE','/api/eve/history',{id:thread,revision:current.body.revision,confirm:'delete-history'})).status===200,'fixture history tombstoned');
const bad=new Browser();bad.cookies.set('rockstar_account_access','bad');check((await bad.call('GET','/api/os/access',null,{'oai-authenticated-user-id':'fixture-legacy'})).body.signedIn===false,'invalid password cookie cannot fall through to gateway');
check((await a.call('DELETE','/api/os/access')).status===200,'final logout');
console.log('PASS password Worker/D1: '+checks+' assertions. Synthetic loopback only.');
