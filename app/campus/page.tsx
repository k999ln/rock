import type { Metadata } from 'next';
import { headers } from 'next/headers';
import CampusWorkspace from '@/components/campus-workspace';
import { CAMPUS_IDS, type CampusId } from '@/lib/campus';
import { campusForHost } from '@/lib/campus-host';

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
  const hostCampus = campusForHost((await headers()).get('host'));
  const campus = CAMPUS_IDS.includes(params.campus as CampusId)
    ? (params.campus as CampusId)
    : (hostCampus ?? 'nyu');
  return (
    <CampusWorkspace
      initialCampus={campus}
      entryMode={params.mode}
      entryTag={params.tag}
      entrySource={params.source}
    />
  );
}
