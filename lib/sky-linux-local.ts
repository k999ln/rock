import { applyWorkCommand, createPrivateLinuxWorkJob } from './workflow.ts';

import { linuxLocalPrice, linuxRecordText as text, type LinuxLocalAgent, type LinuxLocalRun } from './sky-linux-record.ts';
export { parseLinuxAgent, LINUX_LOCAL_SCHEMA, linuxLocalPrice, linuxRunExport, type LinuxLocalAgent, type LinuxLocalRun } from './sky-linux-record.ts';

export function beginLinuxRun(agent: LinuxLocalAgent, input: unknown, id: string, modelSha256: string): LinuxLocalRun {
  const objective = text(input, 4000);
  return { job: createPrivateLinuxWorkJob(id, agent.name, objective.slice(0, 1000)), agent: { ...agent }, modelSha256, input: objective,
    text: null, error: null, durationMs: null, stop: 'none', usage: { ...linuxLocalPrice } };
}
export function finishLinuxRun(run: LinuxLocalRun, output: { text: string; modelSha256: string; durationMs: number; rawOutputSha256?: string }) {
  if (run.stop !== 'none' || run.job.status !== 'active') throw new Error('停止した仕事の成果は追加しません。');
  if (output.modelSha256 !== run.modelSha256 || !Number.isFinite(output.durationMs) || output.durationMs < 0)
    throw new Error('実行記録が追加したモデルと一致しません。');
  const body = text(output.text, 32000);
  return { ...run, text: body, durationMs: output.durationMs,
    ...(typeof output.rawOutputSha256 === 'string' && /^[a-f0-9]{64}$/.test(output.rawOutputSha256) ? { rawOutputSha256: output.rawOutputSha256 } : {}),
    job: applyWorkCommand(run.job, { id: crypto.randomUUID(), action: 'record', stepId: 'generate',
      tool: 'sky-linux-text', transport: 'local-mcp', outcome: 'passed', sample: false, durationMs: output.durationMs }, run.job.revision) };
}
export function cancelLinuxRun(run: LinuxLocalRun): LinuxLocalRun {
  if (run.job.status === 'completed' || run.job.status === 'cancelled') return run;
  return { ...run, text: null, stop: 'requested',
    job: applyWorkCommand(run.job, { id: crypto.randomUUID(), action: 'cancel' }, run.job.revision) };
}
export function confirmLinuxRun(run: LinuxLocalRun): LinuxLocalRun {
  if (!run.text) throw new Error('確認する成果がありません。');
  return { ...run, job: applyWorkCommand(run.job, { id: crypto.randomUUID(), action: 'complete', note: '本人がLinuxで作成した文章を確認しました。' }, run.job.revision) };
}
