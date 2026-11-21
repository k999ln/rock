import NoahResultData from '@/components/noah-result-data';
import NoahRemoteHub from '@/components/noah-remote-hub';
export const metadata = { title: 'Agentの成果データ — Noah' };
export default function Page() { return <NoahRemoteHub results fallback={<NoahResultData />} />; }
