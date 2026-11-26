'use client';
import { useNoahSurface } from './noah-surface-context';
import Link from 'next/link';
import styles from './eve-sync-workspace.module.css';
const destinations = [
  ['home', '/noah', 'Noahホーム'],
  ['library', '/noah/saved', '保存したもの'],
  ['devices', '/noah/devices', '端末・担当'],
  ['connections', '/connect/service', '接続・権限'],
] as const;
export default function NoahNavigation({ active }: { active?: typeof destinations[number][0] | 'tools' | 'discover' }) {
  const noah = useNoahSurface();
  if (noah) return null;
  return <nav className={styles.noahNavigation} aria-label="Noahの機能">
    {destinations.map(([id, href, label]) => <Link key={id} href={href} aria-current={id === active ? 'page' : undefined}>{label}</Link>)}
  </nav>;
}
