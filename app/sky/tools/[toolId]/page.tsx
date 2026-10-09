import Link from 'next/link';
import WorkspaceShell from '@/components/workspace-shell';
import { notFound } from 'next/navigation';
import SkyWritingService from '@/components/sky-writing-service';
export default async function Page({
  params,
}: {
  params: Promise<{ toolId: string }>;
}) {
  const { toolId } = await params;
  if (toolId === 'rockstar-spider') return <WorkspaceShell title="SPIDER · セキュリティ検査"><h1>SPIDER</h1><p>コードやテキストの秘密情報・個人情報・危険な処理の候補をブラウザ内で検査します。入力は送信・保存しません。</p><p>64 KiB・2,000行まで。検出ゼロは安全の保証ではありません。</p><Link className="rock-button" href="/zema/tools/rockstar-spider">Zemaで検査する</Link></WorkspaceShell>;
  if (!['mr-citations', 'mr-free-article', 'coconala'].includes(toolId))
    notFound();
  return <SkyWritingService toolId={toolId} />;
}
