'use client';
import { useSyncExternalStore } from 'react';
import { useNoahLocale } from './noah-locale';
import styles from './noah-interaction.module.css';

type Appearance = 'dark' | 'light';
const key = 'noah-detail-theme';
const listeners = new Set<() => void>();
let memory: Appearance = 'dark';
function snapshot(): Appearance {
  try { const saved = localStorage.getItem(key); return saved === 'light' ? 'light' : saved === 'dark' ? 'dark' : memory; }
  catch { return memory; }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const storage = (event: StorageEvent) => { if (!event.key || event.key === key) listener(); };
  window.addEventListener('storage', storage);
  return () => { listeners.delete(listener); window.removeEventListener('storage', storage); };
}
function choose(value: Appearance) {
  memory = value;
  try { localStorage.setItem(key, value); } catch { /* Keep the selection for this session. */ }
  listeners.forEach(listener => listener());
}
export function useNoahAppearance() {
  return useSyncExternalStore(subscribe, snapshot, () => 'dark' as Appearance);
}
export default function NoahAppearanceSetting() {
  const { t } = useNoahLocale();
  const appearance = useNoahAppearance();
  return <section className={styles.setting}>
    <label><strong>{t('表示モード')}</strong>
      <select aria-label={t('表示モード')} value={appearance} onChange={event => choose(event.target.value === 'light' ? 'light' : 'dark')}>
        <option value="dark">{t('ダークモード')}</option>
        <option value="light">{t('ホワイトモード')}</option>
      </select>
    </label>
  </section>;
}
