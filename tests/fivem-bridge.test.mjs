import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { BridgeStore, digest } from '../toolkits/fivem-bridge/store.mjs';
import { createBridgeServer } from '../toolkits/fivem-bridge/server.mjs';
const binding = { mode: 'fixture', server: 'test', player: 'alice', resource: 'rockstar_bridge', version: 1 };
function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'rock-bridge-'));
  const path = join(dir, 'state.sqlite');
  let now = 1000;
  const store = new BridgeStore(path, binding, () => now);
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  const input = (action, extra = {}) => ({ id: randomUUID(), revision: store.snapshot('alice').revision, binding, action, ...extra });
  const send = (action, extra = {}, actor = 'os') => store.command('alice', actor, input(action, extra));
  const card = () => store.snapshot('alice').cards[0];
  return { store, path, input, send, card, tick: () => { now += 300001; } };
}
void test('same artifact round trip uses existing workflow, requires OS review, and survives reopen', async t => {
  const x = setup(t);
  await x.send('draft', { text: '音と光のアイデア <script>plain text</script>' });
  const cardId = x.card().id;
  await x.send('publish', { cardId });
  assert.equal(x.card().job.status, 'review');
  await assert.rejects(x.send('complete', { cardId }), /同一カード/);
  await x.send('observe', { cardId, hash: x.card().hash }, 'game');
  assert.equal(x.card().status, 'observed');
  assert.equal(x.card().job.status, 'review');
  await assert.rejects(x.send('complete', { cardId }, 'game'), /現実側/);
  await x.send('complete', { cardId });
  assert.equal(x.card().job.status, 'completed');
  const restored = new BridgeStore(x.path, binding, () => 2000);
  assert.deepEqual(restored.snapshot('alice'), x.store.snapshot('alice'));
  restored.close();
});
void test('game-origin drafts cannot grant execution or publication and other owners/players cannot access them', async t => {
  const x = setup(t);
  await x.send('draft', { text: '部屋の照明プランを考えたい' }, 'game');
  assert.equal(x.card().job, null);
  await assert.rejects(x.send('publish', { cardId: x.card().id }, 'game'), /現実側/);
  assert.deepEqual(x.store.snapshot('bob').cards, []);
  await assert.rejects(x.store.command('bob', 'game', { ...x.input('observe'), revision: 0, cardId: x.card().id, hash: 'bad' }), /見つかりません/);
  await assert.rejects(x.store.command('alice', 'game', { ...x.input('draft'), text: 'x', binding: { ...binding, player: 'bob' } }), /接続先/);
  await assert.rejects(x.send('execute', { cardId: x.card().id }, 'game'), /許可/);
});
void test('retries are idempotent after persistence and collisions, stale revisions, changed profiles fail closed', async t => {
  const x = setup(t);
  const op = x.input('draft', { text: 'hello' });
  await x.store.command('alice', 'os', op);
  await x.store.command('alice', 'os', op);
  assert.equal(x.store.snapshot('alice').cards.length, 1);
  await assert.rejects(x.store.command('alice', 'os', { ...op, text: 'different' }), /操作ID/);
  await assert.rejects(x.store.command('alice', 'os', { ...op, id: randomUUID() }), /更新/);
  const restored = new BridgeStore(x.path, binding, () => 1000);
  await restored.command('alice', 'os', op);
  assert.equal(restored.snapshot('alice').revision, 1); restored.close();
  const incompatible = new BridgeStore(x.path, { ...binding, version: 2 });
  assert.throws(() => incompatible.snapshot('alice'), /接続条件/); incompatible.close();
});
void test('altered hash, expiration, cancellation and invalid payloads do not create a success receipt', async t => {
  const x = setup(t);
  await assert.rejects(x.send('draft', { text: 'あ'.repeat(1400) }), /4096/);
  await assert.rejects(x.store.command('alice', 'os', { ...x.input('draft', { text: 'ok' }), shell: 'ignored?' }), /未対応/);
  await x.send('draft', { text: 'card' });
  const cardId = x.card().id;
  await x.send('publish', { cardId });
  await assert.rejects(x.send('observe', { cardId, hash: 'forged' }, 'game'), /hash/);
  x.tick();
  assert.equal(x.store.gameSnapshot('alice').cards.length, 0);
  await assert.rejects(x.send('observe', { cardId, hash: x.card().hash }, 'game'), /期限/);
  await x.send('cancel', { cardId });
  assert.equal(x.card().job.status, 'cancelled');
  assert.equal(x.card().receipt, null);
  await assert.rejects(x.send('complete', { cardId }), /同一カード/);
});
void test('HTTP enforces session, same-origin, mode, and persists an end-to-end host round trip', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'rock-http-'));
  const x = createBridgeServer({ path: join(dir, 'db.sqlite'), port: 0 });
  const address = await x.listen(); const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await new Promise(r => x.server.close(r)); x.store.close(); rmSync(dir, { recursive: true, force: true }); });
  assert.equal((await fetch(`${base}/api/state`)).status, 401);
  const page = await fetch(base); const cookie = page.headers.get('set-cookie').split(';')[0];
  const headers = { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' };
  const read = async actor => (await fetch(`${base}/${actor}/state`, { headers })).json();
  const send = async (actor, action, extra = {}) => {
    const state = await read(actor);
    return fetch(`${base}/${actor}/command`, { method: 'POST', headers, body: JSON.stringify({ id: randomUUID(), revision: state.revision, binding: state.binding, action, ...extra }) });
  };
  assert.equal((await fetch(`${base}/api/state`, { headers: { ...headers, Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await fetch(`${base}/bridge/state`, { headers: { Authorization: 'Bearer invalid' } })).status, 403);
  assert.equal((await send('sim', 'draft', { text: 'game to real' })).status, 200);
  let state = await read('api'); const cardId = state.cards[0].id;
  assert.equal(state.cards[0].job, null);
  await send('api', 'publish', { cardId }); state = await read('sim');
  assert.equal(state.cards[0].text, 'game to real');
  await send('sim', 'observe', { cardId, hash: state.cards[0].hash });
  await send('api', 'complete', { cardId });
  assert.equal((await read('api')).cards[0].job.status, 'completed');
  assert.equal(await (await fetch(`${base}/ui.js`)).text(), readFileSync(new URL('../toolkits/fivem-bridge/resource/ui/ui.js', import.meta.url), 'utf8'));
});
void test('packaged FiveM server binds actual source identity and talks to the same HTTP gateway (mock runtime)', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'rock-fivem-'));
  const player = 'license:abcdef123456'; const gameToken = 'test-only-not-real-credential-12345678';
  const x = createBridgeServer({ path: join(dir, 'db.sqlite'), mode: 'fivem', player, gameToken, port: 0 });
  const address = await x.listen(); const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await new Promise(r => x.server.close(r)); x.store.close(); rmSync(dir, { recursive: true, force: true }); });
  const state = x.store.snapshot('local-developer');
  const id = randomUUID();
  await x.store.command('local-developer', 'os', { id, revision: 0, binding: state.binding, action: 'draft', text: 'FiveM adapter test' });
  await x.store.command('local-developer', 'os', { id: randomUUID(), revision: 1, binding: state.binding, action: 'publish', cardId: id });
  const handlers = {}; const replies = []; const globals = { source: 7 };
  vm.runInNewContext(readFileSync(new URL('../toolkits/fivem-bridge/resource/server.js', import.meta.url), 'utf8'), {
    require: createRequire(import.meta.url), fetch, AbortSignal, Date, global: globals,
    GetPlayerIdentifierByType: source => source === 7 ? player : 'license:other',
    GetConvar: name => ({ rock_bridge_player: player, rock_bridge_token: gameToken, rock_bridge_port: String(address.port) })[name],
    onNet: (name, handler) => { handlers[name] = handler; }, on: () => {}, emitNet: (...args) => replies.push(args),
  });
  await handlers['rockstar:request']('1', 'state');
  assert.equal(replies[0][1], 7);
  assert.equal(replies[0][3].cards[0].text, 'FiveM adapter test');
  globals.source = 8;
  await handlers['rockstar:request']('2', 'state');
  assert.equal(replies[1][3].status, 403);
  const headers = { Authorization: `Bearer ${gameToken}`, 'X-Rock-Player': digest(player) };
  assert.equal((await fetch(`${base}/bridge/state`, { headers })).status, 200);
  assert.equal((await fetch(`${base}/bridge/state`, { headers: { ...headers, 'X-Rock-Player': 'fake' } })).status, 403);
  assert.equal((await fetch(`${base}/game`)).status, 403);
});
void test('concurrent writes reject stale revisions and only one live card can be published', async t => {
  const x = setup(t);
  const a = x.input('draft', { text: 'first' });
  const b = x.input('draft', { text: 'second' });
  const outcomes = await Promise.allSettled([x.store.command('alice', 'os', a), x.store.command('alice', 'os', b)]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  await x.send('draft', { text: 'second' });
  const cards = x.store.snapshot('alice').cards;
  await x.send('publish', { cardId: cards[0].id });
  await assert.rejects(x.send('publish', { cardId: cards[1].id }), /先のカード/);
  await x.send('cancel', { cardId: cards[0].id });
  await assert.rejects(x.send('observe', { cardId: cards[0].id, hash: x.card().hash }, 'game'), /停止済み/);
  await x.send('publish', { cardId: cards[1].id });
  assert.equal(x.store.gameSnapshot('alice').cards.length, 1);
});
void test('packaged client releases focus and always answers NUI callbacks in the mock runtime', () => {
  const events = {}; const network = {}; const commands = {}; const timers = new Map(); const focus = []; let timerId = 0; let sent;
  vm.runInNewContext(readFileSync(new URL('../toolkits/fivem-bridge/resource/client.js', import.meta.url), 'utf8'), {
    RegisterCommand: (name, callback) => { commands[name] = callback; }, SetNuiFocus: (...args) => focus.push(args), SendNuiMessage: () => {},
    RegisterNuiCallbackType: () => {}, on: (name, callback) => { events[name] = callback; }, onNet: (name, callback) => { network[name] = callback; },
    emitNet: (...args) => { sent = args; }, GetCurrentResourceName: () => 'rockstar_bridge',
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; }, clearTimeout: id => timers.delete(id),
  });
  commands.rockos(); assert.deepEqual(focus.at(-1), [true, true]);
  let reply;
  events['__cfx_nui:bridge']({ action: 'state' }, value => { reply = value; });
  network['rockstar:response'](sent[1], { cards: [] });
  assert.deepEqual(reply, { cards: [] });
  assert.equal(timers.size, 0);
  events['__cfx_nui:bridge']({ action: 'close' }, value => { reply = value; });
  assert.equal(reply.ok, true); assert.deepEqual(focus.at(-1), [false, false]);
  events['__cfx_nui:bridge']({ action: 'state' }, value => { reply = value; });
  for (const timer of timers.values()) timer();
  assert.equal(reply.status, 504);
});

void test('game Agent job executes real local tool, continues same job, shares explicitly and persists', async t => {
  const x=setup(t);
  const op=x.input('agent_request',{agentId:'local:mr-citations',objective:'出典整理',text:'本文（出典: [参考](https://example.com)）'});
  await x.store.command('alice','game',op);
  await x.store.command('alice','game',op);
  const taskId=op.id;
  assert.equal(x.store.snapshot('alice').tasks.length,1);
  for(const action of ['agent_run','agent_share','agent_complete','agent_cancel','agent_continue']) await assert.rejects(x.send(action,{taskId},'game'),/現実側/);
  await x.send('agent_run',{taskId});
  let task=x.store.snapshot('alice').tasks[0];
  assert.equal(task.job.status,'review');
  assert.match(task.output.text,/出典/);
  assert.equal(x.store.gameSnapshot('alice').tasks[0].output,null);
  await x.send('agent_share',{taskId});
  assert.equal(x.store.gameSnapshot('alice').tasks[0].output.text,task.output.text);
  await x.send('agent_continue',{taskId,objective:'追記',text:'次の資料 https://example.org'});
  task=x.store.snapshot('alice').tasks[0];
  assert.equal(task.job.id,taskId);assert.equal(task.round,2);assert.equal(task.history.length,1);
  assert.equal(x.store.gameSnapshot('alice').tasks[0].output,null);
  assert.equal(JSON.stringify(x.store.gameSnapshot('alice')).includes('次の資料'),false);
  await x.send('agent_run',{taskId});await x.send('agent_complete',{taskId});
  const restored=new BridgeStore(x.path,binding,()=>2000);
  assert.equal(restored.snapshot('alice').tasks[0].job.status,'completed');restored.close();
  assert.deepEqual(x.store.snapshot('bob').tasks,[]);
});

void test('custom Agent is allowlisted and game cannot create it; failures never pass',async t=>{
 const x=setup(t);const agent={name:'資料整理',tools:['mr-citations'],configs:[{}],inputKind:'text'};
 await assert.rejects(x.send('agent_create',{agent},'game'),/現実側/);
 await assert.rejects(x.send('agent_create',{agent:{...agent,tools:['shell']}}));
 await x.send('agent_create',{agent});
 const created=x.store.snapshot('alice').agents.find(a=>a.id.startsWith('custom:'));
 assert.ok(created);
 await x.send('agent_request',{agentId:created.id,objective:'整理',text:'hello'},'game');
 const taskId=x.store.snapshot('alice').tasks[0].id;
 await x.send('agent_cancel',{taskId});await assert.rejects(x.send('agent_run',{taskId}));
 await x.send('agent_request',{agentId:'local:mr-free-article',objective:'記事',text:'test'},'game');
 const id=x.store.snapshot('alice').tasks[1].id;
 await x.send('agent_run',{taskId:id});
 const failed=x.store.snapshot('alice').tasks[1];
 assert.ok(failed.error || failed.output?.status!=='passed');
 await assert.rejects(x.send('agent_complete',{taskId:id}));
});

void test('Sky directory stays read-only, sanitizes all registered agents and never follows redirects',async()=>{
 const {skyDirectory}=await import('../toolkits/fivem-bridge/sky-directory.mjs');
 assert.equal((await skyDirectory()()).status,'not_configured');
 let calls=0;
 const directory=skyDirectory({origin:'https://sky.example',token:'rock_session_test',fetchImpl:async(url,options)=>{
  calls++;assert.equal(url,'https://sky.example/api/sky/a2a-agents');assert.equal(options.redirect,'error');
  return {ok:true,json:async()=>({agents:[{id:'a',agentName:'One',cardJson:'private'},{id:'b',agentName:'Two'}]})};
 }});
 const result=await directory();assert.equal(result.agents.length,2);assert.equal(result.agents[0].executable,false);assert.equal(JSON.stringify(result).includes('private'),false);
 await directory();assert.equal(calls,1);
 const invalid=skyDirectory({origin:'http://sky.example',token:'rock_session_test',fetchImpl:()=>{throw new Error('must not fetch');}});
 assert.equal((await invalid()).status,'unavailable');
});

void test('FivePlay adapter background connects to real gateway, isolates sender, replays exact request and cannot execute',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'fiveplay-test-'));const token='test-token-'.repeat(4);
 const instance=createBridgeServer({path:join(dir,'db.sqlite'),mode:'fiveplay',gameToken:token,port:0});
 const addr=await instance.listen();const base=`http://127.0.0.1:${addr.port}`;
 t.after(()=>{instance.server.close();instance.store.close();rmSync(dir,{recursive:true,force:true});});
 let handler;const memory={token};const chrome={runtime:{id:'a'.repeat(32),onMessage:{addListener:fn=>{handler=fn;}}},storage:{session:{get:async key=>({[key]:memory[key]}),set:async value=>Object.assign(memory,value)}}};
 const script=readFileSync(new URL('../toolkits/fiveplay-adapter/background.js',import.meta.url),'utf8');
 vm.runInNewContext(script,{chrome,URL,AbortSignal,fetch:(url,init)=>fetch(url.replace('http://127.0.0.1:5217',base),init)});
 const sender={id:chrome.runtime.id,frameId:0,tab:{id:1},url:'https://fiveplay.lol/?low=1'};
 const call=message=>new Promise(resolve=>handler(message,sender,resolve));
 assert.equal(handler({action:'state'},{...sender,url:'https://evil.example'},()=>{}),undefined);
 const state=(await call({action:'state'})).data;
 assert.equal(state.binding.mode,'fiveplay');assert.equal(state.agents.some(a=>'configs' in a),false);
 const input={id:randomUUID(),agentId:'local:mr-citations',objective:'資料整理',text:'example'};
 assert.ok((await call({action:'request',input})).data);
 assert.ok((await call({action:'request',input})).data);
 assert.equal(instance.store.snapshot('local-developer').tasks.length,1);
 const rejected=await fetch(`${base}/bridge/command`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({action:'agent_run'})});assert.equal(rejected.status,403);
 const malicious=await fetch(`${base}/bridge/state`,{headers:{Authorization:`Bearer ${token}`,Origin:'https://fiveplay.lol'}});assert.equal(malicious.status,403);
});
