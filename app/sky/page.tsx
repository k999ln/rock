import type { Metadata } from 'next';
import SkyWorkspace from '@/components/sky-workspace';
import { findCampus } from '@/lib/campus-sky';

export const metadata: Metadata = {
  title: 'Sky — RockstarOS',
  description: '自動化アプリを探し、確認して、接続する。',
};

export default async function SkyPage({ searchParams }: { searchParams: Promise<{ campus?: string }> }) {
  const query = await searchParams;
  return <SkyWorkspace campusId={findCampus(query.campus ?? '')?.id} />;
}
