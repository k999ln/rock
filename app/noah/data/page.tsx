import NoahResultData from '@/components/noah-result-data';
import NoahWorkList from '@/components/noah-work-list';
export const metadata = { title: 'Agentの成果データ — Noah' };
// スマホから、接続した Agent へ頼んで、成果が出た仕事も、ここに並べる（Agent をまたいで。無い人には何も出ない）。
export default function Page() { return <NoahResultData phoneResults={<NoahWorkList ownerScope={null} refresh={0} only="succeeded" heading="接続したAgentの成果" />} />; }
