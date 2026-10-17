const $ = id => document.getElementById(id);
let state;
let pending;
let busy = false;
let displayed = -1;
const labels = { draft: '共有前の下書き', sent: '送信待ち／相手の確認待ち', observed: 'ゲーム側の確認を受信', completed: '現実側の検収済み', cancelled: '停止済み' };
async function refresh() {
  try {
    const response = await fetch('/api/state');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    state = data;
    $('environment').textContent = data.binding.mode === 'fixture' ? 'MAC FIXTURE · ゲーム側は試験用表示です。実FiveMには未接続。' : data.binding.mode === 'fiveplay' ? 'FIVEPLAY · 拡張からの仕事受付。ゲーム状態・通貨・skin APIは未接続。' : 'FIVEM DEVELOPMENT · 管理者設定のplayerへの限定接続。実ゲーム受入は別途必要です。';
    if (data.binding.mode !== 'fixture') document.querySelector('iframe').hidden = true;
    $('sky-status').textContent = state.sky?.message ?? 'Sky外部接続を確認中';
    if (displayed === state.revision && !state.cards.some(c => c.status === 'sent')) return;
    const taskChanged = displayed !== state.revision;
    displayed = state.revision;
    if (taskChanged) renderTasks();
    $('cards').replaceChildren();
    for (const card of [...state.cards].reverse()) {
      const article = document.createElement('article');
      const badge = document.createElement('small'); badge.textContent = `${card.origin === 'game' ? 'ゲームからの依頼' : '現実で作成'} · ${card.expired && card.status === 'sent' ? '期限切れ・反映未確認' : labels[card.status]}`;
      const content = document.createElement('p'); content.className = 'card-text'; content.textContent = card.text;
      article.append(badge, content);
      const detail = document.createElement('p'); detail.className = 'hint';
      detail.textContent = `対象: ${state.binding.server} / ${state.binding.player}\n${card.hash ? `SHA-256: ${card.hash.slice(0, 16)}…` : '承認後5分間だけ共有'}${card.job ? ` · 仕事: ${card.job.status}` : ''}`;
      article.append(detail);
      const buttons = document.createElement('div'); buttons.className = 'actions';
      const button = (label, action) => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => command(action, { cardId: card.id }); buttons.append(b); };
      if (card.status === 'draft') button('この内容を承認してゲームへ共有', 'publish');
      if (card.status === 'observed') button('確認記録を検収', 'complete');
      if (!['cancelled', 'completed'].includes(card.status)) button('停止', 'cancel');
      article.append(buttons); $('cards').append(article);
    }
  } catch (error) { $('message').textContent = `接続できません: ${error.message}。新規共有は止まっています。`; }
}
async function sendPending() {
  if (busy || !pending) return;
  busy = true;
  try {
    const response = await fetch('/api/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pending), signal: AbortSignal.timeout(7000) });
    const result = await response.json();
    if (!response.ok) { pending = null; throw new Error(result.error); }
    pending = null;
    $('message').textContent = '保存しました。';
    await refresh();
  } catch (error) { $('message').textContent = `${error.message}${pending ? ' 同じ操作IDで再照会できます。' : ''}`; }
  finally { busy = false; $('retry').hidden = !pending; }
}
async function command(action, extra = {}) {
  if (!state || busy) return;
  if (pending) { $('message').textContent = '先の操作結果を再照会してください。'; return; }
  await refresh();
  pending = { id: crypto.randomUUID(), revision: state.revision, binding: state.binding, action, ...extra };
  await sendPending();
}
$('draft').onsubmit = async event => { event.preventDefault(); await command('draft', { text: $('text').value }); };
$('retry').onclick = sendPending;
void refresh(); setInterval(refresh, 1500);

function renderTasks() {
  $('sky-status').textContent = state.sky?.message ?? 'Sky外部接続を確認中';
  $('remote-agents').replaceChildren();
  for (const agent of state.sky?.agents ?? []) { const p=document.createElement('p'); p.className='hint'; p.textContent=`${agent.name} · 外部Agent／見積・実行承認の接続待ち`; $('remote-agents').append(p); }
  const tools = $('agent-tools');
  if(!tools.options.length) for(const agent of state.agents.filter(a=>a.id.startsWith('local:'))) { const option=document.createElement('option'); option.value=agent.id; option.textContent=agent.name; tools.append(option); }
  $('tasks').replaceChildren();
  for(const task of [...state.tasks].reverse()) {
    const article=document.createElement('article');
    const label=document.createElement('small'); label.textContent=`${task.agent.name} · ${task.job.status} · 第${task.round}版`;
    const title=document.createElement('h3'); title.textContent=task.job.plan.objective;
    const provenance=document.createElement('p'); provenance.className='hint'; provenance.textContent=`同じ仕事ID: ${task.id}\n${task.approved ? '現実側で実行を承認済み' : '現実側の実行承認待ち'} · 外部課金なし`;
    const result=document.createElement('pre'); result.textContent=task.error ?? task.output?.text ?? '成果はまだありません。';
    const source=document.createElement('pre');source.textContent=`処理する素材:\n${task.source}`;
    article.append(label,title,provenance,source,result);
    const button=(name,action,extra={})=>{const b=document.createElement('button');b.textContent=name;b.onclick=()=>command(action,{taskId:task.id,...extra});article.append(b);};
    if(task.job.status==='active' && !task.approved) button('内容を承認してローカルAgentを実行','agent_run');
    if(task.output?.status==='passed' && !task.error && task.job.status!=='cancelled') {
      button('この成果をゲームへ共有','agent_share');
      if(task.job.status==='review') button('成果を検収して完了','agent_complete');
    }
    if(!['completed','cancelled'].includes(task.job.status)) {
      const details=document.createElement('details'); const summary=document.createElement('summary'); summary.textContent='現実側でこの仕事の続きを依頼';
      const form=document.createElement('form');
      const purpose=document.createElement('input'); purpose.value=task.job.plan.objective; purpose.maxLength=1000; purpose.setAttribute('aria-label','続きの目的');
      const material=document.createElement('textarea'); material.value=task.source; material.maxLength=8000; material.rows=4; material.setAttribute('aria-label','続きの素材');
      const submit=document.createElement('button'); submit.textContent='同じ仕事に次の版を保存';
      form.append(purpose,material,submit); form.onsubmit=e=>{e.preventDefault();void command('agent_continue',{taskId:task.id,objective:purpose.value,text:material.value});};
      details.append(summary,form); article.append(details); button('仕事を停止','agent_cancel');
    }
    if(task.history.length) { const history=document.createElement('details'); const summary=document.createElement('summary');summary.textContent=`以前の成果 ${task.history.length}件`;history.append(summary);for(const version of task.history){const p=document.createElement('pre');p.textContent=`第${version.round}版\n${version.output?.text ?? '未実行'}`;history.append(p);}article.append(history); }
    $('tasks').append(article);
  }
}
$('agent-tools').onchange=()=>{const selected=[...$('agent-tools').selectedOptions].map(o=>state.agents.find(a=>a.id===o.value));$('agent-configs').value=JSON.stringify(selected.flatMap(a=>a.configs),null,2);};
$('create-agent').onsubmit=e=>{e.preventDefault();try{const selected=[...$('agent-tools').selectedOptions].map(o=>state.agents.find(a=>a.id===o.value));const configs=$('agent-configs').value.trim()?JSON.parse($('agent-configs').value):selected.flatMap(a=>a.configs);void command('agent_create',{agent:{name:$('agent-name').value,inputKind:$('agent-kind').value,tools:selected.flatMap(a=>a.tools),configs}});}catch{$('message').textContent='詳細設定のJSON配列を確認してください。';}};
