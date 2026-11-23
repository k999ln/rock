import { createNoahLocalRequest } from './noah-local-api.mjs';
import { readNoahSourceBytes, NOAH_SOURCE_DOWNLOAD_LIMIT } from './noah-source-bytes.mjs';
import { InstallError } from './noah-source-fetch.mjs';
import { isReleaseAgentId, isReleasePackageKey } from '../lib/noah-release-contract.mjs';
import { parseNoahRuntime } from '../lib/noah-runtime-contract.mjs';

// Called only after the loopback socket/Host/Origin checks. No remote URL or
// credential supplied by an Agent is used as a destination.
export function releaseSourceLoader(incoming, scope, id, getOwner, fetcher = fetch) {
  if (!isReleaseAgentId(id)) throw new InstallError('配布版の識別名を確認してください。', 400);
  const digest = id.slice(8), request = createNoahLocalRequest(incoming, fetcher);
  const read = async () => {
    const owner = await getOwner(incoming);
    if (!owner.localHostOwner || owner.ownerScope !== scope) throw new InstallError('本人の接続が変わりました。', 403);
    const r = await request(`/api/noah/releases?manifest=${digest}`);
    const data = await r.json();
    if (!r.ok) throw new InstallError(data.error || '配布版の利用権を確認できません。', r.status);
    const a = data.release;
    if (data.ownerScope !== scope || a?.id !== id || a.manifestSha256 !== digest || !isReleasePackageKey(a.packageKey) ||
      !a.artifact || !a.manifest || JSON.stringify(a.artifact) !== JSON.stringify(a.manifest.source?.artifact)) throw new InstallError('配布版の照合情報を確認できません。', 409);
    const runtime = parseNoahRuntime(a.artifact.runtime);
    return { id, manifest: { name: a.manifest.name, version: a.manifest.version, runtime }, manifestSha256: digest,
      source: a.artifact, uploadState: 'ready', release: { packageKey: a.packageKey, manifestSha256: digest, sourceSha256: a.artifact.sha256, runtime, timeoutSeconds: a.manifest.execution.timeoutSeconds } };
  };
  return async download => {
    const agent = await read();
    if (!download) return { agent };
    if (agent.source.bytes > NOAH_SOURCE_DOWNLOAD_LIMIT) throw new InstallError('配布コードの容量が実行上限を超えています。', 413);
    const source = await request(`/api/noah/releases/${encodeURIComponent(agent.release.packageKey)}/source?manifest=${digest}`);
    if (!source.ok) throw new InstallError('配布コードの取得権を確認できません。', source.status);
    if (!source.body || source.headers.get('x-content-sha256') !== agent.source.sha256 || source.headers.get('x-noah-package-manifest') !== digest) throw new InstallError('配布コードの固定版を照合できません。', 409);
    const bytes = await readNoahSourceBytes(source, agent.source.bytes, { oversized: '配布コードの容量が上限を超えました。', mismatch: '配布コードの容量が一致しません。' });
    const after = await read();
    if (JSON.stringify(after) !== JSON.stringify(agent)) throw new InstallError('配布版の条件が変わりました。', 409);
    return { agent, bytes };
  };
}
