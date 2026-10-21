'use client';
import { useCallback, useEffect, useState } from 'react';
import type { SkyFeatureAddition, SkyFeatureId } from './sky-feature-additions';
export function useSkyFeatures() {
  const [features, setFeatures] = useState<SkyFeatureAddition[]>([]);
  const [state, setState] = useState<'loading'|'ready'|'signed-out'|'error'>('loading');
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/sky/features', { cache: 'no-store', signal });
      if (response.status === 401) { setFeatures([]); setState('signed-out'); return; }
      const result = await response.json() as { features?: SkyFeatureAddition[] };
      if (!response.ok || !Array.isArray(result.features)) throw new Error('unavailable');
      if (signal?.aborted) return;
      setFeatures(result.features); setState('ready');
    } catch { if (!signal?.aborted) { setFeatures([]); setState('error'); } }
  }, []);
  useEffect(() => {
    const controller = new AbortController(); const frame = requestAnimationFrame(() => { void refresh(controller.signal); });
    const reload = () => { void refresh(controller.signal); };
    window.addEventListener('sky-features-changed', reload);
    return () => { cancelAnimationFrame(frame); controller.abort(); window.removeEventListener('sky-features-changed', reload); };
  }, [refresh]);
  return { features, state, refresh, enabled: (id: SkyFeatureId) => features.some(f => f.id === id && f.enabled) };
}
