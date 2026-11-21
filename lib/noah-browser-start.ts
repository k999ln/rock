/** Wait until the server-issued HttpOnly cookie is usable before mounting private Noah views. */
export async function startNoahBrowser(fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<void> {
  const start = async () => {
    const response = await fetcher('/api/noah/session', { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal });
    const body = await response.json() as { connected?: boolean; created?: boolean };
    if (!response.ok || body.connected !== true) throw Error('NOAH_ACCESS_UNAVAILABLE');
    if (body.created) {
      const check = await fetcher('/api/noah/session', { credentials: 'same-origin', cache: 'no-store', signal });
      const observed = await check.json() as { connected?: boolean };
      if (!check.ok || observed.connected !== true) throw Error('NOAH_COOKIE_UNAVAILABLE');
    }
  };
  // Concurrent tabs must reuse the first cookie, not mint competing owners.
  if (globalThis.navigator?.locks) await navigator.locks.request('noah-browser-start-v1', { signal }, start);
  else await start();
}
