/* This exact UI is served by the Mac simulator and packaged in the FiveM resource. */
const $ = id => document.getElementById(id);
const inGame = typeof GetParentResourceName === 'function';
let state;
let pending;
let busy = false;
let open = !inGame;
if (inGame) { document.documentElement.classList.add('in-game'); document.body.classList.add('embedded'); $('panel').hidden = true; $('mode').textContent = 'IN-WORLD TERMINAL · FIVEM DEVELOPMENT'; $('close').hidden = false; }
async function request(action, payload) {
  const response = await fetch(inGame ? `https://${GetParentResourceName()}/bridge` : `/sim/${action}`, {
    method: inGame || action === 'command' ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: inGame ? JSON.stringify({ action, payload }) : action === 'command' ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  const data = await response.json();
  if (data.error || !response.ok) throw Object.assign(new Error(data.error ?? '接続に失敗しました。'), { status: data.status ?? response.status });
  return data;
}
function render() {
  renderAgentTasks();
  $('cards').replaceChildren();
  for (const card of state.cards) {
    const article = document.createElement('article');
    const p = document.createElement('p'); p.className = 'card-text'; p.textContent = card.text;
    const hash = document.createElement('small'); hash.textContent = `同一カード · ${card.hash.slice(0, 16)}…`;
    const b = document.createElement('button'); b.textContent = 'このカードを確認した'; b.onclick = () => command('observe', { cardId: card.id, hash: card.hash });
    article.append(hash, p, b); $('cards').append(article);
  }
  if (!state.cards.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = '受信待ち。現実側でカードを共有すると、ここに届きます。'; $('cards').append(p); }
}
async function refresh() {
  if (!open || busy) return;
  try { state = await request('state'); render(); }
  catch (error) { $('cards').replaceChildren(); state = null; $('message').textContent = `切断中: ${error.message}`; }
}
async function sendPending() {
  if (!pending || busy) return;
  busy = true;
  try { state = await request('command', pending); pending = null; render(); $('message').textContent = '現実側へ保存しました。'; }
  catch (error) { if (error.status >= 400 && error.status < 500 && error.status !== 429) pending = null; $('message').textContent = `${error.message}。再照会するか画面を開き直してください。`; }
  finally { busy = false; $('retry').hidden = !pending; }
}
async function command(action, extra) {
  if (!state || busy || pending) return;
  busy = true;
  try {
    state = await request('state');
    pending = { id: crypto.randomUUID(), revision: state.revision, binding: state.binding, action, ...extra };
    busy = false; await sendPending();
  } catch (error) { busy = false; $('message').textContent = error.message; }
}
$('request').onsubmit = event => { event.preventDefault(); void command('draft', { text: $('request-text').value }); };
$('retry').onclick = sendPending;
$('close').onclick = async () => { open = false; $('panel').hidden = true; await request('close'); };
window.addEventListener('message', event => {
  if (!inGame || event.data?.type !== 'rockstar:open') return;
  open = true; $('panel').hidden = false; pending = null; $('retry').hidden = true; void refresh();
});
window.addEventListener('keydown', event => { if (inGame && event.key === 'Escape') $('close').click(); });
void refresh(); setInterval(refresh, 1500);

let agentListSignature = '';
function renderAgentTasks() {
  const signature=JSON.stringify(state.agents.map(a=>a.id));
  if(signature!==agentListSignature) {
    const previous=$('agents').value; $('agents').replaceChildren();
    for(const agent of state.agents){const option=document.createElement('option');option.value=agent.id;option.textContent=agent.name;$('agents').append(option);}
    if(state.agents.some(a=>a.id===previous)) $('agents').value=previous;
    agentListSignature=signature;
  }
  $('agent-description').textContent=state.agents.find(a=>a.id===$('agents').value)?.description ?? '';
  $('agent-tasks').replaceChildren();
  for(const task of [...state.tasks].reverse()) {
    const article=document.createElement('article');
    const title=document.createElement('h3');title.textContent=task.agentName;
    const p=document.createElement('p');p.className='hint';p.textContent=`仕事 ${task.id} · 第${task.round}版 · ${task.status}\n${task.approved ? '現実側で実行承認済み' : '現実側の承認待ち'}`;
    const result=document.createElement('pre');result.textContent=task.output?.text ?? task.error ?? '成果の共有待ちです。現実側で続きを扱えます。';article.append(title,p,result);$('agent-tasks').append(article);
  }
}
$('agents').onchange=()=>{ if(state) renderAgentTasks(); };
$('agent-request').onsubmit=e=>{e.preventDefault();void command('agent_request',{agentId:$('agents').value,objective:$('objective').value,text:$('material').value});};
