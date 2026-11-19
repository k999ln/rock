/** Shared transport for existing Eve Work views. Domain commands, revision and
 * consent remain in each view; requests are never retried here. */
export function createEveWorkClient(resource: 'tool-work' | 'news-work', failureMessage: string) {
  return async function request<T>(query = '', input?: unknown, method = 'PATCH'): Promise<T> {
    const response = await fetch(`/api/eve/${resource}${query}`, {
      method: input ? method : 'GET', cache: 'no-store', credentials: 'same-origin',
      ...(input ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) } : {}),
    });
    const data = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(data.error ?? failureMessage);
    return data;
  };
}
