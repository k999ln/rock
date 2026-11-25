import { headers } from 'next/headers';
import Link from 'next/link';
import NoahPinReview from '@/components/noah-pin-review';
import styles from '@/components/noah-service.module.css';
import { noahIntakeDependencies } from '@/lib/noah-intake-server';
import { ownerScopeFor } from '@/lib/owner-intent';

export const dynamic = 'force-dynamic';
export const metadata = { title: '図解ピンの審査 — Noah', robots: { index: false, follow: false } };

export default async function Page() {
  const deps = noahIntakeDependencies();
  let scope: string | null = null;
  try {
    const owner = await deps.authenticate(new Request(new URL('/noah/review/pins', deps.origin), { headers: await headers() }));
    if (deps.reviewers.includes(owner)) scope = await ownerScopeFor(owner);
  } catch { /* 審査権限を確認できない場合は操作を出しません。 */ }
  return <main className={styles.page}>
    <h1>図解ピンの審査</h1>
    {scope
      ? <NoahPinReview ownerScope={scope} />
      : <p>審査担当のアカウントで開いてください。 <Link href="/noah/account?returnTo=%2Fnoah%2Freview%2Fpins">ログイン</Link></p>}
  </main>;
}
