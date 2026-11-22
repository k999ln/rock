'use client';
import { useNoahLocale } from './noah-locale';
import { useEffect, useId, useSyncExternalStore, type ReactNode } from 'react';
import { noahControlFeedback, noahHaptic, noahHapticsEnabled, noahHapticsSupported, setNoahHaptics, subscribeNoahHaptics } from '@/lib/noah-haptics';
import styles from './noah-interaction.module.css';
import { noahConnectionSoundEnabled, setNoahConnectionSound, subscribeNoahConnectionSound } from '@/lib/noah-connection-sound';
import { disposeNoahTapSound, playNoahTapSound } from '@/lib/noah-tap-sound';

export function NoahInteraction({ children }: { children: ReactNode }) {
  useEffect(() => {
    const hide = () => { if (document.hidden) disposeNoahTapSound(); };
    const unsubscribe = subscribeNoahConnectionSound(() => { if (!noahConnectionSoundEnabled()) disposeNoahTapSound(); });
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', disposeNoahTapSound);
    return () => { unsubscribe(); document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', disposeNoahTapSound); disposeNoahTapSound(); };
  }, []);
  return <div className={styles.surface} onClickCapture={event => {
    const kind = noahControlFeedback(event.target, event.isTrusted);
    if (kind) { noahHaptic(kind); playNoahTapSound(kind === 'select' ? 'select' : 'tap'); }
  }} onChangeCapture={event => {
    if (event.isTrusted && event.target instanceof HTMLSelectElement && !event.target.disabled) { noahHaptic('select'); playNoahTapSound('select'); }
  }}>{children}</div>;
}

export function NoahHapticsSetting() {
  const {t}=useNoahLocale();

  const id = useId();
  const enabled = useSyncExternalStore(subscribeNoahHaptics, noahHapticsEnabled, () => true);
  const supported = useSyncExternalStore(subscribeNoahHaptics, noahHapticsSupported, () => false);
  const soundEnabled = useSyncExternalStore(subscribeNoahConnectionSound, noahConnectionSoundEnabled, () => true);
  return <section className={styles.setting}>
    <label htmlFor={id} aria-label={t("タップの振動")}><span><strong>{t("タップの振動")}</strong><small>{supported ? t("この端末で使う") : t("このブラウザは振動に対応していません")}</small></span>
      <input id={id} type="checkbox" checked={enabled} data-noah-haptic="off" onChange={event => {
        setNoahHaptics(event.target.checked);
        if (event.target.checked) noahHaptic('select');
      }} />
    </label>
    <label htmlFor={`${id}-sound`} aria-label={t('タップ・接続の音')}><span><strong>{t('タップ・接続の音')}</strong><small>{t('この端末で使う')}</small></span>
      <input id={`${id}-sound`} type="checkbox" checked={soundEnabled} data-noah-haptic="off" onChange={event => { setNoahConnectionSound(event.target.checked); if (event.target.checked) playNoahTapSound('select'); }} />
    </label>
    <button type="button" className={styles.tryFeedback} data-noah-haptic="off" onClick={() => { noahHaptic('select'); playNoahTapSound('select'); }}>{t('反応を試す')}</button>
  </section>;
}
