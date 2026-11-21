import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as profileContract from '../lib/noah-profile-contract.ts';
const code = ts.transpileModule(readFileSync(new URL('../components/noah-registration.tsx', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
const provider = { id: 'example', name: 'Example', agentIds: ['agent'], revision: 1, providerOrigin: 'https://provider.example.com', executorOrigin: 'https://executor.example.com', executorName: 'Registration Agent', termsUrl: 'https://provider.example.com/terms', termsVersion: '1', fields: [{ key: 'email', label: 'メール', type: 'email', required: true, maxLength: 100 }, { key: 'password', label: 'パスワード', type: 'password', required: true, maxLength: 100 }] };
const job = state => ({ id: 'job', providerName: 'Example', providerOrigin: provider.providerOrigin, state, expiresAt: Date.now() + 86400000, verificationUrl: provider.providerOrigin + '/verify', returnTo: '/noah/launch?agent=agent#library' });
function harness(fetcher, initial = [], profileOptions = {}) {
  let savedProfile=profileOptions.profile??null; const saves=[];
  const slots = [], effects = [], exports = {}, calls = [], storage = new Map(initial); let cursor = 0, tree;
  const timers = new Map(), listeners = new Map(); let timerId=0;
  const document = { hidden: false, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name, fn) => { if(listeners.get(name)===fn) listeners.delete(name); } };
  const jsx = (type, props) => ({ type, props });
  runInNewContext(code, { exports, URLSearchParams, Error, Date, crypto, Uint8Array, AbortController, AbortSignal, queueMicrotask, document,
    setTimeout: (fn, ms) => { const id=++timerId; timers.set(id,{fn,ms}); return id; }, clearTimeout: id => timers.delete(id),
    sessionStorage: { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) },
    fetch: async (url, options) => { calls.push({ url, options }); return fetcher(url, options); },
    require(id) {
      if(id==='./noah-locale')return {useNoahLocale:()=>({t:x=>x,locale:'ja'})};
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (id === 'react') return {
        useState(value) { const i = cursor++; slots[i] ??= { value }; return [slots[i].value, v => { slots[i].value = typeof v === 'function' ? v(slots[i].value) : v; }]; },
        useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
        useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, n) => v !== old.deps[n])) { slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } },
      };
      if (id === './use-noah-profile') return {useNoahProfile:()=>({profile:savedProfile,guest:!savedProfile,error:'',save:async body=>{saves.push(body);if(profileOptions.fail)return null;savedProfile={...savedProfile,fields:body.fields,revision:savedProfile.revision+1,reuseEnabled:body.reuse};return savedProfile;}})};
      if (id === '@/lib/noah-profile-contract') return profileContract;
      if (id === '@/lib/owner-intent') return {OWNER_SCOPE_HEADER:'X-Rock-Owner-Scope'};
      if(id==='@/lib/noah-haptics')return {noahHaptic:()=>false};
      if (id === './noah-loading') return { default: 'noah-loading' };
      if (id === 'next/link') return { default: 'a' };
      if (id === 'lucide-react') return new Proxy({}, { get: (_, key) => String(key) });
      if (id.endsWith('.module.css')) return { default: {} };
      throw Error(id);
    },
  });
  const render = () => { cursor = 0; tree = exports.default({ agentId: 'agent' }); effects.splice(0).forEach(fn => fn()); };
  const walk = value => Array.isArray(value) ? value.flatMap(walk) : value && typeof value === 'object' ? [value, ...walk(value.props?.children)] : [];
  const text = value => Array.isArray(value) ? value.map(text).join('') : value && typeof value === 'object' ? text(value.props?.children) : value == null || typeof value === 'boolean' ? '' : String(value);
  const button = label => { const n = walk(tree).find(n => n.type === 'button' && text(n).includes(label)); assert.ok(n, label); return n; };
  render();
  return { calls, saves, storage, timers, document,
    async tick() { const tasks=[...timers]; timers.clear(); for(const [,task] of tasks) await task.fn(); await this.flush(); },
    async visibility(hidden) { document.hidden=hidden; listeners.get('visibilitychange')?.(); await this.flush(); },
    nodes: () => walk(tree), text: () => text(tree), button,
    async flush() { for (let n=0;n<4;n++) { await new Promise(setImmediate); render(); } },
    input(name,value) { const n = walk(tree).find(n => n.type === 'input' && n.props.name === name); assert.ok(n); n.props.onChange({ target:{value} }); render(); },
    check(label) { const n = walk(tree).find(n => n.type === 'label' && text(n).includes(label)); const input = walk(n).find(n => n.type === 'input'); input.props.onChange({target:{checked:true}}); render(); },
    submit() { walk(tree).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); render(); },
    click(label) { const n = button(label); assert.ok(!n.props.disabled); n.props.onClick(); render(); },
    close() { slots.forEach(s => s.cleanup?.()); },
  };
}
const config = () => Response.json({providers:[provider]});
function fill(h) { h.input('email','synthetic@example.com'); h.input('password','synthetic-private-value'); }
void test('registration button grants visible recipient and terms consent, submits once, and stores only the capability', async t => {
  const h = harness(async (_u,o) => o.method === 'POST' ? Response.json({job:job('needs_user')}) : config()); t.after(() => h.close()); await h.flush();
  assert.equal(h.button('同意して登録').props.disabled,true); h.submit(); await h.flush(); assert.equal(h.calls.filter(c=>c.options.method==='POST').length,0);
  fill(h);
  assert.match(h.text(), /https:\/\/executor.example.com/); assert.doesNotMatch(h.text(), /synthetic-private-value/);
  assert.ok(h.nodes().some(n=>n.props?.href===provider.termsUrl));
  assert.match(h.text(),/登録ボタンで、規約と上記情報の送信に同意/);
  assert.equal(h.nodes().filter(n=>n.type==='input'&&n.props.type==='checkbox').length,0);
  assert.equal(h.calls.filter(c=>c.options.method==='POST').length,0);
  assert.equal(h.button('同意して登録').props.disabled,false); h.submit(); await h.flush();
  const post = h.calls.find(c => c.options.method==='POST'), body = JSON.parse(post.options.body);
  assert.equal(body.values.email,'synthetic@example.com'); assert.equal(body.values.password,'synthetic-private-value'); assert.equal(body.termsAccepted,true); assert.equal(body.agentId,'agent');
  assert.match(post.options.headers['X-Noah-Registration-Key'],/^[a-f0-9]{64}$/); assert.doesNotMatch(post.url,/synthetic|key=/);
  const saved = JSON.parse([...h.storage.values()][0]); assert.deepEqual(Object.keys(saved).sort(),['id','key']); assert.doesNotMatch(JSON.stringify([...h.storage]),/synthetic/);
  assert.match(h.text(),/本人による確認を待っています/); assert.ok(h.nodes().some(n=>n.props?.href === job('needs_user').verificationUrl)); assert.equal(h.nodes().filter(n=>n.type==='input').length,0);
});
void test('lost submission response offers status-only recovery and never resends credentials', async t => {
  const h = harness(async (u,o) => { if(o.method==='POST') throw Error('Connection lost'); return u.includes('?job=') ? Response.json({job:job('completed')}) : config(); }); t.after(()=>h.close()); await h.flush(); fill(h); h.submit(); await h.flush();
  assert.equal(h.nodes().filter(n=>n.type==='input').length,0); h.click('登録の状況を確認'); await h.flush();
  assert.equal(h.calls.filter(c=>c.options.method==='POST').length,1); assert.equal(h.calls.at(-1).options.body,undefined); assert.match(h.text(),/完了報告/); assert.ok(h.nodes().some(n=>n.props?.href===job('completed').returnTo));
});
void test('restored browser capability only checks an existing job; an empty registry collects no information', async t => {
  const capability = {id:crypto.randomUUID(),key:'b'.repeat(64)};
  const h = harness(async u => u.includes('?job=') ? Response.json({job:job('running')}) : Response.json({providers:[]}), [['noah-registration-work-v1',JSON.stringify(capability)]]); t.after(()=>h.close()); await h.flush();
  h.click('登録の状況を確認'); await h.flush(); assert.equal(h.calls.at(-1).options.headers['X-Noah-Registration-Key'],capability.key); assert.equal(h.calls.some(c=>c.options.method==='POST'),false);
  h.click('ブラウザの確認情報を消す'); await h.flush(); assert.equal(h.storage.size,0); assert.match(h.text(),/準備中/); assert.equal(h.nodes().filter(n=>n.type==='input').length,0);
});
void test('editing before the consent button sends the latest values without an earlier dispatch', async t => {
  const h = harness(async (_u,o)=>o.method==='POST'?Response.json({job:job('running')}):config()); t.after(()=>h.close()); await h.flush(); fill(h);
  h.input('email','changed@example.com'); assert.equal(h.calls.filter(c=>c.options.method==='POST').length,0);
  h.submit(); await h.flush();
  const posts=h.calls.filter(c=>c.options.method==='POST'); assert.equal(posts.length,1); assert.equal(JSON.parse(posts[0].options.body).values.email,'changed@example.com');
  assert.equal(JSON.parse(posts[0].options.body).consent,true);
});

void test('registration resumes status checks and checks again on return without resending any registration', async t => {
  const capability={id:crypto.randomUUID(),key:'c'.repeat(64)};
  let state='needs_user';
  const h=harness(async u=>u.includes('?job=') ? Response.json({job:job(state)}) : config(), [['noah-registration-work-v1',JSON.stringify(capability)]]);
  t.after(()=>h.close()); await h.flush(); await h.tick();
  assert.match(h.text(), /本人による確認を待っています/);
  const before=h.calls.length;
  await h.visibility(true); await h.tick(); assert.equal(h.calls.length,before);
  state='completed'; await h.visibility(false);
  assert.match(h.text(), /完了報告/); assert.ok(h.nodes().some(n=>n.props?.href===job('completed').returnTo));
  assert.equal(h.calls.filter(c=>c.options.method==='POST').length,0);
  assert.equal(h.timers.size,0);
});
void test('registration status polling stops after a bounded number of reads and clears on unmount', async t => {
  const capability={id:crypto.randomUUID(),key:'d'.repeat(64)};
  let reads=0;
  const h=harness(async u=>u.includes('?job=') ? Response.json({job:job(++reads%2 ? 'running' : 'needs_user')}) : config(), [['noah-registration-work-v1',JSON.stringify(capability)]]);
  t.after(()=>h.close()); await h.flush();
  for(let i=0;i<20;i++) await h.tick();
  // Even when the state changes, automatic reads stay bounded.
  assert.ok(h.calls.filter(c=>c.url.includes('?job=')).length<=12);
  assert.equal(h.timers.size,0);
  h.close(); assert.equal(h.timers.size,0);
});

void test('saved fields are reused by reference; only missing values are entered and consent saves them once', async t=>{
  const p={...provider,fields:[{...provider.fields[0],profileField:'email'},{key:'name',label:'氏名',type:'text',required:true,maxLength:120,profileField:'name'}]};
  const h=harness(async(_u,o)=>o.method==='POST'?Response.json({job:job('running')}):Response.json({providers:[p]}),[],{profile:{...profileContract.emptyNoahProfile(),available:true,ownerScope:'owner-a',revision:2,reuseEnabled:true,fields:{email:'saved@example.com'}}});t.after(()=>h.close());await h.flush();
  assert.equal(h.nodes().filter(n=>n.type==='input'&&n.props.name==='email').length,0);
  assert.match(h.text(),/保存した情報/); assert.equal(h.saves.length,0);
  h.input('name','Test Name');h.submit();await h.flush();
  assert.equal(h.saves.length,1);assert.equal(h.saves[0].consentVersion,profileContract.PROFILE_CONSENT_VERSION);assert.equal(h.saves[0].reuse,true);
  const post=h.calls.find(c=>c.options.method==='POST'),body=JSON.parse(post.options.body);
  assert.equal(post.options.headers['X-Rock-Owner-Scope'],'owner-a');assert.deepEqual(body.profile.fields,['email']);assert.equal(body.profile.revision,3);
  assert.deepEqual(body.values,{name:'Test Name'});assert.equal(body.termsAccepted,true);
});
void test('failed saving retains typed input and never starts registration',async t=>{
  const p={...provider,fields:[{...provider.fields[0],profileField:'email'}]};
  const h=harness(async()=>Response.json({providers:[p]}),[],{fail:true,profile:{...profileContract.emptyNoahProfile(),available:true,ownerScope:'owner-a'}});t.after(()=>h.close());await h.flush();h.input('email','retry@example.com');h.submit();await h.flush();
  assert.equal(h.calls.filter(c=>c.options.method==='POST').length,0);assert.equal(h.nodes().find(n=>n.type==='input').props.value,'retry@example.com');
});

void test('a confirmed failure returns to input without a dispatch or losing its receipt; unknown cannot retry',async t=>{
 const ticket={id:'00000000-0000-4000-8000-000000000099',key:'a'.repeat(64)};
 const respond=(url)=>Response.json(url.includes('?job=')?{job:{...job('failed'),id:ticket.id}}:{providers:[provider]});
 const h=harness(respond,[['noah-registration-work-v1',JSON.stringify(ticket)]]);t.after(()=>h.close());await h.flush();await h.tick();
 h.click('もう一度');await h.flush();assert.ok(h.nodes().some(n=>n.type==='form'));assert.match(h.text(),/以前の登録/);
 assert.equal(JSON.parse(h.storage.get('noah-registration-work-v1-history'))[0].key,ticket.key);
 assert.equal(h.calls.some(c=>c.options?.method==='POST'),false);
 const restored=harness(respond,[...h.storage]);t.after(()=>restored.close());await restored.flush();restored.click('登録の状況を確認');await restored.flush();await restored.tick();
 assert.match(restored.text(),/登録を完了できませんでした/);assert.equal(restored.calls.some(c=>c.options?.method==='POST'),false);
 const unknown=harness(url=>Response.json(url.includes('?job=')?{job:job('unknown')}:{providers:[provider]}),[['noah-registration-work-v1',JSON.stringify(ticket)]]);t.after(()=>unknown.close());await unknown.flush();await unknown.tick();
 assert.equal(unknown.nodes().some(n=>n.type==='button'&&n.props.onClick?.name==='retryFailed'),false);
});
