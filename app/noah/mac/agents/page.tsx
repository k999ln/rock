import NoahServiceCatalog from '@/components/noah-service-catalog';
import styles from '@/components/noah-service.module.css';
export const metadata = { title: 'Macで使うAgent — Noah' };
export default function Page() { return <main className={styles.page}><h1>Macで使うAgent</h1><NoahServiceCatalog /></main>; }
