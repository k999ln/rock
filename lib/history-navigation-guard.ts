/** Cancel same-document Back/Forward before a router can discard a pending draft.
 * Cross-document navigation still uses beforeunload. Older browsers without the
 * Navigation API keep the existing link/beforeunload protection.
 * https://developer.mozilla.org/en-US/docs/Web/API/Navigation/navigate_event
 */
type HistoryNavigation = {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
  traverseTo(key: string): { committed: Promise<unknown>; finished: Promise<unknown> };
};
type HistoryNavigateEvent = Event & {
  navigationType?: string;
  hashChange?: boolean;
  destination?: { sameDocument?: boolean; key?: string };
};

// Returning true blocks this attempt. A caller may keep resume for an explicit
// discard dialog; it resumes the original history entry, without adding entries.
export function guardHistoryNavigation(host: object, shouldBlock: (resume: () => void) => boolean) {
  const navigation = (host as { navigation?: HistoryNavigation }).navigation;
  if (!navigation?.addEventListener || !navigation.traverseTo) return () => {};
  let resumeKey: string | null = null;
  let active = true;
  const navigate: EventListener = (raw) => {
    const event = raw as HistoryNavigateEvent;
    const key = event.destination?.key;
    if (!event.cancelable || event.navigationType !== 'traverse' ||
        !event.destination?.sameDocument || event.hashChange || !key) return;
    if (resumeKey === key) { resumeKey = null; return; }
    const resume = () => {
      if (!active) return;
      resumeKey = key;
      try {
        const result = navigation.traverseTo(key);
        void result.committed.catch(() => { resumeKey = null; });
        void result.finished.catch(() => { resumeKey = null; });
      } catch { resumeKey = null; }
    };
    if (shouldBlock(resume)) event.preventDefault();
  };
  navigation.addEventListener('navigate', navigate);
  return () => { active = false; resumeKey = null; navigation.removeEventListener('navigate', navigate); };
}
