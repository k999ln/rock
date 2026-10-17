import { randomUUID } from 'node:crypto';
import { compositionCapabilities, defaultCompositionConfig, parseCompositionPlan } from '../../lib/work-composition.ts';
import { createWorkJob, updateComposedWork, applyWorkCommand } from '../../lib/workflow.ts';
import { executeCompositionNode } from '../../lib/work-composition-executor.ts';
import { createHash } from 'node:crypto';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const requireValue = (ok, message) => { if (!ok) throw Object.assign(new Error(message), {status:409}); };
export const localAgents = compositionCapabilities.filter(c => c.available).map(c => ({
  id: `local:${c.id}`, name: `${c.name} Agent`, kind: 'local-workflow', description: c.limitation,
  inputKind: c.accepts[0], tools: [c.id], configs: [defaultCompositionConfig(c.id)], price: 'ローカル処理・外部課金なし',
}));
export function agentPlan(agent, objective) {
  requireValue(typeof objective === 'string' && objective.trim().length > 0 && objective.length <= 1000, '依頼目的は1〜1000文字です。');
  const tools = [...agent.tools];
  if (tools.at(-1) !== 'compose-check') tools.push('compose-check');
  const plan = parseCompositionPlan({ version:1, objective, acceptance:'各手順の検査と本人の成果確認', inputKind:agent.inputKind, budgetMinor:0,currency:'JPY',deadline:'',
    nodes: tools.map((tool,i) => ({id:`s${i+1}`,tool,inputs:[i === 0 ? 'source' : `s${i}`],config:agent.configs[i] ?? defaultCompositionConfig(tool)})) });
  requireValue(plan.nodes.every(n => compositionCapabilities.some(c => c.id === n.tool && c.available)), '未接続Toolは実行Agentへ登録できません。');
  return plan;
}
export function createLocalAgent(input) {
  requireValue(input && typeof input === 'object' && !Array.isArray(input) && Object.keys(input).every(k => ['name','tools','inputKind','configs'].includes(k)), 'Agent設定の項目が不正です。');
  requireValue(typeof input.name === 'string' && input.name.trim() && input.name.length <= 80 && Array.isArray(input.tools) && input.tools.length > 0 && input.tools.length <= 6 && Array.isArray(input.configs) && input.configs.length === input.tools.length, 'Agent名・手順・設定を確認してください。');
  const agent = {id:`custom:${randomUUID()}`,name:input.name.trim(),kind:'local-workflow',description:'本人が作成した有限Tool手順。LLM推論なし。',price:'ローカル処理・外部課金なし',inputKind:input.inputKind,tools:input.tools,configs:input.configs};
  agentPlan(agent, 'Agent設定検査'); return agent;
}
export async function agentCommand(state, actor, input, now) {
  state.tasks ??= []; state.customAgents ??= [];
  requireValue(state.tasks.length <= 100, '仕事の保存上限です。');
  const stamp = new Date(now).toISOString();
  if (input.action === 'agent_create') {
    requireValue(actor === 'os' && state.customAgents.length < 20, 'Agent作成は現実側のみ、20件までです。');
    state.customAgents.push(createLocalAgent(input.agent)); return;
  }
  if (input.action === 'agent_request') {
    requireValue(state.tasks.length < 100, '仕事の保存上限です。');
    const agent = [...localAgents,...state.customAgents].find(a => a.id === input.agentId);
    requireValue(agent, 'このAgentは未接続です。');
    requireValue(typeof input.text === 'string' && input.text.trim() && Buffer.byteLength(input.text, 'utf8') <= 8000, '素材はUTF-8で1〜8000バイトです。');
    const plan = agentPlan(agent,input.objective);
    state.tasks.push({id:input.id,origin:actor,agent:structuredClone(agent),source:input.text,job:createWorkJob({id:input.id,title:input.objective.slice(0,120),templateId:'composition',plan},stamp),round:1,history:[],approved:false,output:null,error:null,shared:false});
    return;
  }
  const task = state.tasks.find(t => t.id === input.taskId);
  requireValue(task, 'この本人の仕事が見つかりません。');
  requireValue(actor === 'os', '実行・継続・検収・共有は現実側で承認してください。');
  if (input.action === 'agent_continue') {
    requireValue(!['cancelled','completed'].includes(task.job.status) && task.round < 10, '終了済み、または継続回数の上限です。');
    requireValue(typeof input.text === 'string' && input.text.trim() && Buffer.byteLength(input.text, 'utf8') <= 8000, '続きの素材はUTF-8で1〜8000バイトです。');
    const plan = agentPlan(task.agent,input.objective);
    task.history.push({round:task.round,source:task.source,output:task.output,job:task.job});
    task.job = updateComposedWork(task.job,{id:randomUUID(),fingerprint:hash(input),revision:task.job.revision,action:'clear'},stamp);
    task.job = updateComposedWork(task.job,{id:randomUUID(),fingerprint:hash(plan),revision:task.job.revision,action:'revise',plan},stamp);
    task.source=input.text; task.round++; task.output=null; task.error=null; task.approved=false; task.shared=false; return;
  }
  if (input.action === 'agent_run') {
    requireValue(task.job.status === 'active' && !task.approved, '実行済みです。修正する場合は続きの依頼を作ってください。');
    task.approved=true; task.error=null;
    try {
      for (const node of task.job.composition.plan.nodes) {
        const result = await executeCompositionNode(task.job.composition,node,task.source);
        task.job=updateComposedWork(task.job,{id:randomUUID(),fingerprint:hash({node,source:task.source}),revision:task.job.revision,action:'run',stepId:node.id,source:task.source,result},stamp);
        task.output=result;
        if (result.status !== 'passed') break;
      }
    } catch(error) { task.error=error.message; }
    return;
  }
  if (input.action === 'agent_share') {
    requireValue(task.job.status !== 'cancelled' && task.output?.status === 'passed' && !task.error, '検査済み成果だけ共有できます。');
    task.shared=true; return;
  }
  if (input.action === 'agent_complete' || input.action === 'agent_cancel') {
    requireValue(input.action !== 'agent_complete' || (task.output?.status === 'passed' && !task.error), '成果を確認してください。');
    task.job=applyWorkCommand(task.job,{id:input.id,action:input.action === 'agent_complete' ? 'complete' : 'cancel',...(input.action === 'agent_complete' ? {note:'ローカルToolの成果を本人が検収。外部Agent/実ゲームの受入ではない。'} : {})},task.job.revision,stamp);
    if(input.action === 'agent_cancel') task.shared=false;
    return;
  }
  requireValue(false,'未対応のAgent操作です。');
}
export function gameTasks(tasks = []) {
  // Only game-origin tasks are visible. Continuations return status but not private material.
  return tasks.filter(t=>t.origin==='game').map(t=>({id:t.id,agentName:t.agent.name,round:t.round,status:t.job.status,approved:t.approved,error:t.error ? '現実側で処理設定を確認してください。' : null,output:t.shared ? t.output : null}));
}
