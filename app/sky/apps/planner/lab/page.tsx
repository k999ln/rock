import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import SkyPlannerLab from '@/components/sky-planner-lab';
import { skyPrivateLabAllowed } from '@/lib/sky-app-contract';

export const metadata: Metadata = { title: 'Sky基盤 — Planner本人用Lab', robots: { index: false, follow: false } };
export default async function SkyPlannerLabPage() {
  const h = await headers();
  if (!skyPrivateLabAllowed(process.env.NODE_ENV, h.get('host'))) notFound();
  return <SkyPlannerLab />;
}
