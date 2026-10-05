import { createA2AClient, parseA2AAgentCard, type A2AAgentCard } from './a2a-client.ts';

export type StoredA2AAgent = {
  id: string;
  origin: string;
  cardUrl: string;
  agentName: string;
  agentVersion: string;
  cardSha256: string;
  cardJson: string;
  discoveredAt: number;
};

export class A2AAgentDirectoryError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function a2aAgentCardSha256(card: A2AAgentCard) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalJson(card)),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function approvedOrigin(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new A2AAgentDirectoryError('HTTPS originを入力してください。', 'invalid_origin');
  }
  const hostname = url.hostname.toLowerCase();
  const ipv4Literal = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
  const forbiddenSuffix = ['.localhost', '.local', '.internal', '.test', '.invalid'];
  if (
    url.protocol !== 'https:' ||
    url.origin !== value ||
    (url.port !== '' && url.port !== '443') ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !hostname.includes('.') ||
    hostname.endsWith('.') ||
    hostname.startsWith('[') ||
    ipv4Literal ||
    forbiddenSuffix.some((suffix) => hostname.endsWith(suffix)) ||
    ['localhost', 'metadata.google.internal'].includes(hostname)
  )
    throw new A2AAgentDirectoryError(
      '公開HTTPS originだけを登録できます。IPアドレスや内部ホストは使えません。',
      'origin_not_public',
    );
  return url.origin;
}

export async function discoverA2AAgent(
  inputOrigin: string,
  fetcher: typeof fetch = fetch,
) {
  const origin = approvedOrigin(inputOrigin);
  const client = createA2AClient({
    allowedOrigins: [origin],
    fetch: fetcher,
    timeoutMs: 8_000,
  });
  let card: A2AAgentCard;
  try {
    card = await client.discoverAtOrigin(origin);
  } catch {
    throw new A2AAgentDirectoryError(
      'Agent Cardを取得・検証できませんでした。HTTPS、A2A 1.0 JSON-RPC対応、応答サイズを確認してください。',
      'agent_card_unavailable',
      422,
    );
  }
  const cardJson = canonicalJson(card);
  const bytes = new TextEncoder().encode(cardJson);
  if (
    bytes.byteLength > 32_768 ||
    card.name.length > 120 ||
    card.version.length > 80 ||
    card.description.length > 2_000 ||
    (card.skills?.length ?? 0) > 50
  )
    throw new A2AAgentDirectoryError('Agent Cardが保存上限を超えています。', 'agent_card_too_large');
  const jsonRpcInterface = card.supportedInterfaces.find(
    (item) => item.protocolBinding === 'JSONRPC' && item.protocolVersion === '1.0',
  );
  const endpointUrl = new URL(jsonRpcInterface!.url);
  if (endpointUrl.origin !== origin)
    throw new A2AAgentDirectoryError(
      'A2A endpointがAgent Cardのoriginと異なるため登録しません。接続先を別途本人が許可してください。',
      'interface_origin_mismatch',
    );
  const cardSha256 = await a2aAgentCardSha256(card);
  return {
    origin,
    cardUrl: `${origin}/.well-known/agent-card.json`,
    card,
    cardJson,
    cardSha256,
    discoveredAt: Date.now(),
  };
}

export function a2aAgentDirectory(db: Pick<D1Database, 'prepare'>) {
  async function list(ownerUserId: string): Promise<StoredA2AAgent[]> {
    const result = await db
      .prepare(`SELECT id, origin, card_url AS cardUrl, agent_name AS agentName,
        agent_version AS agentVersion, card_sha256 AS cardSha256,
        card_json AS cardJson, discovered_at AS discoveredAt
        FROM sky_a2a_agent_connections WHERE owner_user_id = ?
        ORDER BY discovered_at DESC, id LIMIT 100`)
      .bind(ownerUserId)
      .all<StoredA2AAgent>();
    return result.results;
  }
  return {
    async upsert(ownerUserId: string, entry: Awaited<ReturnType<typeof discoverA2AAgent>>) {
      await db
        .prepare(`INSERT INTO sky_a2a_agent_connections (
          id, owner_user_id, origin, card_url, agent_name, agent_version,
          card_sha256, card_json, discovered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(owner_user_id, origin, agent_name) DO UPDATE SET
          card_url = excluded.card_url,
          agent_version = excluded.agent_version,
          card_sha256 = excluded.card_sha256,
          card_json = excluded.card_json,
          discovered_at = excluded.discovered_at`)
        .bind(
          crypto.randomUUID(),
          ownerUserId,
          entry.origin,
          entry.cardUrl,
          entry.card.name,
          entry.card.version,
          entry.cardSha256,
          entry.cardJson,
          entry.discoveredAt,
        )
        .run();
      return (await list(ownerUserId)).find(
        (item) => item.origin === entry.origin && item.agentName === entry.card.name,
      ) ?? null;
    },
    list,
    async remove(ownerUserId: string, id: string) {
      const result = await db
        .prepare('DELETE FROM sky_a2a_agent_connections WHERE owner_user_id = ? AND id = ?')
        .bind(ownerUserId, id)
        .run();
      return result.meta.changes === 1;
    },
  };
}

export function parseStoredA2AAgent(cardJson: string, supportedRequiredExtensions: string[] = []) {
  return parseA2AAgentCard(JSON.parse(cardJson) as unknown, supportedRequiredExtensions);
}
