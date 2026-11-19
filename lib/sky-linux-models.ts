/** Data-only model packages. A model cannot supply commands, dependencies or permissions. */
export type LinuxModel = {
  schema: 'sky.local-model/1'; id: string; name: string; repository: string;
  revision: string; file: string; sha256: string; bytes: number; license: string;
  promptFormat: 'chatml' | 'llama3'; memoryMiB: number; source: string;
};
const string = (v: unknown, n: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= n && !Array.from(v).some(c => c.charCodeAt(0) < 32);
export function parseLinuxModel(input: unknown): LinuxModel {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('AIの設定ファイルを確認してください。');
  const v = input as Record<string, unknown>;
  if (Object.keys(v).some(k => !['schema', 'id', 'name', 'repository', 'revision', 'file', 'sha256', 'bytes', 'license', 'promptFormat', 'memoryMiB', 'source'].includes(k)) ||
    v.schema !== 'sky.local-model/1' || !string(v.id, 80) || !/^[a-z0-9][a-z0-9.-]*$/u.test(v.id as string) || (v.id as string).includes('..') ||
    !string(v.name, 100) || !string(v.repository, 160) || !/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/u.test(v.repository as string) ||
    !string(v.revision, 40) || !/^[a-f0-9]{40}$/u.test(v.revision as string) ||
    !string(v.file, 200) || !/^[A-Za-z0-9_.-]+\.gguf$/u.test(v.file as string) || (v.file as string).includes('..') ||
    !string(v.sha256, 64) || !/^[a-f0-9]{64}$/u.test(v.sha256 as string) ||
    !Number.isSafeInteger(v.bytes) || (v.bytes as number) < 1024 || (v.bytes as number) > 1610612736 ||
    !string(v.license, 160) || !['chatml', 'llama3'].includes(v.promptFormat as string) ||
    !Number.isInteger(v.memoryMiB) || (v.memoryMiB as number) < 2048 || (v.memoryMiB as number) > 4096)
    throw new Error('このAIの設定はまだ使えません。対応する文章用GGUF・固定版・容量・利用条件を確認してください。');
  const source = `https://huggingface.co/${String(v.repository)}/blob/${String(v.revision)}/${String(v.file)}`;
  if (v.source !== undefined && v.source !== source) throw new Error('AIの配布元が設定と一致しません。');
  return { ...v, source } as LinuxModel;
}
export function parseLinuxAgentFile(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('担当の設定ファイルを確認してください。');
  const v = input as Record<string, unknown>;
  if (v.schema !== 'sky.local-agent/1' || Object.keys(v).some(k => !['schema', 'name', 'instructions', 'modelId'].includes(k)))
    throw new Error('対応する担当の設定ファイルを選んでください。実行プログラムや権限は読み込みません。');
  return { name: v.name, instructions: v.instructions, modelId: v.modelId };
}
