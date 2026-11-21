import NoahWorkList from '@/components/noah-work-list';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import styles from '@/components/noah-service.module.css';
export const metadata = { title: '実行中のAgent — Noah' };
export default async function Page({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const params = await searchParams;
  if (typeof params.agent === 'string' && params.agent) redirect(`/noah/mac/activity?${new URLSearchParams({ agent: params.agent })}`);
  return <main className={styles.page}>
    <header className={styles.exploreHeading}><h1>実行中</h1><p>Agentの動きと、届いた成果。</p><Link href="/noah/explore">Agentに頼む</Link></header>
    <NoahWorkList ownerScope={null} refresh={0} heading="あなたの仕事" showEmpty />
  </main>;
}
