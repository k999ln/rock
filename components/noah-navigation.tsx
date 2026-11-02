import Link from 'next/link';
import styles from './eve-sync-workspace.module.css';
const destinations = [
  ['home', '/#timeline', 'Noahホーム'],
  ['discover', '/#sky', '探して追加'],
  ['library', '/#sky-manage', 'ライブラリ'],
  ['tools', '/os/sky', 'Tool一覧'],
  ['devices', '/sky/devices', '端末・担当'],
  ['connections', '/connect/service', '接続・権限'],
] as const;
export default function NoahNavigation({ active }: { active?: typeof destinations[number][0] }) {
  return <nav className={styles.noahNavigation} aria-label="Noahの機能">
    {destinations.map(([id, href, label]) => <Link key={id} href={href} aria-current={id === active ? 'page' : undefined}>{label}</Link>)}
  </nav>;
}
