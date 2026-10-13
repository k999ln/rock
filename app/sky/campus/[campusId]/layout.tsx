import type { Metadata } from 'next';
import { CAMPUSES, CAMPUS_IDS, type CampusId } from '@/lib/campus';

export async function generateMetadata({params}: {params: Promise<{campusId: string}>}): Promise<Metadata> {
  const {campusId} = await params;
  if (!CAMPUS_IDS.includes(campusId as CampusId)) return {};
  const campus = CAMPUSES[campusId as CampusId];
  return {
    applicationName: `${campus.shortName} Sky`,
    manifest: `/os/sky/campus/${campusId}/manifest.webmanifest`,
    appleWebApp: {capable: true, title: `${campus.shortName} Sky`, statusBarStyle: 'default'},
  };
}

export default function CampusSkyLayout({children}: {children: React.ReactNode}) {
  return children;
}
