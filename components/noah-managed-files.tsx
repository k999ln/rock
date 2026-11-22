'use client';
import type { NoahCloudFile } from '@/lib/noah-cloud-contract';
import { useNoahLocale } from './noah-locale';
import styles from './noah-unified.module.css';

export default function NoahManagedFiles({ files }: { files: NoahCloudFile[] }) {
  const { t } = useNoahLocale();
  function save(file: NoahCloudFile) {
    const bytes = Uint8Array.from(atob(file.base64), char => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    const link = document.createElement('a');
    link.href = url; link.download = file.name.split('/').at(-1) || 'result';
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className={styles.actions}>{files.map(file => <button key={file.name} className={styles.secondary} style={{ maxWidth: '100%' }} onClick={() => save(file)}><span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{file.name} · {t('保存')}</span></button>)}</div>;
}
