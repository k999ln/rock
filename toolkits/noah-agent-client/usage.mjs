/** Report one completed execution from the provider's server. Persist the event
 * ID and execution timestamp with the job so retries send the same event. */
export async function reportNoahAgentUsage({
  noahUrl, developerToken, agentId, eventId, installationId, toolName = 'agent',
  outcome, durationMs, occurredAt, fetchImpl = fetch,
}) {
  const url = new URL(noahUrl);
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && loopback))) {
    throw new Error('Use the Noah HTTPS origin (or loopback for development).');
  }
  if (typeof developerToken !== 'string' || !developerToken.startsWith('sky_dev_')) {
    throw new Error('A server-side developer token is required.');
  }
  if (!eventId || !occurredAt) throw new Error('Pass the event ID and timestamp saved with the job.');

  const response = await fetchImpl(new URL('/api/sky/tool-events', url).href, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${developerToken}` },
    body: JSON.stringify({
      eventId, packageKey: `noah-upload:${agentId}`, toolName, installationId, outcome, durationMs, occurredAt,
    }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw Object.assign(new Error(result?.error || 'Usage reporting failed'), { status: response.status });
  }
  return response.json();
}
