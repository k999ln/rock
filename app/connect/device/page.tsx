import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '@/components/connection-workspace.module.css';
import WorkspaceShell from '@/components/workspace-shell';
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
  return <WorkspaceShell title="接続" hideTopActions hideAccountAccess><div className={styles.page}>
    <Link href="/connect/service" className={styles.back}>← 接続の選択へ戻る</Link>
    <div className={styles.deviceArea}><RockstarDeviceAuthorization initialCode={initialCode} /></div>
    <Link href="/os/eve">接続後はEveで仕事を始める →</Link>
  </div></WorkspaceShell>;
}
