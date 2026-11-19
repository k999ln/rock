import Link from 'next/link';
import { Cpu, MessageCircle, Store, Plug, CreditCard } from 'lucide-react';
import styles from './sky-application.module.css';
const destinations = [
  { id: 'market', href: '/noah/tools', label: 'Noahで探す', Icon: Store },
  { id: 'compute', href: '/noah/compute-grid', label: 'Compute Grid', Icon: Cpu },
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
