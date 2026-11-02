'use client';

import { useEffect, useState } from 'react';
import { osEntryRedirect } from '@/lib/os-entry';
import HomeScreen from './home-screen';

/** Fragment navigation is resolved in the browser; never drop an existing handoff. */
export default function OsHomeEntry() {
  const [showHome, setShowHome] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const destination = osEntryRedirect(window.location.pathname, window.location.search, window.location.hash);
      if (destination) window.location.replace(destination);
      else setShowHome(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return showHome ? <HomeScreen /> : <main aria-busy="true">Eveを開いています…</main>;
}
