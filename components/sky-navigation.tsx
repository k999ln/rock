import Link from 'next/link';
import { Bookmark, MessageCircle, Store, Plug, CreditCard } from 'lucide-react';
import styles from './sky-application.module.css';
const destinations = [
  { id: 'market', href: '/noah', label: 'Noahホーム', Icon: Store },
  { id: 'compute', href: '/noah/saved', label: '保存したもの', Icon: Bookmark },
  { id: 'purchases', href: '/noah/purchases', label: '決済・購入履歴', Icon: CreditCard },
  { id: 'network', href: '/noah/network', label: '接続', Icon: Plug },
  { id: 'zema', href: '/os/eve', label: 'Eveを開く', Icon: MessageCircle },
] as const;
export default function SkyNavigation({ active }: { active: typeof destinations[number]['id'] }) {
  return <nav className={styles.navigation} aria-label="Noahの関連機能">
    {destinations.map(({ id, href, label, Icon }) => <Link key={id} href={href} aria-current={active === id ? 'page' : undefined}>
      <Icon size={16} aria-hidden="true" /><span>{label}</span>
    </Link>)}
  </nav>;
}
