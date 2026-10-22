import type { WorkJob } from './workflow.ts';

export const LINUX_LOCAL_SCHEMA = 'sky.private-linux-deployment/1';
export const linuxLocalPrice = {
  mode: 'owner-local' as const,
  cloudUsageMinor: 0,
  cloudTokensUsed: 0,
  agentPriceMinor: 0,
  currency: 'JPY',
  subscription: '未確定。この試用では契約や請求を開始しません。',
  resources: '本人用LinuxのCPU・メモリ・保存容量を使います。電気代・機器代は未計測です。',
  idle: '仕事の終了後はモデルの計算を止めます。Linuxと保存ファイルは残ります。',
};
export type LinuxLocalAgent = { id: string; name: string; instructions: string; modelId: string; sha256: string };
export type LinuxLocalRun = {
  job: WorkJob; agent: LinuxLocalAgent; modelSha256: string;
  input: string;
  text: string | null; error: string | null; durationMs: number | null;
  rawOutputSha256?: string;
  modelName?: string;
  surface?: 'eve';
  threadId?: string;
  contextSha256?: string;
  handoff?: { agentSha256: string; modelSha256: string };
  stop: 'none' | 'requested' | 'confirmed' | 'unconfirmed';
  usage: typeof linuxLocalPrice;
};

export function linuxRunExport(run: LinuxLocalRun) {
  if (!run.text || !['review', 'completed'].includes(run.job.status)) throw new Error('保存できる成果がまだありません。');
  return `# ${run.agent.name}\n\n${run.job.status === 'review' ? '下書きです。内容を確認してください。' : '本人が確認した文章です。'}\n\n${run.text}\n\n## 使ったAI\n${run.modelName ?? run.agent.modelId}\n\n## この仕事の料金\nクラウドAI使用料: 0円（端末内で推論）\n自作の担当代: 0円\n${run.usage.resources}\n${run.usage.subscription}\n\nこの文章はSkyなしで読めます。\n`;
}

export const linuxRecordText = (v: unknown, limit: number) => {
  if (typeof v !== 'string' || !v.trim() || v.length > limit || Array.from(v).some(c => c.charCodeAt(0) < 32 && !['\t', '\n', '\r'].includes(c)))
    throw new Error(`文字を入力してください（${limit}文字まで）。`);
  return v.trim();
};
export function parseLinuxAgent(v: unknown) {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !['name', 'instructions', 'modelId'].includes(k)))
    throw new Error('担当の設定を確認してください。');
  const value = v as Record<string, unknown>;
  return { name: linuxRecordText(value.name, 80), instructions: linuxRecordText(value.instructions, 1200), modelId: linuxRecordText(value.modelId, 100) };
}
