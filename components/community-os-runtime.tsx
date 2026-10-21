'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  communityFetch,
  setCommunityKeyProfile,
} from '@/lib/community-key-client';
import { skyAgentEvePath } from '@/lib/sky-agent-library';
import { communityOsContrast } from '@/lib/community-os';
import type { communityOsStore } from '@/lib/community-os-store';
type State = Awaited<ReturnType<ReturnType<typeof communityOsStore>['state']>>;
export default function CommunityOsRuntime() {
  const sequence = useRef(0);
  const [state, setState] = useState<State | null>(null),
    [error, setError] = useState('');
  const pathname = usePathname(),
    router = useRouter();
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const data = await communityFetch<State>('/api/sky/community-os');
      if (current !== sequence.current) return;
      if (data.profileId) setCommunityKeyProfile(data.profileId);
      if (current !== sequence.current) return;
      setState(data);
      setError('');
    } catch {
      if (current === sequence.current) setState(null);
    }
  }, []);
  useEffect(() => {
    const f = requestAnimationFrame(() => void refresh());
    const changed = () => void refresh(),
      visible = () => {
        if (document.visibilityState === 'visible') void refresh();
      };
    window.addEventListener('rockstar-community-changed', changed);
    window.addEventListener('storage', changed);
    document.addEventListener('visibilitychange', visible);
    const interval = window.setInterval(visible, 60000);
    return () => {
      cancelAnimationFrame(f);
      window.removeEventListener('rockstar-community-changed', changed);
      window.removeEventListener('storage', changed);
      document.removeEventListener('visibilitychange', visible);
      clearInterval(interval);
    };
  }, [refresh]);
  const active = state?.active,
    defaultAgent = active?.agents.find((a) => a.templateId === 'eve')?.agent;
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement,
      d = active.manifest.design;
    const values = {
      '--os-bg': d.background,
      '--background': d.background,
      '--os-panel': d.background,
      '--os-raised': d.background,
      '--os-text': d.foreground,
      '--foreground': d.foreground,
      '--os-muted': d.foreground,
      '--os-subtle': d.foreground,
      '--os-accent': d.accent,
      '--os-focus': d.accent,
      '--os-accent-ink':
        communityOsContrast(d.accent, '#ffffff') >= 4.5 ? '#ffffff' : '#111111',
      '--os-radius': d.corners === 'round' ? '20px' : '2px',
    };
    const previous = Object.fromEntries(
      Object.keys(values).map((k) => [k, root.style.getPropertyValue(k)]),
    );
    for (const [k, v] of Object.entries(values)) root.style.setProperty(k, v);
    root.dataset.communityOs = active.communityId;
    root.dataset.communityLayout = d.layout;
    return () => {
      for (const [k, v] of Object.entries(previous))
        if (v) root.style.setProperty(k, v);
        else root.style.removeProperty(k);
      delete root.dataset.communityOs;
      delete root.dataset.communityLayout;
    };
  }, [active]);
  useEffect(() => {
    if (
      pathname === '/chat' &&
      !window.location.search &&
      defaultAgent?.enabled
    )
      router.replace(skyAgentEvePath(defaultAgent));
  }, [pathname, defaultAgent, router]);
  if (!active) return null;
  return (
    <aside
      className="community-os-runtime"
      aria-label="使用中のコミュニティーOS"
    >
      <div>
        <strong>{active.manifest.name}</strong>
        <span>v{active.version} · RockstarOS</span>
      </div>
      <nav>
        {defaultAgent?.enabled && (
          <Link href={skyAgentEvePath(defaultAgent)}>Eveを使う</Link>
        )}
        <Link href={`/#community=${active.communityId}`}>
          このOSのコミュニティー
        </Link>
        <button
          onClick={() => {
            void communityFetch('/api/sky/community-os', {
              action: 'deactivate',
              communityId: active.communityId,
              revision: active.revision,
            })
              .then(() => refresh())
              .catch((e) =>
                setError(
                  e instanceof Error ? e.message : '切り替えできません。',
                ),
              );
          }}
        >
          標準に戻す
        </button>
      </nav>
      {error && <p role="alert">{error}</p>}
    </aside>
  );
}
