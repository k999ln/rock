import Link from 'next/link';
import { MessageCircle, Store, Grid2X2, ListChecks } from 'lucide-react';
import styles from './sky-application.module.css';
const destinations = [
  { id: 'chat', href: '/chat', label: '会話', Icon: MessageCircle },
  { id: 'library', href: '/zema/library', label: 'ライブラリ', Icon: Grid2X2 },
  { id: 'work', href: '/chat?view=work', label: '仕事', Icon: ListChecks },
  { id: 'sky', href: '/sky', label: 'Skyで探す', Icon: Store },
] as const;
export default function ZemaNavigation({
  active,
}: {
  active: (typeof destinations)[number]['id'];
}) {
  return (
    <nav className={styles.navigation} aria-label="Zemaナビゲーション">
      {destinations.map(({ id, href, label, Icon }) => (
        <Link
          key={id}
          href={href}
          aria-current={active === id ? 'page' : undefined}
        >
          <Icon size={16} aria-hidden="true" />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
