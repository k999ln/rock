import { headers } from 'next/headers';
import Link from 'next/link';
import NoahIntakeReview from '@/components/noah-intake-review';
import { noahIntakeDependencies } from '@/lib/noah-intake-server';
import { ownerScopeFor } from '@/lib/owner-intent';
import styles from '@/components/noah-service.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Agentの掲載管理 — Noah', robots: { index: false, follow: false } };
export default async function Page() {
  const deps = noahIntakeDependencies();
  let scope: string | null = null;
  try {
    const owner = await deps.authenticate(new Request('https://avoado.si/noah/review/intake', { headers: await headers() }));
    if (deps.reviewers.includes(owner)) scope = await ownerScopeFor(owner);
  } catch { /* Account or service unavailable: never render privileged controls. */ }
  return <main className={styles.page}>
    <h1>Agentの掲載管理</h1>
    {scope && <p><Link href="/noah/review/pins">図解ピン 200 件の審査</Link></p>}
    {scope ? <NoahIntakeReview ownerScope={scope} /> : <p>掲載担当のアカウントで開いてください。<Link href="/noah/account?returnTo=%2Fnoah%2Freview%2Fintake">ログイン</Link></p>}
  </main>;
}
