'use client';
import { useId, useSyncExternalStore, type ReactNode } from 'react';
import { noahControlFeedback, noahHaptic, noahHapticsEnabled, noahHapticsSupported, setNoahHaptics, subscribeNoahHaptics } from '@/lib/noah-haptics';
import styles from './noah-interaction.module.css';

export function NoahInteraction({ children }: { children: ReactNode }) {
  return <div className={styles.surface} onClickCapture={event => {
    const kind = noahControlFeedback(event.target, event.isTrusted);
    if (kind) noahHaptic(kind);
  }} onChangeCapture={event => {
    if (event.isTrusted && event.target instanceof HTMLSelectElement && !event.target.disabled) noahHaptic('select');
  }}>{children}</div>;
}

export function NoahHapticsSetting() {
  const id = useId();
  const enabled = useSyncExternalStore(subscribeNoahHaptics, noahHapticsEnabled, () => true);
  const supported = useSyncExternalStore(subscribeNoahHaptics, noahHapticsSupported, () => false);
  return <section className={styles.setting}>
    <label htmlFor={id} aria-label="タップの振動"><span><strong>タップの振動</strong><small>{supported ? 'この端末で使う' : '対応端末で使えます'}</small></span>
      <input id={id} type="checkbox" checked={enabled} data-noah-haptic="off" onChange={event => {
        setNoahHaptics(event.target.checked);
        if (event.target.checked) noahHaptic('select');
      }} />
    </label>
  </section>;
}
