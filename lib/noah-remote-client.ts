export class NoahRemoteClientError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function noahRemoteFetch<T>(
  url: string,
  options: { body?: unknown; ownerScope?: string; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
    credentials: 'same-origin',
    signal: options.signal,
    ...(options.body
      ? {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Rock-Owner-Scope': options.ownerScope ?? '',
          },
          body: JSON.stringify(options.body),
        }
      : {}),
  });
  const value = (await response.json()) as T & {
    error?: string;
    ownerScope?: string | null;
  };
  if (!response.ok)
    throw new NoahRemoteClientError(
      value.error ?? '読み込めませんでした。もう一度お試しください。',
      response.status,
    );
  if (
    options.ownerScope &&
    value.ownerScope &&
    value.ownerScope !== options.ownerScope
  )
    throw new NoahRemoteClientError(
      'アカウントが変わりました。再読み込みしてください。',
      409,
    );
  return value;
}
export type NoahReadyItem = {
  id: string;
  name: string;
  summary: string;
  provider: string;
  host: string;
  section: 'ran' | 'new';
  tools: number;
  oneTap: boolean;
  checkedAt: number | null;
  connect: { badge: string; need: string | null; placeLabel: string | null };
  connection?: { id: string; state: string } | null;
};
export type NoahRemoteConnectionView = {
  id: string;
  agentId: string;
  state: string;
  revision: number;
  host: string;
  placeLabel: string;
  error: string | null;
  ownerScope?: string;
};
export type NoahRemoteAskView = {
  id: string;
  workId: string;
  connectionId: string;
  state: string;
  revision: number;
  tool: string;
  host: string;
  error: string | null;
  stopRequested: boolean;
  createdAt: number;
  result?: { text: string; truncated: boolean; attachments: number };
};
