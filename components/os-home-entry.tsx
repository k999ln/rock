'use client';

import { useEffect, useState } from 'react';
import { osEntryRedirect } from '@/lib/os-entry';
import NoahShell from './noah-shell';
import NoahHome from './noah-home';

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
  return showHome ? <NoahShell mode="public"><NoahHome mode="public" /></NoahShell> : <main aria-busy="true">Noahを開いています…</main>;
}
