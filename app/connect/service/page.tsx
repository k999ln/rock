import type { Metadata } from 'next';
import RockstarServiceSetup from '@/components/rockstar-service-setup';
export const metadata: Metadata = {
  title: 'Sky・Eveの利用開始',
  description:
    '料金と契約、月末の支払い準備、確認済みeSIMから専用環境の利用開始を進めます。',
};
export default function Page() {
  return <RockstarServiceSetup />;
}
