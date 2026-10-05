// Explicitly saved results stay on this browser; no original input is retained.
export const SKY_RESULTS_KEY = 'rockstaros.sky.saved-results.v1';
export type SkySavedResult = {
  id: string;
  tool: string;
  title: string;
  output: string;
  createdAt: string;
};
type ResultStorage = Pick<Storage, 'getItem' | 'setItem'>;
const tools = new Set(['coconala', 'citations', 'free-article']);
export function readSkyResults(storage: ResultStorage): SkySavedResult[] {
  const raw = storage.getItem(SKY_RESULTS_KEY);
  if (!raw) return [];
  if (raw.length > 4_000_000)
    throw new Error('保存した成果の容量を確認してください。');
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length > 20)
    throw new Error('保存した成果を読み込めません。');
  return parsed.filter(
    (v): v is SkySavedResult =>
      Boolean(v) &&
      typeof v === 'object' &&
      typeof v.id === 'string' &&
      typeof v.tool === 'string' &&
      tools.has(v.tool) &&
      typeof v.title === 'string' &&
      v.title.length <= 120 &&
      typeof v.output === 'string' &&
      v.output.length <= 150_000 &&
      typeof v.createdAt === 'string' &&
      Number.isFinite(Date.parse(v.createdAt)),
  );
}
export function saveSkyResult(
  storage: ResultStorage,
  result: SkySavedResult,
): SkySavedResult[] {
  if (
    !tools.has(result.tool) ||
    !result.output ||
    result.output.length > 150_000
  )
    throw new Error('この成果はファイルで保存してください。');
  const existing = readSkyResults(storage);
  const same = existing.find(
    (v) => v.tool === result.tool && v.output === result.output,
  );
  if (same) return existing;
  if (existing.length >= 20)
    throw new Error(
      '保存上限の20件に達しました。不要な成果を削除してください。',
    );
  const next = [result, ...existing];
  storage.setItem(SKY_RESULTS_KEY, JSON.stringify(next));
  return next;
}
export function deleteSkyResult(
  storage: ResultStorage,
  id: string,
): SkySavedResult[] {
  const next = readSkyResults(storage).filter((v) => v.id !== id);
  storage.setItem(SKY_RESULTS_KEY, JSON.stringify(next));
  return next;
}
