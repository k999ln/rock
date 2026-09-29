'use client';

import { useEffect, useState } from 'react';
import { deviceToken } from '@/lib/device';
import { fashionMcpConnected } from '@/lib/fashion-mcp-client';
import { operationRequest } from '@/lib/operations-client';
import type { SkyConnection } from '@/lib/operations';
import type { SkyToolUiContext } from '@/lib/sky-tool-ui';

// Use the same runtime signals as Sky home; a registration is not a provider connection.
export function useSkyToolContext(): SkyToolUiContext {
  const [context, setContext] = useState<SkyToolUiContext>({});
  useEffect(() => {
    let active = true;
    const update = () => setContext((current) => ({
      ...current,
      pcConnected: Boolean(deviceToken()),
      fashionConnected: fashionMcpConnected(),
    }));
    update();
    window.addEventListener('loop-device', update);
    window.addEventListener('sky-fashion-mcp', update);
    void operationRequest<SkyConnection[]>('/api/sky/connections').then((connections) => {
      if (active) setContext((current) => ({ ...current, connectedTools: connections.map(({ tool }) => tool) }));
    }).catch(() => { /* Unknown registration never implies a working connection. */ });
    return () => {
      active = false;
      window.removeEventListener('loop-device', update);
      window.removeEventListener('sky-fashion-mcp', update);
    };
  }, []);
  return context;
}
