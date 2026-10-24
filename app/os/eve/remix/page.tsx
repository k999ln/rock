import WorkCompositionWorkspace from '@/components/work-composition-workspace';

export const metadata = { title: '資料付き依頼を保存 — Eve', robots: { index: false, follow: false } };

export default function Page() {
  return <WorkCompositionWorkspace mode="eve-text" />;
}
