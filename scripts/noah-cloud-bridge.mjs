import { readFile } from 'node:fs/promises';
import { AGENT_ID, MANIFEST_SHA256, OWNER_SCOPE } from '../services/noah-test-runtime/src/protocol.mjs';
import { ConnectionError } from './noah-connection-manager.mjs';

// The management credential remains on the local server. The browser receives
// only a five-minute, single-use pairing URL scoped to this fixed test Agent.
export async function connectNoahCloud(context, configurationPath, fetchImpl = fetch) {
  if (context.ownerScope !== OWNER_SCOPE || context.agent?.id !== AGENT_ID || context.agent?.manifestSha256 !== MANIFEST_SHA256 || context.agent?.uploadState !== 'ready') throw new ConnectionError('このクラウド接続は本人の固定テストAgent専用です。', 403);
  let config;
  try { config = JSON.parse(await readFile(configurationPath, 'utf8')); } catch { throw new ConnectionError('クラウド接続がまだ設定されていません。', 503); }
  if (typeof config.origin !== 'string' || !/^https:\/\/avokado-noah-test-runtime\.[a-z0-9-]+\.workers\.dev$/.test(config.origin) || !/^[a-f0-9]{64}$/.test(config.secret)) throw new ConnectionError('クラウド接続の設定を確認してください。', 503);
  let result;
  try { result = await fetchImpl(`${config.origin}/api/pair`, { method: 'POST', headers: { Authorization: `Bearer ${config.secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ownerScope: context.ownerScope, agentId: context.agent.id }), redirect: 'error', signal: AbortSignal.timeout(10000) }); }
  catch { throw new ConnectionError('クラウドに接続できません。通信を確認してください。', 503); }
  if (!result.ok) throw new ConnectionError(result.status === 429 ? '接続待ちが多いため、5分後にお試しください。' : 'クラウドの認証・接続を確認できません。', result.status === 429 ? 429 : 503);
  const data = await result.json();
  if (typeof data.url !== 'string' || !data.url.startsWith(`${config.origin}/noah/agents/${AGENT_ID}#connect=`) || !/^[a-f0-9]{64}$/.test(data.url.split('#connect=')[1])) throw new ConnectionError('クラウドの接続応答を確認できません。', 503);
  return { url: data.url, expiresAt: data.expiresAt };
}
