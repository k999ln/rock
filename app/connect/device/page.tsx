import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '@/components/connection-workspace.module.css';
import NoahShell from '@/components/noah-shell';
import { NoahLocaleProvider } from '@/components/noah-locale';
import { RockstarDeviceAuthorization } from '@/components/rockstar-device-authorization';

export const metadata: Metadata = {
  title: 'Macを接続 — Noah',
  description: 'Noahの仕事を実行するMacを確認して接続し、必要に応じて取り消します。',
};

export default async function ConnectDevicePage({
  searchParams,
}: {
  searchParams: Promise<{ user_code?: string | string[] }>;
}) {
  const params = await searchParams;
  const initialCode = Array.isArray(params.user_code) ? params.user_code[0] ?? '' : params.user_code ?? '';
  return <NoahLocaleProvider><NoahShell mode="public"><div className={styles.page}>
    <Link href="/noah/activity" className={styles.back}>← Noahの実行中へ戻る</Link>
    <div className={styles.deviceArea}><RockstarDeviceAuthorization initialCode={initialCode} /></div>
    <Link href="/noah/activity">Noahで仕事を依頼する →</Link>
  </div></NoahShell></NoahLocaleProvider>;
}
