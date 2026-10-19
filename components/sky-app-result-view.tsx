import type { SkyAppBinding } from '@/lib/sky-app-contract';
import { skyAppSections } from '@/lib/sky-output-presenter';

export function SkyAppResultView({ binding }: { binding: SkyAppBinding }) {
  if (!binding.result) return <p>保存された成果はありません。</p>;
  return <div>{skyAppSections(binding.request, binding.result).map((section) =>
    <section key={section.title}><h3>{section.title}</h3>{section.lines.map((line, index) =>
      <p key={index} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{line}</p>)}</section>)}
    <p>下書きの内容を元の資料と比べて確認してください。外部への送信や予定の変更は、別に確認が必要です。</p>
    <details><summary>元の文章と詳しい記録</summary>
      <p>連携先: {binding.request.appId === 'planner' ? 'プランナー' : binding.request.appId === 'notes' ? '手入力メモ' : 'Zoom'}</p>
      <p>元の資料の番号: {binding.request.sourceId} / 版: {binding.request.sourceRevision}</p>
      {binding.result.model && <p>使ったAIモデル: {binding.result.model.name} / 照合用の値: {binding.result.model.digest}</p>}
      <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{binding.request.input}</pre>
    </details>
  </div>;
}
