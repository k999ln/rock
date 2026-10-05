import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '@/components/sky-commerce.module.css';
import { RockstarDeviceAuthorization } from '@/components/rockstar-device-authorization';

export const metadata: Metadata = {
  title: 'RockstarOS端末を接続',
  description: 'Rockstar IDで端末接続を承認し、必要に応じて取り消します。',
};

export default async function ConnectDevicePage({
  searchParams,
}: {
  searchParams: Promise<{ user_code?: string | string[] }>;
}) {
  const params = await searchParams;
  const initialCode = Array.isArray(params.user_code) ? params.user_code[0] ?? '' : params.user_code ?? '';
  return <main className={styles.shell}><div className={styles.page}>
    <Link href="/connect" className={styles.back}>利用開始ガイドへ戻る</Link>
    <RockstarDeviceAuthorization initialCode={initialCode} />
  </div></main>;
}
