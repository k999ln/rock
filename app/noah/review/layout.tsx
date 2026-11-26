import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { noahIntakeDependencies } from '@/lib/noah-intake-server';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default async function ReviewLayout({ children }: { children: React.ReactNode }) {
  let allowed = false;
  try {
    const deps = noahIntakeDependencies();
    const owner = await deps.authenticate(new Request('https://avoado.si/noah/review', { headers: await headers() }));
    allowed = deps.reviewers.includes(owner);
  } catch { /* Authentication/service failure never exposes operator screens. */ }
  if (!allowed) notFound();
  return children;
}
