const base = 'http://127.0.0.1:38483';
export async function macPost<T>(
  path: string,
  body: unknown,
  token = '',
): Promise<T> {
  const response = await fetch(base + path, {
    method: 'POST',
    redirect: 'error',
    cache: 'no-store',
    credentials: 'omit',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(65000),
  });
  const data = await response.json();
  if (!response.ok) {
    const message =
      data &&
      typeof data === 'object' &&
      'message' in data &&
      typeof data.message === 'string'
        ? data.message
        : 'Macとの接続を確認してください。';
    throw Error(message);
  }
  return data as T;
}
