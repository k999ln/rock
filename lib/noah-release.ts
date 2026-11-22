import { noahAgentStore } from './noah-agent-store.ts';
import { noahUploadId, NoahAgentError } from './noah-agent-upload.ts';
import { noahArtifactKey, parseNoahArtifact, verifiedArtifactBytes, type NoahArtifact } from './noah-artifact.ts';
import { skyCommerceStore, type CommerceMode } from './sky-commerce-store.ts';
import { parseSkyToolPackage, skyToolPackageSha256, skyToolPackageKey } from './sky-tool-package.ts';
import { includedSkyPackage } from './sky-package-entitlement.ts';
import { releaseAgentId, isReleasePackageKey } from './noah-release-contract.mjs';
import { ownerScopeFor } from './owner-intent.ts';

type Bucket = Pick<R2Bucket, 'get' | 'put'>;
type Database = Pick<D1Database, 'prepare' | 'batch'>;
export function noahPublicationSourceReference(value: unknown) {
  const v = value as Record<string, unknown>;
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== 3 || !['id', 'manifestSha256', 'sourceSha256'].every(k => k in v) ||
    typeof v.manifestSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(v.manifestSha256) || typeof v.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(v.sourceSha256)) throw new NoahAgentError('出品する登録版を選択してください。');
  return { id: noahUploadId(v.id), manifestSha256: v.manifestSha256, sourceSha256: v.sourceSha256 };
}
export async function stageNoahReleaseSource(deps: { db: Pick<D1Database, 'prepare'>; bucket?: Bucket }, owner: string, value: unknown): Promise<NoahArtifact> {
  const v = noahPublicationSourceReference(value);
  const store = noahAgentStore(deps.db, owner), upload = await store.get(v.id);
  if (!upload || upload.uploadState !== 'ready' || !upload.source || upload.manifestSha256 !== v.manifestSha256 || upload.source.sha256 !== v.sourceSha256) throw new NoahAgentError('出品する本人の登録版が見つからないか、内容が変わりました。', 409);
  const artifact = parseNoahArtifact({ schema: 'noah-source/1', uploadId: upload.id, uploadManifestSha256: upload.manifestSha256,
    ...upload.source, originalSha256: upload.original?.sha256 ?? upload.source.sha256,
    ...(upload.manifest.runtime ? { runtime: upload.manifest.runtime } : {}) });
  const sourceKey = await store.sourceKey(upload.id), object = sourceKey && await deps.bucket?.get(sourceKey);
  if (!object || !deps.bucket) throw new NoahAgentError('登録したファイルを取得できません。', 503);
  const bytes = await verifiedArtifactBytes(object, artifact);
  // A publication keeps its immutable bytes even if the private registration is removed.
  // Storage keys never arrive from a browser, and are not disclosed in manifests.
  await deps.bucket.put(await noahArtifactKey(owner, artifact.sha256), bytes, { httpMetadata: { contentType: 'application/octet-stream' } });
  return artifact;
}

export type NoahReleaseDependencies = { db: Database; mode?: CommerceMode; serviceOfferProfiles?: string };
export async function authorizedNoahRelease(deps: NoahReleaseDependencies, owner: string, packageKey: string, expected: string, execution = false) {
  if (!isReleasePackageKey(packageKey) || !/^[a-f0-9]{64}$/.test(expected)) throw new NoahAgentError('取得する配布版を確認してください。');
  const store = skyCommerceStore(deps.db);
  const pkg = await store.package(packageKey);
  if (!pkg || pkg.manifestSha256 !== expected) throw new NoahAgentError('配布版が見つかりません。', 404);
  const manifest = parseSkyToolPackage(JSON.parse(pkg.manifest));
  if (skyToolPackageKey(manifest) !== packageKey || await skyToolPackageSha256(manifest) !== expected) throw new NoahAgentError('配布版の定義が変わりました。', 409);
  const artifact = manifest.source.artifact;
  if (!artifact) throw new NoahAgentError('この版には配布ファイルがありません。', 404);
  if ((execution || pkg.userId !== owner) && !pkg.installable) throw new NoahAgentError('この版の配布が停止しているか、審査の確認が必要です。', 409);
  if (pkg.userId !== owner && manifest.pricing.model !== 'free' && !await includedSkyPackage(deps.db, owner, packageKey, deps.serviceOfferProfiles, expected)) {
    if (!deps.mode) throw new NoahAgentError('利用権の確認先が未設定です。', 503);
    const order = await store.activeOrder(owner, packageKey, deps.mode);
    if (!order || order.buyerUserId !== owner || order.manifestSha256 !== expected || !await store.access(order)) throw new NoahAgentError('この配布版の有効な購入利用権が必要です。', 403);
  }
  if (execution && !artifact.runtime) throw new NoahAgentError('この版には画面なし実行の定義がありません。', 422);
  return { pkg, manifest, artifact };
}

export function createNoahReleaseApi(deps: NoahReleaseDependencies & { authenticate: (r: Request) => Promise<string>; bucket?: Pick<R2Bucket, 'get'> }) {
  const failure = (e: unknown) => {
    const status = e instanceof NoahAgentError ? e.status : e instanceof Error && e.message === 'UNAUTHORIZED' ? 401 : 503;
    return Response.json({ error: e instanceof NoahAgentError ? e.message : status === 401 ? 'サインインしてください。' : '配布ファイルの利用権を確認できません。' }, { status, headers: { 'Cache-Control': 'no-store' } });
  };
  return {
    async describe(request: Request) {
      try {
        const owner = await deps.authenticate(request), digest = new URL(request.url).searchParams.get('manifest');
        if (!digest || !releaseAgentId(digest)) throw new NoahAgentError('配布版を選択してください。');
        const rows = await deps.db.prepare('SELECT package_key AS packageKey FROM sky_tool_packages WHERE manifest_sha256=? LIMIT 2').bind(digest).all<{ packageKey: string }>();
        if (rows.results.length !== 1) throw new NoahAgentError('配布版が見つかりません。', 404);
        const { pkg, manifest, artifact } = await authorizedNoahRelease(deps, owner, rows.results[0].packageKey, digest, true);
        return Response.json({ release: { id: releaseAgentId(digest), packageKey: pkg.packageKey, manifestSha256: digest, manifest, artifact }, ownerScope: await ownerScopeFor(owner) }, { headers: { 'Cache-Control': 'no-store, private' } });
      } catch (e) { return failure(e); }
    },
    async download(request: Request, packageKey: string) {
      try {
        const owner = await deps.authenticate(request), expected = new URL(request.url).searchParams.get('manifest');
        if (!expected) throw new NoahAgentError('取得する配布版を確認してください。');
        async function authorized() {
          return authorizedNoahRelease(deps, owner, packageKey, expected!);
        }
        const { pkg, artifact } = await authorized();
        const object = await deps.bucket?.get(await noahArtifactKey(pkg.userId, artifact.sha256));
        if (!object) throw new NoahAgentError('配布ファイルを取得できません。', 503);
        const bytes = await verifiedArtifactBytes(object, artifact);
        // A refund/revocation while storage was loading must not grant a new download.
        await authorized();
        return new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store, private',
          'Content-Disposition': `attachment; filename="agent-source"; filename*=UTF-8''${encodeURIComponent(artifact.name)}`,
          'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'X-Content-SHA256': artifact.sha256, 'X-Noah-Package-Manifest': expected } });
      } catch (e) {
        return failure(e);
      }
    },
  };
}
