import NoahReady from '@/components/noah-ready';
import NoahShelf from '@/components/noah-shelf';
import NoahTrialEntry from '@/components/noah-trial-entry';
export const metadata = { title: 'すぐ使える Agent — Noah' };
// via: 試行の経路の札（docs/noah/trial-300.md の 4 章）。形と、登録されているかは、入口が確かめる。
export default async function Page({ searchParams }: { searchParams: Promise<{ via?: string | string[] }> }) {
  const params = await searchParams, via = typeof params.via === 'string' ? params.via.slice(0, 40) : null;
  return <><NoahTrialEntry via={via} /><NoahReady shelf={<NoahShelf />} /></>;
}
