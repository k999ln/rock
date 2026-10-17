'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import styles from './campus-sky.module.css';

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export default function CampusSkyInstall({ campusName }: { campusName: string }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const display = window.matchMedia('(display-mode: standalone)');
    const sync = () => setInstalled(display.matches || ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone)));
    const capture = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const complete = () => { setInstalled(true); setPrompt(null); };
    sync();
    display.addEventListener('change', sync);
    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', complete);
    return () => {
      display.removeEventListener('change', sync);
      window.removeEventListener('beforeinstallprompt', capture);
      window.removeEventListener('appinstalled', complete);
    };
  }, []);
  if (installed) return null;
  return <section className={styles.install} aria-labelledby="campus-install-title">
    <div>
      <p className={styles.eyebrow}>ADD YOUR CAMPUS SKY</p>
      <h2 id="campus-install-title">Keep {campusName} Sky on your phone.</h2>
      <p>Open it from your Home Screen next time. Your account and purchases still require sign-in.</p>
    </div>
    {prompt ? <button type="button" className={styles.primary} onClick={async () => {
      try {
        await prompt.prompt();
        await prompt.userChoice;
      } catch { /* Browser may withdraw the install prompt; manual guidance remains available. */ }
      setPrompt(null);
    }}><Download size={17} /> Add to Home Screen</button> : <p className={styles.note}>On iPhone, open this page in Safari, then choose Share → Add to Home Screen. On Android, use your browser menu → Install app or Add to Home Screen when offered.</p>}
  </section>;
}
