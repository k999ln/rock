import type { Metadata } from 'next';
import { findCampus } from '@/lib/campus-sky';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ campus: string }>;
}): Promise<Metadata> {
  const campus = findCampus((await params).campus);
  if (!campus) return {};
  return {
    applicationName: `${campus.shortName} Sky`,
    manifest: `/sky/campus/${campus.id}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: `${campus.shortName} Sky`,
    },
  };
}

export default function CampusSkyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
