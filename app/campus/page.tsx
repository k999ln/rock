import type { Metadata } from 'next';
import CampusWorkspace from '@/components/campus-workspace';
import { CAMPUS_IDS, type CampusId } from '@/lib/campus';

export const metadata: Metadata = {
  title: 'Campus — Avocado',
  description:
    '大学ごとの人・プロジェクト・機会・イベント・コミュニティ・ポートフォリオをつなぐAvocado Campus。',
};

export default async function CampusPage({
  searchParams,
}: {
  searchParams: Promise<{ campus?: string; mode?: string; tag?: string; source?: string }>;
}) {
  const params = await searchParams;
  const campus = CAMPUS_IDS.includes(params.campus as CampusId)
    ? (params.campus as CampusId)
    : 'nyu';
  return (
    <CampusWorkspace
      initialCampus={campus}
      entryMode={params.mode}
      entryTag={params.tag}
      entrySource={params.source}
    />
  );
}
