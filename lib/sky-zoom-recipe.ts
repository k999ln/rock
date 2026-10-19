export const ZOOM_LAB_INPUT_LIMIT = 6000;
export const ZOOM_LAB_LINE_LIMIT = 120;
export const zoomLabOutputs = ['summary', 'decisions', 'owners'] as const;
/** Literal facts come from the source, never from a model's fabricated fields. */
export function extractPrivateZoomFacts(input: string, labels: { decisionLabel: string; ownerLabel: string }) {
  const decisions: string[] = [], owners: string[] = [];
  for (const row of input.split(/\r?\n/u)) {
    const line = row.replace(/^\s*[-*•]\s*/u, '').trim(), colon = line.search(/[:：]/u);
    if (colon < 0) continue;
    const label = line.slice(0, colon).trim(), value = line.slice(colon + 1).trim();
    if (!value) continue;
    if (label === labels.decisionLabel) decisions.push(value);
    if (label === labels.ownerLabel) owners.push(value);
  }
  return { decisions, owners };
}
export function composeLocalZoomNotes(modelText: string, input: string, labels: { decisionLabel: string; ownerLabel: string }) {
  const raw: unknown = JSON.parse(modelText);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('要約の形式が不正です。');
  const summary = text((raw as Record<string, unknown>).answer, 6000);
  return { summary, ...extractPrivateZoomFacts(input, labels) };
}
type Output = typeof zoomLabOutputs[number];
export type PrivateZoomAgent = {
  schema: 'sky.private-zoom-recipe/1';
  name: string;
  purpose: string;
  outputs: Output[];
  summaryLines: number;
  decisionLabel: string;
  ownerLabel: string;
};
export type PrivateZoomArtifact = {
  schema: 'sky.private-zoom-result/1';
  jobId: string;
  recipe: PrivateZoomAgent;
  environment: 'browser-private-manual-text';
  summary?: string;
  decisions?: string[];
  owners?: string[];
};
function text(value: unknown, maximum: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum
    || Array.from(value).some((char) => char.charCodeAt(0) < 32 && !['\n', '\r', '\t'].includes(char)))
    throw new Error(`文字を入力してください（${maximum}文字まで）。`);
  return value.trim();
}
export function parsePrivateZoomAgent(value: unknown): PrivateZoomAgent {
  const keys = ['schema', 'name', 'purpose', 'outputs', 'summaryLines', 'decisionLabel', 'ownerLabel'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key)))
    throw new Error('このLabのAgent設定だけを読み込めます。');
  const v = value as Record<string, unknown>;
  if (v.schema !== 'sky.private-zoom-recipe/1' || !Array.isArray(v.outputs) || !v.outputs.length
    || v.outputs.length > 3 || new Set(v.outputs).size !== v.outputs.length
    || v.outputs.some((item) => !zoomLabOutputs.includes(item))
    || !Number.isInteger(v.summaryLines) || Number(v.summaryLines) < 1 || Number(v.summaryLines) > 5)
    throw new Error('出力を1つ以上、概要の行数を1〜5で選んでください。');
  const decisionLabel = text(v.decisionLabel, 24);
  const ownerLabel = text(v.ownerLabel, 24);
  if (/[\n\r:：]/u.test(decisionLabel + ownerLabel) || decisionLabel === ownerLabel)
    throw new Error('異なる見出しを指定してください。改行とコロンは使えません。');
  const outputs = v.outputs as Output[];
  return { schema: 'sky.private-zoom-recipe/1', name: text(v.name, 80), purpose: text(v.purpose, 240),
    outputs: zoomLabOutputs.filter((item) => outputs.includes(item)), summaryLines: Number(v.summaryLines), decisionLabel, ownerLabel };
}
