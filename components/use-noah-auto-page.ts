'use client';
import { useEffect, useRef } from 'react';

/** Read ahead near the end, one request at a time; errors require explicit retry. */
export function useNoahAutoPage(enabled: boolean, cursor: string | null | undefined, load: () => Promise<void>) {
  const end = useRef<HTMLDivElement>(null);
  const latest = useRef(load);
  useEffect(() => { latest.current = load; }, [load]);
  useEffect(() => {
    const element = end.current;
    if (!enabled || !cursor || !element) return;
    let active = true;
    const read = () => { if (active && !document.hidden) void latest.current(); };
    if (typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) read();
      }, {rootMargin:'600px 0px'});
      observer.observe(element);
      return () => { active=false; observer.disconnect(); };
    }
    const check = () => { if (element.getBoundingClientRect().top <= window.innerHeight + 600) read(); };
    window.addEventListener('scroll', check, {passive:true});
    window.addEventListener('resize', check);
    check();
    return () => { active=false; window.removeEventListener('scroll',check); window.removeEventListener('resize',check); };
  }, [enabled,cursor]);
  return end;
}
