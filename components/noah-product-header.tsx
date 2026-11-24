import type { ReactNode } from 'react';
import type { NoahPinTopic } from '@/lib/noah-pins';
import NoahAppIcon from './noah-app-icon';
import styles from './noah-product-header.module.css';

export default function NoahProductHeader({ name, title = name, topic, attribution, action }: {
  name: string;
  title?: string;
  topic?: NoahPinTopic;
  attribution?: string;
  action?: ReactNode;
}) {
  return <header className={styles.header}>
    <NoahAppIcon name={name} topic={topic} className={styles.mark} />
    <div className={styles.identity}>
      <h1>{title}</h1>
      {attribution && <p>{attribution}</p>}
      {action}
    </div>
  </header>;
}
