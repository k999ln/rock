import NoahMacHandoff from '@/components/noah-mac-handoff';
import type { Metadata } from 'next';
import { NOAH_PUBLIC_ORIGIN } from '@/lib/noah-public-guide';

export const metadata: Metadata = {
  title: 'Apple Silicon MacをNoahにつなぐ — Noah',
  description: 'Noah Runnerを入手し、自分のMacを同じアカウントで承認してAgentを使う準備をします。',
  alternates: { canonical: `${NOAH_PUBLIC_ORIGIN}/noah/mac` },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const q = await searchParams;
  return (
    <NoahMacHandoff initialAgent={typeof q.agent === 'string' ? q.agent : ''} />
  );
}
