import {
  Bot,
  Code2,
  FileText,
  ImageIcon,
  Search,
  Sprout,
  ArrowRight,
  Layers,
} from 'lucide-react';
import styles from './noah-unified.module.css';
/** Capability illustration, never a fabricated result or usage claim. */
export default function NoahAgentVisual({
  name,
  summary = '',
  compact = false,
}: {
  name: string;
  summary?: string;
  compact?: boolean;
}) {
  const words = `${name} ${summary}`.toLowerCase();
  const Icon = /plant|garden|植物|栽培/.test(words)
    ? Sprout
    : /image|photo|design|画像|写真|デザイン/.test(words)
      ? ImageIcon
      : /code|github|developer|コード/.test(words)
        ? Code2
        : /research|search|調査|検索/.test(words)
          ? Search
          : FileText;
  return (
    <span
      className={compact ? styles.visualSmall : styles.visual}
      aria-hidden="true"
    >
      <span className={styles.visualIcon}>
        <Icon size={compact ? 24 : 32} />
      </span>
      {!compact && (
        <>
          <ArrowRight size={16} />
          <span className={styles.visualOutput}>
            <Layers size={24} />
            <i />
            <i />
            <i />
          </span>
        </>
      )}
      <Bot size={12} className={styles.visualBot} />
    </span>
  );
}
