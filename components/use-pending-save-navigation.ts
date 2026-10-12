'use client';

import { useEffect } from 'react';
import { guardHistoryNavigation } from '@/lib/history-navigation-guard';

// beforeunload alone does not run for client-side Link navigation. Retain the
// in-memory retry identity until the user has confirmed the save result.
export function usePendingSaveNavigation(pending: boolean) {
  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    const keepPage = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!link || link.getAttribute('target') === '_blank' || link.hasAttribute('download') ||
          link.getAttribute('href')?.startsWith('#')) return;
      event.preventDefault();
    };
    const releaseHistory = guardHistoryNavigation(window, () => true);
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', keepPage, true);
    return () => {
      releaseHistory();
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', keepPage, true);
    };
  }, [pending]);
}
