import { skyProgress } from './sky-presentation.ts';
import { appText, parseSkyAppRequest, parseSkyAppResult, type SkyAppRequest, type SkyAppResult } from './sky-app-contract.ts';
import { applyWorkCommand, createSkyAppWorkJob, recordSkyAppResult, type WorkJob } from './workflow.ts';

export function createSkyAppJob(value: unknown, id = crypto.randomUUID()): WorkJob {
  return createSkyAppWorkJob(id, value);
}
export function stopSkyAppJob(job: WorkJob, commandId = crypto.randomUUID(), revision = job.revision): WorkJob {
  return applyWorkCommand(job, { id: commandId, action: 'cancel' }, revision);
}
export function confirmSkyAppJob(job: WorkJob, commandId = crypto.randomUUID(), revision = job.revision): WorkJob {
  return applyWorkCommand(job, { id: commandId, action: 'complete', note: '本人がSky連携の成果を確認。接続先での採用・外部作用は別承認。' }, revision);
}
function pause(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('停止しました。')); return; }
    const abort = () => { clearTimeout(timer); reject(new Error('停止しました。')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 250);
    signal.addEventListener('abort', abort, { once: true });
  });
}
export type SkyAppExecutionOptions = {
  signal: AbortSignal; commandId?: string; onProgress?: (job: WorkJob) => void;
  yieldStep?: (signal: AbortSignal) => Promise<void>;
};

/** Known text adapters only. Provider/OS/Zoom actions are not inferred from the request. */
export async function executeSkyAppJob(initial: WorkJob, options: SkyAppExecutionOptions): Promise<WorkJob> {
  if (initial.templateId !== 'sky-app' || !initial.skyApp || initial.status !== 'active' || initial.revision !== 0)
    throw new Error('新しいSky実行を作成してください。');
  const request = parseSkyAppRequest(initial.skyApp.request), start = Date.now();
  const checkpoint = async () => {
    if (options.signal.aborted) throw new Error('停止しました。');
    await (options.yieldStep ?? pause)(options.signal);
    if (options.signal.aborted) throw new Error('停止しました。');
    if (Date.now() - start > 30000) throw new Error('Sky実行が30秒を超えました。素材を分けて再実行してください。');
  };
  let result: SkyAppResult;
  const base = { schema: 'sky.app-result/1', jobId: initial.id, appId: request.appId,
    sourceId: request.sourceId, sourceRevision: request.sourceRevision, provisional: true, execution: 'bounded-text-adapter' } as const;
  if (request.appId === 'zoom') {
    const recipe = request.recipe!, lines = request.input.split(/\r?\n/u).map((l) => l.replace(/^\s*[-*•]\s*/u, '').trim()).filter(Boolean);
    const decisions: string[] = [], owners: string[] = [];
    for (let offset = 0; offset < lines.length; offset += 20) {
      await checkpoint();
      for (const line of lines.slice(offset, offset + 20)) {
        const colon = line.search(/[:：]/u);
        if (colon < 0) continue;
        const label = line.slice(0, colon).trim(), value = line.slice(colon + 1).trim();
        if (!value) continue;
        if (label === recipe.decisionLabel) decisions.push(value);
        if (label === recipe.ownerLabel) owners.push(value);
      }
    }
    const notes = { ...(recipe.outputs.includes('summary') ? { summary: lines.slice(0, recipe.summaryLines).join(' / ') } : {}),
      ...(recipe.outputs.includes('decisions') ? { decisions } : {}), ...(recipe.outputs.includes('owners') ? { owners } : {}) };
    const body = [notes.summary === undefined ? '' : `概要（先頭行の抜粋）: ${notes.summary}`,
      notes.decisions === undefined ? '' : `決定事項: ${notes.decisions.join(' / ') || '該当なし'}`,
      notes.owners === undefined ? '' : `担当: ${notes.owners.join(' / ') || '該当なし'}`].filter(Boolean).join('\n');
    result = { ...base, kind: 'meeting.notes', body, notes };
  } else {
    await checkpoint();
    // Explicit preparation, never a claim to have researched, contacted anyone or completed the task.
    const field = (label: string) => request.input.split(`${label}：`)[1]?.split('。')[0]?.slice(0, 240);
    result = { ...base, kind: 'task.preparation', body: [
      '作業準備の下書き（規則による整理・実作業は未実行）',
      `作業: ${field('担当作業') || request.title}`,
      `目的: ${request.objective.slice(0, 240)}`,
      `成果物: ${field('成果物') || '本人が成果物の形式を確認する'}`,
      `完了条件: ${field('完了条件') || '本人が内容と根拠を確認する'}`,
      '次に確認すること: 必要な資料・事実の根拠・担当・期限・使用できる予算。',
      '調査・制作・外部連絡・カレンダー変更は未実行です。接続先で採用する前に本人が確認してください。',
    ].join('\n') };
  }
  await checkpoint();
  result = parseSkyAppResult(result, initial.id, request);
  await checkpoint();
  const next = recordSkyAppResult(initial, result, initial.revision, options.commandId ?? crypto.randomUUID());
  options.onProgress?.(next);
  if (options.signal.aborted) throw new Error('停止しました。');
  return next;
}

export function skyAppExport(job: WorkJob): string {
  if (!job.skyApp?.result || !['review', 'completed'].includes(job.status)) throw new Error('持ち出せるSky成果がありません。');
  const r = job.skyApp.result;
  return `# ${job.skyApp.request.appId === 'planner' ? 'プランナーの作業準備' : job.title}\n\n${skyProgress(job.status).label}\n\n${r.body}\n\n次にすること: ${skyProgress(job.status).next}\n\nこの文章はSkyを開かずに読めます。\n`;
}

export function privateSkyOwnersAllowed(user: string, value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 12000) return false;
  try {
    const owners: unknown = JSON.parse(value);
    return Array.isArray(owners) && owners.length <= 20 && owners.every((v) => typeof v === 'string' && v.trim() === v && v.length > 0 && v.length <= 200) && owners.includes(user);
  } catch { return false; }
}

export function plannerSkyRequest(input: { taskId: string; revision: string; brief: string }): SkyAppRequest {
  return parseSkyAppRequest({ schema: 'sky.app-request/1', appId: 'planner', sourceId: input.taskId,
    sourceRevision: input.revision, title: 'プランナーの作業準備', objective: 'プランナーの作業を本人確認前の下書きとして準備する', input: appText(input.brief, 2000) });
}
