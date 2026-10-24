'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Radio, MessageCircle, Users } from 'lucide-react';
import { activeOsNavigation, osNavigationItems } from '@/lib/os-navigation';

const icons = { stream: Radio, eve: MessageCircle, communities: Users };

/** Static navigation only; the destination's existing authentication still applies. */
export default function OsAppNavigation({ running = false, activeHash }: { running?: boolean; activeHash?: string }) {
  const pathname = usePathname();
  const [hash, setHash] = useState('');
  useEffect(() => {
    const changed = () => setHash(window.location.hash);
    changed();
    window.addEventListener('hashchange', changed);
    window.addEventListener('popstate', changed);
    return () => {
      window.removeEventListener('hashchange', changed);
      window.removeEventListener('popstate', changed);
    };
  }, [pathname]);
  // Home owns its hash panel during client Link transitions, which can use
  // pushState/replaceState without hashchange or a pathname change.
  const selected = activeOsNavigation(pathname, activeHash ?? hash);
  return <nav className="os-app-navigation" aria-label="RockstarOSの主要サービス"
    onClickCapture={event => { if (running) event.preventDefault(); }}
    onKeyDownCapture={event => {
      if (running && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
    }}>
    {osNavigationItems.map(item => {
      const Icon = icons[item.id];
      return <Link key={item.id} href={item.href} prefetch={false}
        aria-current={selected === item.id ? 'page' : undefined}
        aria-disabled={running || undefined}>
        <Icon size={23} aria-hidden="true" strokeWidth={selected === item.id ? 2.3 : 1.7} />
        <span>{item.label}</span>
      </Link>;
    })}
  </nav>;
}
