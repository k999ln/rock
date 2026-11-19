import Link from 'next/link';
import { skyObjectAttachmentLabels, skyObjectEntryPath, type SkyObjectAttachment } from '@/lib/sky-object-attachment';
export default function SkyObjectAgentSummary({ agentId, attachment }: { agentId: string; attachment: SkyObjectAttachment }) {
  const labels = skyObjectAttachmentLabels(attachment);
  return <section aria-label="つなぐ対象と使い方"><h3>{attachment.objectName}に付ける担当</h3><p>受け取りたい情報：{labels.input}</p><p>結果の伝え方：{labels.output}</p><p>部品の入力・出力は未接続です。担当の設定と、実際にできることを別に確認します。</p><Link href={skyObjectEntryPath(agentId)}>この担当の入口を確認</Link><p><a href={`/sky/objects/camera?agent=${encodeURIComponent(agentId)}`}>カメラからこの担当につなぐ</a></p></section>;
}
