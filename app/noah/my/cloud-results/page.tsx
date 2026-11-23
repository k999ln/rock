import SkyLinuxService from '@/components/sky-linux-service';

export const metadata = { title: '専用クラウドの成果と利用明細 — Noah' };

export default function Page() {
  return <SkyLinuxService resultsOnly />;
}
