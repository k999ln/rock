import { skyProgress } from './sky-presentation.ts';
import type { WorkJob } from './workflow.ts';

import { createSkyAppJob, executeSkyAppJob, stopSkyAppJob, confirmSkyAppJob } from './sky-app-foundation.ts';
import { skyPrivateLabAllowed } from './sky-app-contract.ts';
import { parsePrivateZoomAgent, type PrivateZoomAgent, type PrivateZoomArtifact } from './sky-zoom-recipe.ts';
export { ZOOM_LAB_INPUT_LIMIT, ZOOM_LAB_LINE_LIMIT, zoomLabOutputs, parsePrivateZoomAgent } from './sky-zoom-recipe.ts';
export type { PrivateZoomAgent, PrivateZoomArtifact } from './sky-zoom-recipe.ts';
export type PrivateZoomRun = { job: WorkJob; recipe: PrivateZoomAgent; artifact: PrivateZoomArtifact | null };
export const privateZoomLabAllowed = skyPrivateLabAllowed;

export function beginPrivateZoomRun(recipe: PrivateZoomAgent, input: string, id: string): PrivateZoomRun {
  const snapshot = parsePrivateZoomAgent(recipe);
  return { recipe: snapshot, artifact: null, job: createSkyAppJob({ schema: 'sky.app-request/1', appId: 'zoom',
    sourceId: id, sourceRevision: '1', title: snapshot.name, objective: snapshot.purpose, input, recipe: snapshot }, id) };
}
export function cancelPrivateZoomRun(run: PrivateZoomRun): PrivateZoomRun {
  if (!['active', 'review'].includes(run.job.status)) return run;
  return { ...run, artifact: null, job: stopSkyAppJob(run.job) };
}
export function confirmPrivateZoomRun(run: PrivateZoomRun): PrivateZoomRun {
  if (!run.artifact || run.artifact.jobId !== run.job.id) throw new Error('確認できる成果がありません。');
  return { ...run, job: confirmSkyAppJob(run.job) };
}
/** Same Sky job/adapter as the private server and planner. This UI keeps it in tab memory. */
export async function executePrivateZoomRun(initial: PrivateZoomRun, input: string,
  options: { signal: AbortSignal; onProgress?: (run: PrivateZoomRun) => void; yieldStep?: (signal: AbortSignal) => Promise<void> }): Promise<PrivateZoomRun> {
  if (input.trim() !== initial.job.skyApp?.request.input) throw new Error('素材が変わりました。新しい実行を作成してください。');
  const job = await executeSkyAppJob(initial.job, { ...options, onProgress: (progress) => options.onProgress?.({ ...initial, job: progress }) });
  const notes = job.skyApp!.result!.notes!;
  return { ...initial, job, artifact: { schema: 'sky.private-zoom-result/1', jobId: job.id, recipe: initial.recipe,
    environment: 'browser-private-manual-text', ...notes } };
}

export function privateZoomResultMarkdown(run: PrivateZoomRun): string {
  const a = run.artifact;
  if (!a || a.jobId !== run.job.id || !['review', 'completed'].includes(run.job.status)) throw new Error('持ち出せる成果がありません。');
  return [`# ${run.recipe.name}`, '', 'Sky本人用Lab / 手入力メモのブラウザー内処理。実Zoom未接続。',
    `状態: ${skyProgress(run.job.status).label}`, '',
    ...(a.summary === undefined ? [] : ['## 概要（先頭行の抜粋）', a.summary, '']),
    ...(a.decisions === undefined ? [] : ['## 決定事項', ...a.decisions.map((v) => `- ${v}`), a.decisions.length ? '' : '該当なし', '']),
    ...(a.owners === undefined ? [] : ['## 担当', ...a.owners.map((v) => `- ${v}`), a.owners.length ? '' : '該当なし', ''])].join('\n');
}
