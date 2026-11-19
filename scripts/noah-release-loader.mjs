import { InstallError } from './noah-source-fetch.mjs';
import { isReleaseAgentId, isReleasePackageKey } from '../lib/noah-release-contract.mjs';
import { parseTerminalRuntime } from '../lib/noah-terminal-contract.mjs';

// Called only after the loopback socket/Host/Origin checks. No remote URL or
// credential supplied by an Agent is used as a destination.
export function releaseSourceLoader(incoming, scope, id, getOwner, fetcher = fetch) {
  if (!isReleaseAgentId(id)) throw new InstallError('配布版の識別名を確認してください。', 400);
  const digest = id.slice(8), base = `http://${incoming.headers.host}`, headers = {};
  for (const key of ['cookie', 'authorization', 'oai-authenticated-user-id']) if (typeof incoming.headers[key] === 'string') headers[key] = incoming.headers[key];
  const options = () => ({ headers, redirect: 'error', signal: AbortSignal.timeout(10000) });
  const read = async () => {
    const owner = await getOwner(incoming);
    if (!owner.localHostOwner || owner.ownerScope !== scope) throw new InstallError('本人の接続が変わりました。', 403);
    const r = await fetcher(`${base}/api/noah/releases?manifest=${digest}`, options());
    const data = await r.json();
    if (!r.ok) throw new InstallError(data.error || '配布版の利用権を確認できません。', r.status);
    const a = data.release;
    if (data.ownerScope !== scope || a?.id !== id || a.manifestSha256 !== digest || !isReleasePackageKey(a.packageKey) ||
      !a.artifact || !a.manifest || JSON.stringify(a.artifact) !== JSON.stringify(a.manifest.source?.artifact)) throw new InstallError('配布版の照合情報を確認できません。', 409);
    const runtime = parseTerminalRuntime(a.artifact.runtime);
    return { id, manifest: { name: a.manifest.name, version: a.manifest.version, runtime }, manifestSha256: digest,
      source: a.artifact, uploadState: 'ready', release: { packageKey: a.packageKey, manifestSha256: digest, sourceSha256: a.artifact.sha256, runtime, timeoutSeconds: a.manifest.execution.timeoutSeconds } };
  };
  return async download => {
    const agent = await read();
    if (!download) return { agent };
    if (agent.source.bytes > 2 * 1024 * 1024) throw new InstallError('配布コードの容量が実行上限を超えています。', 413);
    const source = await fetcher(`${base}/api/noah/releases/${encodeURIComponent(agent.release.packageKey)}/source?manifest=${digest}`, options());
    if (!source.ok) throw new InstallError('配布コードの取得権を確認できません。', source.status);
    if (!source.body || source.headers.get('x-content-sha256') !== agent.source.sha256 || source.headers.get('x-noah-package-manifest') !== digest) throw new InstallError('配布コードの固定版を照合できません。', 409);
    const reader = source.body.getReader(), chunks = []; let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new InstallError('配布コードの容量が上限を超えました。', 413); } chunks.push(value); }
    if (size !== agent.source.bytes) throw new InstallError('配布コードの容量が一致しません。', 409);
    const after = await read();
    if (JSON.stringify(after) !== JSON.stringify(agent)) throw new InstallError('配布版の条件が変わりました。', 409);
    return { agent, bytes: Buffer.concat(chunks) };
  };
}
