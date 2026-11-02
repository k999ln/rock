'use client';
import { useEffect } from 'react';
import { shouldRevealFeedUpdates } from '@/lib/sky-continuous-ranking';

/** New rows enter automatically only while the reader is at the head. */
export function useSkyFeedReveal(
  feed: { pending: number; acceptUpdates: () => void },
  enabled: boolean,
  live: boolean,
) {
  useEffect(() => {
    let frame = 0;
    const reveal = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (
          shouldRevealFeedUpdates({
            enabled,
            live,
            pending: feed.pending,
            scrollY: window.scrollY,
            visible: document.visibilityState === 'visible',
            composing: Boolean(
              document.activeElement?.matches(
                'input, textarea, [contenteditable="true"]',
              ),
            ),
            selecting: window.getSelection()?.isCollapsed === false,
          })
        )
          feed.acceptUpdates();
      });
    };
    reveal();
    window.addEventListener('scroll', reveal, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', reveal);
    };
  }, [feed, enabled, live]);
}
