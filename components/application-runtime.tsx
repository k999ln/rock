'use client';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

const CommunityOsRuntime = dynamic(() => import('./community-os-runtime'), { ssr: false });

/** Standalone Noah never mounts the OS runtime, including after client navigation. */
export default function ApplicationRuntime() {
  const pathname = usePathname();
  if (pathname === '/noah' || pathname.startsWith('/noah/')) return null;
  return <CommunityOsRuntime />;
}
