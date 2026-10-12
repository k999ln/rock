import type { Metadata } from 'next';
import AmcWorkspace from '@/components/amc-workspace';
export const metadata: Metadata = {
  title: 'AMC — Zema',
  description:
    'Goalと方針を固定し、部隊の任務・依存関係・進捗・成果の検収を管理するAMC司令部。',
};
export default function AmcPage() {
  return <AmcWorkspace />;
}
