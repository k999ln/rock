'use client';

import { useEffect, useState } from 'react';
import { parseSkyServiceStatus, type SkyServiceStatus } from './sky-service-status';

export function useSkyServiceStatus() {
  const [service, setService] = useState<SkyServiceStatus>();
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/sky/service-status', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return;
        const status = parseSkyServiceStatus(await response.json());
        if (!controller.signal.aborted) setService(status);
      }).catch(() => { /* Missing evidence leaves the UI in an unknown state. */ });
    return () => controller.abort();
  }, []);
  return service;
}
