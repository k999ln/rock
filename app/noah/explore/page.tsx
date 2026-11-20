import NoahServiceCatalog from '@/components/noah-service-catalog';
import styles from '@/components/noah-service.module.css';
export const metadata = { title: 'Agentを探す — Noah' };
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const params = await searchParams, query = typeof params.q === 'string' ? params.q.slice(0, 120) : '';
  return <main className={styles.page}><header className={styles.exploreHeading}><span className={styles.eyebrow}>EXPLORE</span><h1>Agentを探す</h1><p>できることを確かめて、あなたの仕事に迎えよう。</p></header><NoahServiceCatalog key={query} initialQuery={query} /></main>;
}
