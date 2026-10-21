import type { Metadata } from 'next';
import SkyLinuxService from '@/components/sky-linux-service';
export const metadata: Metadata = {
  title: 'Sky Linux 16 — モデル・Agent・利用明細',
  description:
    '月額16米ドルの専用Linuxサービス。登録、Add、実行、使用量、成果を管理します。',
};
export default function Page() {
  return <SkyLinuxService />;
}
