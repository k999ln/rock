import { InstallError } from './noah-source-fetch.mjs';

/** Transport only. Callers still enforce socket/Host/Origin and account authority.
 * Agent data cannot select a remote destination or add forwarded credentials. */
export function createNoahLocalRequest(incoming, fetcher = fetch) {
  const host = incoming.headers.host;
  if (typeof host !== 'string' || !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host))
    throw new InstallError('このMacのNoahから接続してください。', 403);
  const base = new URL(`http://${host}`), credentials = {};
  for (const key of ['cookie', 'authorization', 'oai-authenticated-user-id'])
    if (typeof incoming.headers[key] === 'string') credentials[key] = incoming.headers[key];
  return (path, { method = 'GET', json, scope, timeoutMs = 10000 } = {}) => {
    const url = new URL(path, base);
    if (!path.startsWith('/api/noah/') || url.origin !== base.origin || !url.pathname.startsWith('/api/noah/') || url.hash)
      throw new InstallError('Noahの接続先を確認してください。', 400);
    const headers = { ...credentials };
    if (scope !== undefined) Object.assign(headers, { 'Content-Type': 'application/json', Origin: base.origin, 'X-Rock-Owner-Scope': scope });
    if (json !== undefined) headers['Content-Type'] = 'application/json';
    return fetcher(url.href, { method, headers, ...(json === undefined ? {} : { body: JSON.stringify(json) }), redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
  };
}

const records = {
  work: { resource: 'executions', query: ['id', 'agentId', 'summary'], error: '仕事の記録を確認できません。' },
  instance: { resource: 'instances', query: ['id', 'agentId'], error: 'ライブラリの記録を確認できません。', owner: true },
  operation: { resource: 'operations', query: ['id', 'agentId', 'archived'], error: '運用記録を確認できません。' },
};

/** Preserve each existing record API's query and response contract. */
export function createNoahLocalRecordClients(incoming, scope, fetcher = fetch) {
  const request = createNoahLocalRequest(incoming, fetcher);
  return Object.fromEntries(Object.entries(records).map(([name, contract]) => [name, async (action, input) => {
    const get = action === 'get', query = new URLSearchParams();
    if (get) for (const key of contract.query) if (typeof input[key] === 'string') query.set(key, input[key]);
    const response = await request(`/api/noah/${contract.resource}${query.size ? `?${query}` : ''}`, {
      method: get ? 'GET' : 'POST', scope, ...(get ? {} : { json: { ...input, action } }),
    });
    const data = await response.json();
    if (!response.ok || contract.owner && data.ownerScope !== scope)
      throw new InstallError(data.error || contract.error, response.ok ? 409 : response.status);
    return data;
  }]));
}
