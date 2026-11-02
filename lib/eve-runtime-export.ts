import type { EveRuntimeExecution } from './eve-runtime-sync.ts';
import { linkedDigest } from './rockstar-linked-execution.ts';

/** Export an exact saved draft, never a resumable command or execution grant. */
export async function runtimeEveTextExport(current: EveRuntimeExecution, expected: Pick<EveRuntimeExecution, 'id'|'threadId'|'deviceId'|'revision'|'digest'>) {
  if (current.id !== expected.id || current.threadId !== expected.threadId || current.deviceId !== expected.deviceId || current.revision !== expected.revision || current.digest !== expected.digest)
    throw Error('成果の版が変わりました。読み直してから保存してください。');
  if (current.report.id !== current.id || current.report.state !== 'review' || typeof current.report.text !== 'string' || !current.report.text || current.externalToolSuccess !== false || current.report.outputSha256 !== await linkedDigest(current.report.text))
    throw Error('確認できる下書きがありません。成果を読み直してください。');
  const text = `# ${current.request.agent.name}\n\n下書きです。内容を確認してください。\n\n${current.report.text}\n\n基盤モデル: ${current.request.model.id}\n基盤モデル版: ${current.request.model.scheme}:${current.request.model.sha256}\n担当版SHA256: ${current.request.agent.sha256}\n仕事ID: ${current.id}\n成果SHA256: ${current.report.outputSha256}\nクラウド使用料: 0円（本人の実行先で推論）\n${current.usage.resources}\n${current.usage.subscription}\n`;
  return {name:`Eve-${current.id}.txt`,text,sha256:await linkedDigest(text)};
}
