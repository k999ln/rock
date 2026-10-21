import type { Metadata } from 'next';
import WorkCompositionWorkspace from '@/components/work-composition-workspace';

export const metadata: Metadata = {
  title: '仕事を組み立てる — Zema',
  description: '素材から処理と検査を組み立て、成果を保存し、仕事のレシピを再利用します。',
};

export default function ComposePage() {
  return <WorkCompositionWorkspace />;
}
