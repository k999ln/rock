import Link from 'next/link';
import { RockstarDeviceAuthorization } from '@/components/rockstar-device-authorization';
export const metadata = { title: 'Macを接続 — Noah' };
export default async function Page({ searchParams }: { searchParams: Promise<{ user_code?: string | string[] }> }) {
  const params = await searchParams;
  const code = Array.isArray(params.user_code) ? params.user_code[0] : params.user_code;
  return <section><RockstarDeviceAuthorization initialCode={code ?? ''} noah />
    <Link href="/noah/activity">Noahの実行中へ戻る</Link></section>;
}
