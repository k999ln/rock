'use client';
import { useNoahLocale } from './noah-locale';
import { useId, useSyncExternalStore, type ReactNode } from 'react';
import { noahControlFeedback, noahHaptic, noahHapticsEnabled, noahHapticsSupported, setNoahHaptics, subscribeNoahHaptics } from '@/lib/noah-haptics';
import styles from './noah-interaction.module.css';
import { noahConnectionSoundEnabled, setNoahConnectionSound, subscribeNoahConnectionSound } from '@/lib/noah-connection-sound';

export function NoahInteraction({ children }: { children: ReactNode }) {
  return <div className={styles.surface} onClickCapture={event => {
    const kind = noahControlFeedback(event.target, event.isTrusted);
    if (kind) noahHaptic(kind);
  }} onChangeCapture={event => {
    if (event.isTrusted && event.target instanceof HTMLSelectElement && !event.target.disabled) noahHaptic('select');
  }}>{children}</div>;
}

export function NoahHapticsSetting() {
  const {t}=useNoahLocale();

  const id = useId();
  const enabled = useSyncExternalStore(subscribeNoahHaptics, noahHapticsEnabled, () => true);
  const supported = useSyncExternalStore(subscribeNoahHaptics, noahHapticsSupported, () => false);
  const soundEnabled = useSyncExternalStore(subscribeNoahConnectionSound, noahConnectionSoundEnabled, () => true);
  return <section className={styles.setting}>
    <label htmlFor={id} aria-label={t("タップの振動")}><span><strong>{t("タップの振動")}</strong><small>{supported ? t("この端末で使う") : t("対応端末で使えます")}</small></span>
      <input id={id} type="checkbox" checked={enabled} data-noah-haptic="off" onChange={event => {
        setNoahHaptics(event.target.checked);
        if (event.target.checked) noahHaptic('select');
      }} />
    </label>
    <label htmlFor={`${id}-sound`} aria-label={t('接続完了の音')}><span><strong>{t('接続完了の音')}</strong><small>{t('この端末で使う')}</small></span>
      <input id={`${id}-sound`} type="checkbox" checked={soundEnabled} onChange={event => setNoahConnectionSound(event.target.checked)} />
    </label>
  </section>;
}
