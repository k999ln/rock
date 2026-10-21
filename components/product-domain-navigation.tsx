import { productDomains } from '@/lib/product-domains';
import styles from './product-domain-navigation.module.css';

export function ProductDomainNavigation() {
  return <nav className={styles.navigation} aria-label="製品ドメインの入口">
    <h2>サービスと端末の入口</h2>
    <div className={styles.links}>{productDomains.map((domain) => <a key={domain.id} href={domain.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
      <strong>{domain.hostname}</strong><span>{domain.role}</span>
    </a>)}</div>
  </nav>;
}
