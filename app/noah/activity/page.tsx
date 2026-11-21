import NoahLaunch from '@/components/noah-launch';
import NoahWorkList from '@/components/noah-work-list';
export const metadata = { title: '実行中のAgent — Noah' };
export default function Page() {
  // スマホから、接続した Agent へ頼んだ仕事も、ここに並べる（Agent をまたいで。無い人には何も出ない）。
  return <NoahLaunch phoneWork={<NoahWorkList ownerScope={null} refresh={0} heading="接続したAgentの仕事" />} />;
}
