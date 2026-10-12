'use client';

import { Download, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import styles from './nfc-install-guide.module.css';

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

// Keep the existing public NFC/PWA entry alongside the current Home layout.
export default function NfcInstallGuide() {
  const [nfcEntry, setNfcEntry] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [installDismissed, setInstallDismissed] = useState(false);
  const promptActive = useRef(false);
  useEffect(() => {
    const initialize = window.setTimeout(() => {
      setNfcEntry(new URLSearchParams(window.location.search).get('nfc') === '1');
      setInstalled(window.matchMedia('(display-mode: standalone)').matches ||
        ('standalone' in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true));
    }, 0);
    function onBeforeInstall(event: Event) {
      if (new URLSearchParams(window.location.search).get('nfc') !== '1') return;
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    }
    function onInstalled() { setInstalled(true); setInstallPrompt(null); }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.clearTimeout(initialize);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  async function requestInstall() {
    if (!installPrompt || promptActive.current) return;
    promptActive.current = true;
    try { await installPrompt.prompt(); await installPrompt.userChoice; }
    catch { /* Browser withdrawal leaves the existing manual instructions available. */ }
    finally { promptActive.current = false; setInstallPrompt(null); }
  }
  return <>
      {nfcEntry && !installed && !installDismissed && (
        <aside
          className={styles.nfcInstall}
          aria-labelledby="nfc-install-title"
        >
          <button
            className={styles.nfcClose}
            onClick={() => setInstallDismissed(true)}
            aria-label="追加案内を閉じる"
          >
            <X size={18} />
          </button>
          <span className={styles.nfcEyebrow}>NFCから開きました</span>
          <h2 id="nfc-install-title">RockstarOSをホームに置く</h2>
          <p>
            このままSky・Zema・Walletを使えます。次回からアプリのように開くなら、端末のホーム画面にも追加できます。
          </p>
          {installPrompt ? (
            <button
              className={styles.nfcInstallButton}
              onClick={() => void requestInstall()}
            >
              <Download size={17} /> アプリとして追加
            </button>
          ) : (
            <p className={styles.nfcSteps}>
              iPhone: Safariの共有 →「ホーム画面に追加」
              <br />
              Android: Chromeのメニュー →「アプリをインストール」
            </p>
          )}
          <Link className={styles.nfcDownloadLink} href="/rockstaros#start">
            実OS版の配布状況を見る <span aria-hidden="true">↗</span>
          </Link>
          <p className={styles.nfcBoundary}>
            追加されるのはWeb版です。NFCタグやこの操作でスマホ本体のOSは書き換わりません。
          </p>
        </aside>
      )}

  </>;
}
