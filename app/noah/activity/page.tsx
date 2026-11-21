import NoahLaunch from '@/components/noah-launch';
import NoahRemoteHub from '@/components/noah-remote-hub';
export const metadata = { title: '実行中のAgent — Noah' };
export default function Page() {
  return <NoahRemoteHub fallback={<NoahLaunch />} />;
}
