'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Radio, MessageCircle, Users } from 'lucide-react';
import { activeOsNavigation, osNavigationItems, osRouteHref, type OsNavigationId } from '@/lib/os-navigation';

const icons = { stream: Radio, eve: MessageCircle, communities: Users };

/** The same three destinations and footprint on Home and every OS workspace. */
export default function OsAppNavigation({
  className = '', active, running = false, 'aria-label': label = 'RockstarOSの主要サービス',
}: { className?: string; active?: OsNavigationId; running?: boolean; 'aria-label'?: string }) {
  const pathname = usePathname();
  const [hash, setHash] = useState('');
  useEffect(() => {
    const changed = () => setHash(window.location.hash);
    changed();
    window.addEventListener('hashchange', changed);
    window.addEventListener('popstate', changed);
    return () => { window.removeEventListener('hashchange', changed); window.removeEventListener('popstate', changed); };
  }, [pathname]);
  const selected = active ?? activeOsNavigation(pathname, hash);
  return <nav className={`os-app-navigation os-shell-navigation ${className}`} aria-label={label}
    style={{ '--os-navigation-count': osNavigationItems.length } as CSSProperties}
    onClickCapture={event => { if (running) event.preventDefault(); }}>
    {osNavigationItems.map(item => {
      const Icon = icons[item.id];
      return <Link key={item.id} href={osRouteHref(pathname, item.href, process.env.NODE_ENV === 'development')}
        aria-label={item.label} aria-current={selected === item.id ? 'page' : undefined}
        aria-disabled={running || undefined} data-os-destination={item.id}>
        <Icon size={25} strokeWidth={selected === item.id ? 2 : 1.7} /><span>{item.label}</span>
      </Link>;
    })}
  </nav>;
}
