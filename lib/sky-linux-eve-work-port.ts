import type { LinuxLocalAgent, LinuxLocalRun } from './sky-linux-record.ts';
import type { EveWorkPort, EveWorkReference, EveWorkObservation } from './rockstar-eve-interaction.ts';

/** Legacy Pixel/Linux host adapter. No second job store or execution authority. */
export type MiniSnapshot = { phase: string; selectedModelId: string; preparedModels: string[]; models: { id: string; sha256: string }[]; agents: LinuxLocalAgent[]; runs: LinuxLocalRun[] };
export function createLinuxEveWorkPort(action: (input: Record<string, unknown>) => Promise<MiniSnapshot>): EveWorkPort {
  function project(snapshot: MiniSnapshot, reference: EveWorkReference): EveWorkObservation | null {
    const run = snapshot.runs.find(r => r.job.id === reference.id);
    if (!run) return null;
    if (run.agent.id !== reference.agentId || run.agent.sha256 !== reference.agentSha256 || run.modelSha256 !== reference.modelSha256 || run.input !== reference.input) throw Error('仕事の内容が一致しません。元の仕事画面から確認してください。');
    if (['requested', 'unconfirmed'].includes(run.stop) || run.error) return { status: 'unknown', text: null };
    if (['review', 'completed'].includes(run.job.status) && run.stop === 'none') return { status: run.job.status as 'review' | 'completed', text: run.text };
    if (run.job.status === 'cancelled' && run.stop === 'confirmed') return { status: 'stopped', text: run.text };
    return { status: run.job.status === 'active' && run.stop === 'none' ? 'running' : 'unknown', text: null };
  }
  return {
    async prepare(input, continuing) {
      const snapshot = await action({ action: 'status' });
      if (!continuing()) return null;
      const model = snapshot.models.find(m => m.id === snapshot.selectedModelId);
      if (!model || snapshot.phase !== 'ready' || !snapshot.preparedModels.includes(model.id)) throw Error('使うAIの準備が必要です。設定で容量と利用条件を確認してください。声だけでダウンロードは始めません。');
      if (snapshot.runs.some(r => r.job.status === 'active' || ['requested', 'unconfirmed'].includes(r.stop))) throw Error('別の仕事が動いているか、停止が未確認です。成果一覧を確認してください。');
      const recipe = { name: `依頼の担当：${input.slice(0, 30)}`, instructions: `次の依頼に沿って文章の下書きを作る担当です。未接続の道具を使ったり、未実行の操作を完了したと伝えたりしないでください。\n${input}`, modelId: model.id };
      const added = await action({ action: 'add-agent', agent: recipe });
      if (!continuing()) return null;
      const agent = added.agents.find(a => a.name === recipe.name && a.instructions === recipe.instructions && a.modelId === model.id);
      if (!agent) throw Error('担当を保存できたか確認できません。追加済みの担当を確認してください。');
      return { agentId: agent.id, agentSha256: agent.sha256, modelSha256: model.sha256, input };
    },
    async start(reference) { return project(await action({ action: 'run', agentId: reference.agentId, agentSha256: reference.agentSha256, modelSha256: reference.modelSha256, input: reference.input, requestId: reference.id, surface: 'eve', accepted: true }), reference); },
    async read(reference) { return project(await action({ action: 'status' }), reference); },
    async stop(reference) { return project(await action({ action: 'stop', jobId: reference.id }), reference); },
    async stopExisting(reference) { const before=project(await action({action:'status'}),reference);if(!before||['review','completed','stopped'].includes(before.status))return before;return project(await action({action:'stop',jobId:reference.id}),reference); },
  };
}
