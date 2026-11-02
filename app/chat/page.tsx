import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { eveToolPath } from '@/lib/eve-noah-navigation';
export const metadata: Metadata = { title: 'Eve — RockstarOS', description: 'Noahで選んだToolをEveで使い、仕事と成果を確認します。' };
export default async function ChatPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const values = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
  redirect(eveToolPath(query));
}
