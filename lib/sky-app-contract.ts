import { parsePrivateZoomAgent, type PrivateZoomAgent } from './sky-zoom-recipe.ts';
import type { SkyPrivateAgentBinding } from './sky-private-agent.ts';

export type SkyAppRequest = {
  schema: 'sky.app-request/1'; appId: 'notes' | 'zoom' | 'planner'; sourceId: string; sourceRevision: string;
  title: string; objective: string; input: string; recipe?: PrivateZoomAgent;
};
export type SkyAppResult = {
  schema: 'sky.app-result/1'; jobId: string; appId: SkyAppRequest['appId']; sourceId: string; sourceRevision: string;
  kind: 'meeting.notes' | 'task.preparation'; body: string; provisional: true;
  execution: 'bounded-text-adapter' | 'local-llm';
  model?: { name: string; digest: string; task: 'meeting-notes'; suite: 'sky-local-model-eval/1' | 'sky-local-model-eval/2' };
  notes?: { summary?: string; decisions?: string[]; owners?: string[] };
};
export type SkyAppBinding = { request: SkyAppRequest; result: SkyAppResult | null; privateAgent?: SkyPrivateAgentBinding };

export function appObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key)))
    throw new Error('Sky連携の入力項目を確認してください。');
  return value as Record<string, unknown>;
}
export function appText(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum
    || Array.from(value).some((c) => c.charCodeAt(0) < 32 && !['\n', '\r', '\t'].includes(c)))
    throw new Error(`Sky連携の文字数を確認してください（1〜${maximum}文字）。`);
  return value.trim();
}
export function parseSkyAppRequest(value: unknown): SkyAppRequest {
  const v = appObject(value, ['schema', 'appId', 'sourceId', 'sourceRevision', 'title', 'objective', 'input', 'recipe']);
  if (v.schema !== 'sky.app-request/1' || !['notes', 'zoom', 'planner'].includes(String(v.appId))) throw new Error('対応するSky連携を選んでください。');
  const input = appText(v.input, 6000);
  if (input.split(/\r?\n/u).length > 120) throw new Error('素材は120行までです。分けて実行してください。');
  if (v.appId === 'planner' && v.recipe !== undefined) throw new Error('プランナーへZoom設定は使えません。');
  const sourceId = appText(v.sourceId, 120), sourceRevision = appText(v.sourceRevision, 128);
  if (!/^[a-zA-Z0-9._:-]+$/u.test(sourceId) || !/^[a-zA-Z0-9._:-]+$/u.test(sourceRevision)) throw new Error('連携元IDと版を確認してください。');
  return { schema: 'sky.app-request/1', appId: v.appId as SkyAppRequest['appId'], sourceId, sourceRevision,
    title: appText(v.title, 120), objective: appText(v.objective, 1000), input,
    ...(v.appId !== 'planner' ? { recipe: parsePrivateZoomAgent(v.recipe) } : {}) };
}
export function parseSkyAppResult(value: unknown, jobId: string, request: SkyAppRequest): SkyAppResult {
  const v = appObject(value, ['schema', 'jobId', 'appId', 'sourceId', 'sourceRevision', 'kind', 'body', 'provisional', 'execution', 'notes', 'model']);
  if (v.schema !== 'sky.app-result/1' || v.jobId !== jobId || v.appId !== request.appId || v.sourceId !== request.sourceId
    || v.sourceRevision !== request.sourceRevision || v.provisional !== true || !['bounded-text-adapter', 'local-llm'].includes(String(v.execution))
    || v.kind !== (request.appId === 'planner' ? 'task.preparation' : 'meeting.notes')) throw new Error('仕事と連携元の成果が一致しません。');
  let model: SkyAppResult['model'];
  if (v.execution === 'local-llm') {
    const m = appObject(v.model, ['name', 'digest', 'task', 'suite']);
    if (request.appId !== 'zoom' || typeof m.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/.test(m.name)
      || typeof m.digest !== 'string' || !/^[a-f0-9]{64}$/.test(m.digest) || m.task !== 'meeting-notes'
      || (m.suite !== 'sky-local-model-eval/1' && m.suite !== 'sky-local-model-eval/2')) throw new Error('モデルの実行記録が不正です。');
    model = { name: m.name, digest: m.digest, task: m.task, suite: m.suite };
  } else if (v.model !== undefined) throw new Error('決定的処理へモデル記録は付与できません。');
  let notes: SkyAppResult['notes'];
  if (request.appId !== 'planner') {
    const n = appObject(v.notes, ['summary', 'decisions', 'owners']);
    notes = {};
    if (request.recipe!.outputs.includes('summary')) notes.summary = appText(n.summary, 6000);
    else if (n.summary !== undefined) throw new Error('未選択の成果があります。');
    for (const key of ['decisions', 'owners'] as const) {
      if (request.recipe!.outputs.includes(key)) {
        const items = n[key];
        if (!Array.isArray(items) || items.length > 120) throw new Error('成果の件数が不正です。');
        notes[key] = items.map((item) => appText(item, 6000));
      } else if (n[key] !== undefined) throw new Error('未選択の成果があります。');
    }
  } else if (v.notes !== undefined) throw new Error('プランナーの成果形式が不正です。');
  return { schema: 'sky.app-result/1', jobId, appId: request.appId, sourceId: request.sourceId, sourceRevision: request.sourceRevision,
    kind: request.appId === 'planner' ? 'task.preparation' : 'meeting.notes', body: appText(v.body, 20000), provisional: true,
    execution: v.execution as SkyAppResult['execution'], ...(notes ? { notes } : {}), ...(model ? { model } : {}) };
}

export function skyPrivateLabAllowed(mode: string | undefined, host: string | null): boolean {
  return mode === 'development' && typeof host === 'string' && /^(localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/u.test(host);
}
